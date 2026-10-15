import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpAuthContext } from "@/lib/mcpAuth";
import {
  getMcpProfile,
  McpProfileError,
  type McpProfileReader,
} from "@/lib/mcpProfiles";
import { profileSelectorSchema } from "@/lib/mcpPersonalTools";
import { calculateMcpDirections } from "@/lib/mcpDirections";
import {
  calculateTimeSlots,
  timeSlotsInputSchema,
  TimeSlotsError,
} from "@/lib/timeSlots";
import { timeSlotsOutputSchema } from "@/lib/mcpTimeTools";
import { todayInJapan } from "@/utils/japanDate";

const profileIdentity = z.strictObject({ id: z.string(), name: z.string() });
const source = z.enum(["explicit", "preset", "account", "default"]);
const modes = z.enum([
  "composite",
  "personal_kigaku",
  "personal_bazi",
  "environmental",
]);
const tenchusatsu = z.enum([
  "strict",
  "month_day",
  "day_only",
  "weaken",
  "off",
]);
const warnings = z.array(
  z.strictObject({ code: z.string(), message: z.string() }),
);
const deviceWarning = {
  code: "CLOUD_SETTINGS_ONLY",
  message: "クラウド保存値だけを使用します。端末内だけの設定は再現しません。",
};
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
export const personalDirectionsOutputSchema = z.strictObject({
  date: z.iso.date(),
  weekday: z.number().int().min(0).max(6),
  rokuyo: z.string(),
  tags: z.array(z.string()),
  blockedByTenchusatsu: z.boolean(),
  honmeiStar: z.number().int().min(1).max(9),
  voidZodiacs: z.array(z.string()),
  tenchusatsuMode: tenchusatsu,
  directions: z
    .array(
      z.strictObject({
        direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
        label: z.string(),
        tier: z.enum(["S", "A", "B", "C", "D", "X"]),
        status: z.string(),
        yearLayer: z.string(),
        monthLayer: z.string(),
        dayLayer: z.string(),
        isTripleAuspicious: z.boolean(),
        hasTendo: z.boolean(),
        isDoyouSatsu: z.boolean(),
      }),
    )
    .length(8),
  tiers: z.string(),
  profile: profileIdentity,
  configUpdatedAt: z.iso.datetime().nullable(),
  calculationModel: z.literal("mcp-daily-directions-v1"),
  settingsUsed: z.strictObject({
    useClassicalBoard: z.literal(true),
    birthDateInterpretation: z.enum([
      "date-only-jst-noon",
      "datetime-jst-default",
    ]),
    directionFilterMode: modes,
    tenchusatsuMode: tenchusatsu,
    involuntaryMove: z.boolean(),
  }),
  settingsSources: z.strictObject({
    useClassicalBoard: source,
    directionFilterMode: source,
    tenchusatsuMode: source,
    involuntaryMove: source,
  }),
  warnings,
});
export const personalTimeSlotsOutputSchema = timeSlotsOutputSchema.extend({
  profile: profileIdentity.optional(),
  configUpdatedAt: z.iso.datetime().nullable().optional(),
  settingsSources: z.strictObject({
    useClassicalBoard: source,
    voidZodiacOverride: source,
  }),
});
const personalTimeInput = timeSlotsInputSchema
  .extend({
    profile: profileSelectorSchema.optional(),
    birthDate: timeSlotsInputSchema.shape.birthDate.optional(),
    lat: timeSlotsInputSchema.shape.lat.optional(),
    lon: timeSlotsInputSchema.shape.lon.optional(),
  })
  .superRefine((v, ctx) => {
    const hasExplicit =
      v.birthDate !== undefined || v.lat !== undefined || v.lon !== undefined;
    if (
      v.profile
        ? hasExplicit
        : v.birthDate === undefined ||
          v.lat === undefined ||
          v.lon === undefined
    )
      ctx.addIssue({
        code: "custom",
        message: "Specify profile OR all calculation inputs",
      });
  });
function result(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}
function failure(error: unknown) {
  const code =
    error instanceof McpProfileError || error instanceof TimeSlotsError
      ? error.code
      : "TEMPORARILY_UNAVAILABLE";
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: {
            code,
            message: code,
            ...(error instanceof McpProfileError &&
            error.code === "AMBIGUOUS_PROFILE"
              ? { candidates: error.candidates }
              : {}),
          },
        }),
      },
    ],
  };
}

/** 未接続。認証済みの1要求専用serverへ登録。公開timeツールとは同時登録しない。 */
export function registerPersonalCalculationTools(
  server: McpServer,
  auth: McpAuthContext,
  requestedAt = new Date(),
  read?: McpProfileReader,
) {
  const context = {
    userId: auth.userId,
    allowedProfileIds: [...auth.allowedProfileIds],
  };
  const startedAt = new Date(requestedAt.getTime());
  server.registerTool(
    "judge_profile_directions",
    {
      description:
        "許可したクラウドプロフィールで日の八方位を判定します。既存MCPの日判定と同じ古典方式です。刻別方位は計算しません。独自空亡override・未対応設定は拒否し、端末専用設定は再現しません。出生日時や座標は返しません。",
      inputSchema: z.strictObject({
        profile: profileSelectorSchema,
        date: timeSlotsInputSchema.shape.date,
        tenchusatsuMode: tenchusatsu.optional(),
        involuntaryMove: z.boolean().optional(),
        directionFilterMode: modes.optional(),
      }),
      outputSchema: personalDirectionsOutputSchema,
      annotations,
    },
    async (input) => {
      try {
        const p = await getMcpProfile(
          context,
          {
            profile: input.profile,
            includeCalculationInputs: true,
          },
          read,
        );
        if (!p.calculationInputs)
          throw new McpProfileError("PROFILE_INCOMPLETE");
        // 保存された非対応モードを明示上書きで黙って隠すこともしない。
        if (
          p.settings.voidZodiacOverride ||
          !modes.safeParse(p.settings.directionFilterMode).success
        )
          throw new McpProfileError("UNSUPPORTED_SETTINGS");
        const directionFilterMode = modes.parse(
          input.directionFilterMode ?? p.settings.directionFilterMode,
        );
        const date = input.date ?? todayInJapan(startedAt);
        if (!timeSlotsInputSchema.shape.date.safeParse(date).success)
          throw new McpProfileError("INVALID_INPUT");
        const calculated = calculateMcpDirections(
          { ...p.calculationInputs, ...input, date, directionFilterMode },
          startedAt,
        );
        if (!calculated.ok) throw new McpProfileError("INVALID_INPUT");
        return result(
          personalDirectionsOutputSchema.parse({
            ...calculated.payload,
            profile: { id: p.profile.id, name: p.profile.name },
            configUpdatedAt: p.configUpdatedAt,
            calculationModel: "mcp-daily-directions-v1",
            settingsUsed: {
              useClassicalBoard: true,
              birthDateInterpretation: p.calculationInputs.birthDate.includes(
                "T",
              )
                ? "datetime-jst-default"
                : "date-only-jst-noon",
              directionFilterMode,
              tenchusatsuMode: calculated.payload.tenchusatsuMode,
              involuntaryMove: input.involuntaryMove ?? false,
            },
            settingsSources: {
              useClassicalBoard: p.settingsSources.useClassicalBoard,
              directionFilterMode:
                input.directionFilterMode === undefined
                  ? p.settingsSources.directionFilterMode
                  : "explicit",
              tenchusatsuMode:
                input.tenchusatsuMode === undefined ? "default" : "explicit",
              involuntaryMove:
                input.involuntaryMove === undefined ? "default" : "explicit",
            },
            warnings: [
              deviceWarning,
              {
                code: "DAILY_MCP_MODEL",
                message:
                  "日の方位は既存MCPの日判定です。刻の可否と組み合わせて刻別方位吉凶を合成しないでください。",
              },
            ],
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.registerTool(
    "judge_time_slots",
    {
      description:
        "許可済みprofileかbirthDate/lat/lonの明示入力のどちらかで、画面と同じ12刻の可否・空亡・九星を返します。刻別方位吉凶ではありません。日付だけの出生は画面互換のJST9時、日の方位はJST正午です。settingsの明示値を優先し、端末専用設定は読みません。",
      inputSchema: personalTimeInput,
      outputSchema: personalTimeSlotsOutputSchema,
      annotations,
    },
    async (input) => {
      try {
        if (!input.profile) {
          const explicit = {
            birthDate: input.birthDate,
            lat: input.lat,
            lon: input.lon,
            date: input.date,
            settings: input.settings,
            includeBoard: input.includeBoard,
          };
          return result(
            personalTimeSlotsOutputSchema.parse(
              calculateTimeSlots(explicit, startedAt),
            ),
          );
        }
        const p = await getMcpProfile(
          context,
          {
            profile: input.profile,
            includeCalculationInputs: true,
          },
          read,
        );
        if (!p.calculationInputs)
          throw new McpProfileError("PROFILE_INCOMPLETE");
        const settings = {
          useClassicalBoard:
            input.settings?.useClassicalBoard ?? p.settings.useClassicalBoard,
          voidZodiacOverride:
            input.settings?.voidZodiacOverride ?? p.settings.voidZodiacOverride,
        };
        const calculated = calculateTimeSlots(
          {
            ...p.calculationInputs,
            date: input.date,
            includeBoard: input.includeBoard,
            settings,
          },
          startedAt,
        );
        return result(
          personalTimeSlotsOutputSchema.parse({
            ...calculated,
            profile: { id: p.profile.id, name: p.profile.name },
            configUpdatedAt: p.configUpdatedAt,
            settingsSources: {
              useClassicalBoard:
                input.settings?.useClassicalBoard === undefined
                  ? p.settingsSources.useClassicalBoard
                  : "explicit",
              voidZodiacOverride:
                input.settings?.voidZodiacOverride === undefined
                  ? p.settingsSources.voidZodiacOverride
                  : "explicit",
            },
            warnings: [...calculated.warnings, deviceWarning],
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
}

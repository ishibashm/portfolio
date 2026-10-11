import { z } from "zod";
import prisma from "@/lib/prisma";
import { timeSlotsInputSchema } from "@/lib/timeSlots";
import {
  DIRECTION_FILTER_MODES,
  parseDirectionFilterMode,
} from "@/utils/directionFilterMode";

export class McpProfileError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "PROFILE_NOT_FOUND"
      | "AMBIGUOUS_PROFILE"
      | "PROFILE_INCOMPLETE"
      | "UNSUPPORTED_SETTINGS"
      | "TEMPORARILY_UNAVAILABLE",
    public readonly candidates?: { id: string; name: string }[],
  ) {
    super(code);
    this.name = "McpProfileError";
  }
}

const identity = z.object({
  id: z.string().min(1).max(512),
  name: z.string().min(1).max(100),
  active: z.boolean().optional(),
});
const contextSchema = z.strictObject({
  userId: z.uuid(),
  allowedProfileIds: z.array(z.string().min(1).max(512)).max(100),
});
/** 認証・grant確認済みの内部呼出し専用。ツール引数から生成しない。 */
export type McpProfileContext = z.infer<typeof contextSchema>;
const selector = z.union([
  z.strictObject({ id: identity.shape.id }),
  z.strictObject({ name: identity.shape.name }),
]);
const accountSchema = z.strictObject({
  use_classical_board: z.literal(true).optional(),
  physical_month_mode: z.enum(["coupled", "independent"]).optional(),
  direction_filter_mode: z.enum(DIRECTION_FILTER_MODES).optional(),
  action_intent: z.literal("DEFAULT").optional(),
  zodiac_time_basis: z.enum(["standard", "solar"]).optional(),
});
const storedInputs = z
  .object({
    birthDate: timeSlotsInputSchema.shape.birthDate,
    baseLat: timeSlotsInputSchema.shape.lat,
    baseLon: timeSlotsInputSchema.shape.lon,
    birthLat: z.number().min(-90).max(90).optional(),
    birthLon: z.number().min(-180).max(180).optional(),
  })
  .refine((v) => (v.birthLat === undefined) === (v.birthLon === undefined));
const storedSettings = z.object({
  voidZodiacOverride:
    timeSlotsInputSchema.shape.settings.unwrap().shape.voidZodiacOverride,
  // wealth専用設定を別の意味の計算へ黙って持ち込まない。
  engineType: z.literal("classical").optional(),
  layerMode: z.literal("day").optional(),
});

async function readSelected(context: McpProfileContext) {
  const checked = contextSchema.safeParse(context);
  if (!checked.success) throw new McpProfileError("INVALID_INPUT");
  let row;
  try {
    row = await prisma.user_configs.findFirst({
      where: { user_id: checked.data.userId },
      select: { presets: true, metaphysical_config: true, updated_at: true },
    });
  } catch {
    // Prismaの生例外には値が入る可能性がある。causeにも残さない。
    throw new McpProfileError("TEMPORARILY_UNAVAILABLE");
  }
  const raw = row?.presets ?? [];
  if (!Array.isArray(raw) || raw.length > 100)
    throw new McpProfileError("PROFILE_INCOMPLETE");
  const allowed = new Set(checked.data.allowedProfileIds);
  const ids = new Set<string>();
  const profiles = raw.flatMap((value) => {
    const parsed = identity.safeParse(value);
    if (!parsed.success) throw new McpProfileError("PROFILE_INCOMPLETE");
    if (!allowed.has(parsed.data.id)) return [];
    if (ids.has(parsed.data.id))
      throw new McpProfileError("PROFILE_INCOMPLETE");
    ids.add(parsed.data.id);
    return [
      {
        identity: { ...parsed.data, active: parsed.data.active ?? null },
        raw: value,
      },
    ];
  });
  return {
    profiles,
    account: row?.metaphysical_config ?? {},
    configUpdatedAt: row?.updated_at.toISOString() ?? null,
  };
}

function inspect(raw: unknown, account: unknown) {
  const inputs = storedInputs.safeParse(raw);
  const preset = storedSettings.safeParse(raw);
  const config = accountSchema.safeParse(account);
  const missingFields: string[] = [];
  if (!inputs.success) {
    // 入力値やzodのメッセージを応答へ含めない。
    for (const issue of inputs.error.issues) {
      const key = String(issue.path[0] ?? "birthPlace");
      if (!missingFields.includes(key)) missingFields.push(key);
    }
  }
  if (!preset.success || !config.success) missingFields.push("settings");
  return {
    inputs,
    preset,
    config,
    missingFields,
    readyForCalculation: missingFields.length === 0,
  };
}

export async function listMcpProfiles(
  context: McpProfileContext,
  input: unknown = {},
) {
  const parsed = z
    .strictObject({ name: identity.shape.name.optional() })
    .safeParse(input);
  if (!parsed.success) throw new McpProfileError("INVALID_INPUT");
  const data = await readSelected(context);
  return {
    profiles: data.profiles
      .filter(
        (p) =>
          parsed.data.name === undefined ||
          p.identity.name === parsed.data.name,
      )
      .map((p) => {
        const state = inspect(p.raw, data.account);
        return {
          ...p.identity,
          readyForCalculation: state.readyForCalculation,
          missingFields: state.missingFields,
        };
      }),
    storage: "cloud" as const,
    configUpdatedAt: data.configUpdatedAt,
  };
}

export async function getMcpProfile(
  context: McpProfileContext,
  input: unknown,
) {
  const parsed = z
    .strictObject({
      profile: selector,
      includeCalculationInputs: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) throw new McpProfileError("INVALID_INPUT");
  const data = await readSelected(context);
  const selected = parsed.data.profile;
  const matches = data.profiles.filter((p) =>
    "id" in selected
      ? p.identity.id === selected.id
      : p.identity.name === selected.name,
  );
  if (!matches.length) throw new McpProfileError("PROFILE_NOT_FOUND");
  if (matches.length > 1)
    throw new McpProfileError(
      "AMBIGUOUS_PROFILE",
      matches.map((p) => ({ id: p.identity.id, name: p.identity.name })),
    );
  const p = matches[0];
  const state = inspect(p.raw, data.account);
  if (!state.config.success || !state.preset.success)
    throw new McpProfileError("UNSUPPORTED_SETTINGS");
  if (parsed.data.includeCalculationInputs && !state.inputs.success)
    throw new McpProfileError("PROFILE_INCOMPLETE");
  const account = state.config.data;
  const preset = state.preset.data;
  return {
    profile: p.identity,
    storage: "cloud" as const,
    readyForCalculation: state.readyForCalculation,
    missingFields: state.missingFields,
    // true/standardはSolarTimeClockの初期値。方位の既定は共通parserに委譲。
    settings: {
      useClassicalBoard: account.use_classical_board ?? true,
      voidZodiacOverride: preset.voidZodiacOverride ?? "",
      zodiacTimeBasis: account.zodiac_time_basis ?? "standard",
      directionFilterMode: parseDirectionFilterMode(
        account.direction_filter_mode,
      ),
    },
    settingsSources: {
      useClassicalBoard:
        account.use_classical_board === undefined ? "default" : "account",
      voidZodiacOverride:
        preset.voidZodiacOverride === undefined ? "default" : "preset",
      zodiacTimeBasis:
        account.zodiac_time_basis === undefined ? "default" : "account",
      directionFilterMode:
        account.direction_filter_mode === undefined ? "default" : "account",
    },
    configUpdatedAt: data.configUpdatedAt,
    ...(parsed.data.includeCalculationInputs && state.inputs.success
      ? {
          calculationInputs: {
            birthDate: state.inputs.data.birthDate,
            lat: state.inputs.data.baseLat,
            lon: state.inputs.data.baseLon,
          },
        }
      : {}),
  };
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  calculateTimeSlots,
  timeSlotsInputSchema,
  TimeSlotsError,
} from "@/lib/timeSlots";

import {
  calculateTimeDirections,
  timeDirectionsInputSchema,
  timeDirectionsOutputSchema,
} from "@/lib/timeDirections";

const star = z.strictObject({
  number: z.number().int().min(1).max(9),
  name: z.string(),
});
const element = z
  .strictObject({
    id: z.enum(["Water", "Earth", "Wood", "Metal", "Fire"]),
    name: z.string(),
  })
  .nullable();
const timestamp = z.iso.datetime({ offset: true });
export const timeSlotsOutputSchema = z.strictObject({
  date: z.iso.date(),
  timezone: z.literal("Asia/Tokyo"),
  source: z.literal("Cloud Palette"),
  sourceUrl: z.literal("https://cloud-palette.com/relocation/dashboard"),
  calculationModel: z.literal("dashboard-time-slots-v1"),
  settingsUsed: z.strictObject({
    useClassicalBoard: z.literal(true),
    voidZodiacSource: z.enum(["override", "birth"]),
    birthDateInterpretation: z.enum([
      "date-only-utc-midnight",
      "datetime-jst-default",
    ]),
  }),
  settingsSources: z.strictObject({
    useClassicalBoard: z.enum(["default", "explicit"]),
    voidZodiacOverride: z.enum(["default", "explicit"]),
  }),
  slotBoundaryBasis: z.literal("true-solar-time-noon-correction"),
  directionJudgment: z.literal("not_provided_by_time_table"),
  coverage: z.strictObject({ start: timestamp, end: timestamp }),
  slots: z
    .array(
      z.strictObject({
        index: z.number().int().min(0).max(11),
        branch: z.string(),
        stemBranch: z.string(),
        start: timestamp,
        end: timestamp,
        hourStar: star,
        status: z.enum(["void", "favorable", "neutral"]),
        label: z.enum(["天中殺", "動いてよい", "ふつう"]),
        isVoid: z.boolean(),
        isElementFavorable: z.boolean(),
        relation: z.string().nullable(),
        myElement: element,
        timeElement: element,
        board: z
          .strictObject({
            SE: star,
            S: star,
            SW: star,
            E: star,
            CENTER: star,
            W: star,
            NE: star,
            N: star,
            NW: star,
          })
          .optional(),
      }),
    )
    .length(12),
  warnings: z.array(z.strictObject({ code: z.string(), message: z.string() })),
});

/** 公開用。strict schema 自体を渡し、SDK が未知の selector を strip しない。 */
export function registerPublicTimeTools(server: McpServer) {
  server.registerTool(
    "judge_hourly_directions",
    {
      title: "12刻の八方位の吉凶とラッキーカラー",
      description:
        "日付から真太陽時の12刻ごとの時盤・八方位の吉凶・ラッキーカラーを返します。刻の区切りと九星はjudge_time_slotsと同じ既存計算です。location（lat/lon）省略時は名古屋。本命星honmeiStarか生年月日birthDateは任意・同時指定不可。未指定時は共通の五黄殺・暗剣殺のみ凶、その他は未判定のneutral。指定時は既存の本命殺・本命的殺・相性判定も適用。五黄殺と暗剣殺は誰にとっても凶。色の根拠はサイト既存のsrc/utils/kigaku.tsのKYUSEI.color（時盤中宮の九星の色）で、個人別の吉色ではありません。時盤単独で、年・月・日盤、時破、空亡は合成しません。対応年1900〜2099、場所は緯度20〜46・経度122〜154。保存プロフィールや端末設定は読みません。",
      inputSchema: timeDirectionsInputSchema,
      outputSchema: timeDirectionsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async (input) => {
      try {
        const payload = calculateTimeDirections(input);
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error:
                  error instanceof z.ZodError
                    ? "INVALID_INPUT"
                    : "TEMPORARILY_UNAVAILABLE",
              }),
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "judge_time_slots",
    {
      title: "画面と同じ12刻の可否と九星を調べる",
      description:
        "生年月日・緯度・経度を明示して1日12刻の空亡優先の可否を返します。刻別の方位吉凶ではありません。日の方位は judge_directions を使用。対象日は省略時JSTの今日、暦は1900〜2099年、緯度20〜46・経度122〜154（国内領域の厳密判定ではありません）。古典のみ。日付だけの出生は画面互換のJST 9時で、日判定の正午と異なります。端末設定・保存プロフィールは読みません。includeBoard=trueで九星配置を追加します。",
      inputSchema: timeSlotsInputSchema,
      outputSchema: timeSlotsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const payload = timeSlotsOutputSchema.parse(calculateTimeSlots(input));
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      } catch (error) {
        const code =
          error instanceof TimeSlotsError
            ? error.code
            : "TEMPORARILY_UNAVAILABLE";
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: code }) }],
        };
      }
    },
  );
}

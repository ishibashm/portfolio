import { z } from "zod";
import {
  calculateVectorCollision,
  EIGHT_DIRECTIONS,
  generateBoard,
  getHonmeiStar,
  type StarFrequency,
} from "@/utils/ephemerisEngine";
import { getKyusei } from "@/utils/kigaku";
import { parseJapanDateTime } from "@/utils/japanDate";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";

const date = z.iso
  .date()
  .refine(
    (v) => Number(v.slice(0, 4)) >= 1900 && Number(v.slice(0, 4)) <= 2099,
  );
export const timeDirectionsInputSchema = z
  .strictObject({
    date,
    location: z
      .strictObject({
        lat: z.number().min(20).max(46),
        lon: z.number().min(122).max(154),
      })
      .optional()
      .describe(
        "省略時は名古屋（35.1815, 136.9064）。検索結果のlat/lonを指定できます。",
      ),
    honmeiStar: z.number().int().min(1).max(9).optional(),
    birthDate: date
      .optional()
      .describe(
        "YYYY-MM-DD。judge_time_slots と同じJST9時の解釈。honmeiStarとの同時指定不可。",
      ),
  })
  .refine((v) => !(v.honmeiStar !== undefined && v.birthDate !== undefined), {
    message: "本命星か生年月日のいずれか一方を指定してください。",
  });

const star = z.strictObject({
  number: z.number().int().min(1).max(9),
  name: z.string(),
});
const timestamp = z.iso.datetime({ offset: true });
export const timeDirectionsOutputSchema = z.strictObject({
  date: z.iso.date(),
  timezone: z.literal("Asia/Tokyo"),
  location: z.strictObject({ lat: z.number(), lon: z.number() }),
  honmeiStar: z.number().int().min(1).max(9).nullable(),
  slotBoundaryBasis: z.literal("true-solar-time-noon-correction"),
  judgmentScope: z.literal("hour-board-only"),
  colorBasis: z.literal("KYUSEI.color of hourStar"),
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
        luckyColor: z.string(),
        directions: z
          .array(
            z.strictObject({
              direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]),
              label: z.string(),
              star,
              status: z.enum(["favorable", "neutral", "unfavorable"]),
              reason: z.enum([
                "OPTIMAL",
                "SAFE",
                "NOISE_GOU",
                "NOISE_ANKEN",
                "NOISE_HONMEI",
                "NOISE_TEKI",
              ]),
            }),
          )
          .length(8),
      }),
    )
    .length(12),
  warnings: z.array(z.string()),
});
const timestampJst = (d: Date) =>
  new Date(d.getTime() + 9 * 3_600_000).toISOString().replace("Z", "+09:00");
const projectStar = (n: number) => ({ number: n, name: getKyusei(n).japanese });

export function calculateTimeDirections(input: unknown) {
  const args = timeDirectionsInputSchema.parse(input);
  const location = args.location ?? { lat: 35.1815, lon: 136.9064 };
  const honmeiStar = (args.honmeiStar ??
    (args.birthDate
      ? getHonmeiStar(parseJapanDateTime(args.birthDate)).classical
      : null)) as StarFrequency | null;
  const slots = getDailySolarSchedule(
    new Date(`${args.date}T12:00:00+09:00`),
    location.lon,
  ).map((item, index) => {
    const board = generateBoard(item.kyusei.number as StarFrequency);
    // targetDate/空亡を渡さず、既存エンジンの単盤判定だけを使う。
    // 未指定時の仮の本命星による判定は下で捨て、共通の凶殺だけを残す。
    const layer = calculateVectorCollision(
      honmeiStar ?? 5,
      board,
      board,
      board,
    ).dayLayer;
    return {
      index,
      branch: item.japanese,
      stemBranch: item.etoKanji,
      start: timestampJst(item.startStandard),
      end: timestampJst(item.endStandard),
      hourStar: projectStar(item.kyusei.number),
      luckyColor: getKyusei(item.kyusei.number).color,
      directions: EIGHT_DIRECTIONS.map((direction) => {
        const raw = layer[direction]!;
        const reason =
          honmeiStar === null && raw !== "NOISE_GOU" && raw !== "NOISE_ANKEN"
            ? "SAFE"
            : raw;
        return {
          direction,
          label: DIRECTION_LABELS[direction],
          star: projectStar(board[direction]),
          status:
            reason === "OPTIMAL"
              ? "favorable"
              : reason === "SAFE"
                ? "neutral"
                : "unfavorable",
          reason,
        };
      }),
    };
  });
  return timeDirectionsOutputSchema.parse({
    date: args.date,
    timezone: "Asia/Tokyo",
    location,
    honmeiStar,
    slotBoundaryBasis: "true-solar-time-noon-correction",
    judgmentScope: "hour-board-only",
    colorBasis: "KYUSEI.color of hourStar",
    coverage: { start: slots[0].start, end: slots[11].end },
    slots,
    warnings: [
      "時盤単独の判定です。年・月・日盤、時破、空亡は合成しません。日の方位はjudge_directions、刻の可否はjudge_time_slotsで確認してください。",
      "前日夜から当日夜までの12刻です。当日夜の残りには翌日の表が必要です。緯度は検証のみで刻計算には使いません。",
      "ラッキーカラーは時盤中宮の九星の既存色です。個人別の吉色や凶殺を打ち消す色ではありません。",
      ...(honmeiStar === null
        ? [
            "本命星未指定のため、五黄殺・暗剣殺以外はneutral（個人の吉凶は未判定）です。",
          ]
        : []),
    ],
  });
}

import { z } from "zod";
import { evaluateTimePhase, isVoidTimeHour } from "@/lib/timePhase";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { parseJapanDateTime, todayInJapan } from "@/utils/japanDate";
import { getKyuseiBoard } from "@/utils/kigaku";
import { getDailySolarSchedule } from "@/utils/solarTime";

const supportedYear = (value: string) => {
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 2099;
};
const calendarDate = z.iso.date().refine(supportedYear);
const birthDate = z
  .union([
    z.iso.date(),
    z.iso.datetime({ offset: true, local: true }),
    // Keep the existing minute-precision offset contract after Zod hardening.
    z.iso.datetime({ offset: true, local: true, precision: -1 }),
  ])
  .refine(supportedYear);

/** 公開用の明示入力。未知の設定や個人用selectorを黙って捨てない。 */
export const timeSlotsInputSchema = z.strictObject({
  birthDate,
  lat: z.number().min(20).max(46),
  lon: z.number().min(122).max(154),
  date: calendarDate.optional(),
  settings: z
    .strictObject({
      useClassicalBoard: z.boolean().optional(),
      voidZodiacOverride: z
        .string()
        .refine(
          (value) =>
            value === "" ||
            (/^[子丑寅卯辰巳午未申酉戌亥]{2}$/.test(value) &&
              value[0] !== value[1]),
        )
        .optional(),
    })
    .optional(),
  includeBoard: z.boolean().optional(),
});

export type TimeSlotsInput = z.infer<typeof timeSlotsInputSchema>;
export class TimeSlotsError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "UNSUPPORTED_SETTINGS") {
    // 検証エラーに出生値・座標・入力本文を混ぜない。
    super(code);
    this.name = "TimeSlotsError";
  }
}

const boardDirections = [
  "SE",
  "S",
  "SW",
  "E",
  "CENTER",
  "W",
  "NE",
  "N",
  "NW",
] as const;
type BoardDirection = (typeof boardDirections)[number];
type Star = { number: number; name: string };
const jstTimestamp = (date: Date) =>
  new Date(date.getTime() + 9 * 3_600_000).toISOString().replace("Z", "+09:00");

/**
 * 画面の共通関数を呼び、通信に必要な値だけ射影する。DB/React/端末設定は読まない。
 * requestedAt は要求開始時に一度だけ取得し、日付省略時にも途中で日を変えない。
 */
export function calculateTimeSlots(input: unknown, requestedAt = new Date()) {
  const parsed = timeSlotsInputSchema.safeParse(input);
  if (!parsed.success || !Number.isFinite(requestedAt.getTime())) {
    throw new TimeSlotsError("INVALID_INPUT");
  }
  const args = parsed.data;
  if (args.settings?.useClassicalBoard === false) {
    throw new TimeSlotsError("UNSUPPORTED_SETTINGS");
  }
  const date = args.date ?? todayInJapan(requestedAt);
  if (!calendarDate.safeParse(date).success)
    throw new TimeSlotsError("INVALID_INPUT");
  const birth = parseJapanDateTime(args.birthDate);
  if (!Number.isFinite(birth.getTime()))
    throw new TimeSlotsError("INVALID_INPUT");
  const honmei = getHonmeiStar(birth);
  const override = args.settings?.voidZodiacOverride;
  const voids = override ? override.split("") : getPersonalVoidZodiac(birth);
  const schedule = getDailySolarSchedule(
    new Date(`${date}T12:00:00+09:00`),
    args.lon,
  );
  const slots = schedule.map((item, index) => {
    const isVoid = isVoidTimeHour(item, voids);
    const phase = evaluateTimePhase(item, honmei, true);
    const status = isVoid ? "void" : phase.isOptimal ? "favorable" : "neutral";
    const board = args.includeBoard
      ? (Object.fromEntries(
          getKyuseiBoard(item.kyusei).map((star, i) => [
            boardDirections[i],
            { number: star.number, name: star.japanese },
          ]),
        ) as Record<BoardDirection, Star>)
      : undefined;
    return {
      index,
      branch: item.japanese,
      stemBranch: item.etoKanji,
      start: jstTimestamp(item.startStandard),
      end: jstTimestamp(item.endStandard),
      hourStar: { number: item.kyusei.number, name: item.kyusei.japanese },
      status,
      label: isVoid ? "天中殺" : phase.isOptimal ? "動いてよい" : "ふつう",
      isVoid,
      isElementFavorable: phase.isFavorable ?? false,
      relation: phase.relation,
      myElement: phase.myElement
        ? { id: phase.myElement.id, name: phase.myElement.name }
        : null,
      timeElement: phase.timeElement
        ? { id: phase.timeElement.id, name: phase.timeElement.name }
        : null,
      ...(board ? { board } : {}),
    };
  });
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(args.birthDate);
  const warnings = [
    {
      code: "TIME_TABLE_NOT_DIRECTIONS",
      message:
        "刻の可否と九星配置です。日の方位は別の方位ツールで確認してください。刻ごとの方位吉凶は提供しません。",
    },
    {
      code: "PARTIAL_CIVIL_DAY",
      message:
        "前日夜から当日夜までの12刻です。当日夜の残りには翌日の表が必要です。",
    },
    {
      code: "DEVICE_SETTINGS_NOT_USED",
      message:
        "端末内だけの設定は再現しません。緯度は検証のみで刻計算には使いません。",
    },
    ...(dateOnly
      ? [
          {
            code: "DATE_ONLY_BIRTH",
            message:
              "日付だけの出生は画面と同じJST 9時として解釈します。日判定ツールの正午解釈とは異なります。",
          },
        ]
      : []),
  ];
  return {
    date,
    timezone: "Asia/Tokyo" as const,
    source: "Cloud Palette" as const,
    sourceUrl: "https://cloud-palette.com/relocation/dashboard" as const,
    calculationModel: "dashboard-time-slots-v1" as const,
    settingsUsed: {
      useClassicalBoard: true as const,
      voidZodiacSource: override ? ("override" as const) : ("birth" as const),
      birthDateInterpretation: dateOnly
        ? ("date-only-utc-midnight" as const)
        : ("datetime-jst-default" as const),
    },
    settingsSources: {
      useClassicalBoard:
        args.settings?.useClassicalBoard === undefined
          ? ("default" as const)
          : ("explicit" as const),
      voidZodiacOverride:
        override === undefined ? ("default" as const) : ("explicit" as const),
    },
    slotBoundaryBasis: "true-solar-time-noon-correction" as const,
    directionJudgment: "not_provided_by_time_table" as const,
    coverage: { start: slots[0].start, end: slots[slots.length - 1].end },
    slots,
    warnings,
  };
}

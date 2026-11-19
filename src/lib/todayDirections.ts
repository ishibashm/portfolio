import { DIRECTIONS, STARS, STAR_NAMES } from "@/lib/kigakuContent";
import { directionLabelName, haLabelForLayer } from "@/lib/directionLabels";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { jstNoonOf } from "@/utils/boardInstant";
import {
  parseJapanDateTime,
  todayInJapan,
  toJapanDateString,
} from "@/utils/japanDate";
import { getDailySolarSchedule } from "@/utils/solarTime";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalDayStar,
  getHonmeiStar,
  type StarFrequency,
  type VectorStatus,
} from "@/utils/ephemerisEngine";

function verdicts(center: StarFrequency, star: StarFrequency, date?: Date) {
  const board = generateBoard(center);
  // Only the day layer is read; year/month placeholders do not enter the result.
  return calculateVectorCollision(
    star,
    board,
    board,
    board,
    [],
    "DEFAULT",
    date,
  ).dayLayer;
}

function summarize(layer: ReturnType<typeof verdicts>) {
  const lucky: string[] = [];
  const unlucky: string[] = [];
  const neutral: string[] = [];
  for (const direction of DIRECTIONS) {
    const status = layer[direction] ?? "SAFE";
    const label = DIRECTION_LABELS[direction];
    if (status.startsWith("NOISE_")) {
      const reason =
        status === "NOISE_HA"
          ? haLabelForLayer("day")
          : directionLabelName(status);
      unlucky.push(`${label}（${reason}）`);
    } else if (status.startsWith("OPTIMAL")) lucky.push(label);
    else neutral.push(label);
  }
  return { lucky, unlucky, neutral };
}

export function buildTodayDirections(now: Date = new Date()) {
  const date = jstNoonOf(now);
  const tomorrow = new Date(date.getTime() + 86400000);
  const center = getClassicalDayStar(date);
  const tomorrowCenter = getClassicalDayStar(tomorrow);
  // Reuse the dashboard's solar-hour schedule, with Tokyo explicitly as reference.
  const schedule = getDailySolarSchedule(date, 139.6917, 9);
  const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const timeLabel = (instant: Date) =>
    `${toJapanDateString(instant) < todayInJapan(date) ? "前日 " : ""}${timeFormatter.format(instant)}`;
  return {
    date: todayInJapan(date),
    tomorrow: todayInJapan(tomorrow),
    center,
    stars: STARS.map((value) => {
      const star = value as StarFrequency;
      const daily = verdicts(center, star, date);
      return {
        star,
        name: STAR_NAMES[star],
        today: summarize(daily),
        tomorrow: summarize(verdicts(tomorrowCenter, star, tomorrow)),
        hours: schedule.map((slot) => {
          const hourly = verdicts(slot.kyusei.number as StarFrequency, star);
          // Daily unlucky directions remain unlucky even when the hour is favorable.
          const combined = { ...hourly };
          for (const direction of DIRECTIONS) {
            if (daily[direction]?.startsWith("NOISE_"))
              combined[direction] = daily[direction] as VectorStatus;
          }
          return {
            branch: slot.japanese,
            center: slot.kyusei.japanese,
            time: `${timeLabel(slot.startStandard)}〜${timeLabel(slot.endStandard)}`,
            ...summarize(combined),
          };
        }),
      };
    }),
  };
}

/** 現在の刻。夜の最終刻を過ぎたら翌日の表から選び、日盤は今日を使う。 */
export function buildCurrentDirections(
  now = new Date(),
  birthDate?: string,
  lon = 139.6917,
) {
  const birth = birthDate ? parseJapanDateTime(birthDate) : null;
  const star =
    birth && Number.isFinite(birth.getTime())
      ? getHonmeiStar(birth).classical
      : null;
  const date = jstNoonOf(now);
  const schedule = [-1, 0, 1].flatMap((offset) =>
    getDailySolarSchedule(new Date(date.getTime() + offset * 86400000), lon, 9),
  );
  // 日ごとの正午補正には数秒の差があるため、次の刻の開始を終端にする。
  const index = schedule.findLastIndex((item) => item.startStandard <= now);
  const slot = schedule[index];
  const end = schedule[index + 1]?.startStandard ?? slot.endStandard;
  const general = (layer: ReturnType<typeof verdicts>) => {
    if (star !== null) return layer;
    return Object.fromEntries(
      Object.entries(layer).map(([direction, status]) => [
        direction,
        ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(status)
          ? status
          : "SAFE",
      ]),
    ) as ReturnType<typeof verdicts>;
  };
  const daily = general(verdicts(getClassicalDayStar(date), star ?? 5, date));
  const hourly = general(
    verdicts(slot.kyusei.number as StarFrequency, star ?? 5),
  );
  for (const direction of DIRECTIONS) {
    if (daily[direction]?.startsWith("NOISE_"))
      hourly[direction] = daily[direction];
  }
  return {
    date: todayInJapan(now),
    starName: star ? STAR_NAMES[star] : null,
    branch: slot.japanese,
    start: slot.startStandard.toISOString(),
    end: end.toISOString(),
    ...summarize(hourly),
  };
}

const COMMON_UNLUCKY = ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"] as const;

/**
 * ホームの「今日の天気と方位」用の東京基準の日盤。
 *
 * 全員に共通の凶（五黄殺・暗剣殺・日破）は、九つの本命星すべてで凶になり、
 * そのうちどれかの星で共通の凶として出る方位とする。本命星によっては同じ
 * 方位が本命殺などの名前で出るため、1 つの星だけを見て決めない。
 */
export function buildTodayBoard(now: Date = new Date()) {
  const date = jstNoonOf(now);
  const center = getClassicalDayStar(date);
  const layers = STARS.map((value) => {
    const star = value as StarFrequency;
    return { star, layer: verdicts(center, star, date) };
  });
  const common = DIRECTIONS.flatMap((direction) => {
    const statuses = layers.map(({ layer }) => layer[direction] ?? "SAFE");
    if (!statuses.every((status) => status.startsWith("NOISE_"))) return [];
    const shared = statuses.find((status) =>
      (COMMON_UNLUCKY as readonly string[]).includes(status),
    );
    if (!shared) return [];
    return [
      {
        direction,
        label: DIRECTION_LABELS[direction],
        reason:
          shared === "NOISE_HA"
            ? haLabelForLayer("day")
            : directionLabelName(shared),
      },
    ];
  });
  return {
    date: todayInJapan(date),
    center,
    board: generateBoard(center),
    common,
    stars: layers.map(({ star, layer }) => ({
      star,
      name: STAR_NAMES[star],
      lucky: DIRECTIONS.filter((direction) =>
        (layer[direction] ?? "SAFE").startsWith("OPTIMAL"),
      ),
    })),
  };
}
export type TodayBoard = ReturnType<typeof buildTodayBoard>;

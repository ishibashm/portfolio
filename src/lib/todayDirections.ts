import { DIRECTIONS, STARS, STAR_NAMES } from "@/lib/kigakuContent";
import { directionLabelName, haLabelForLayer } from "@/lib/directionLabels";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { jstNoonOf } from "@/utils/boardInstant";
import { todayInJapan, toJapanDateString } from "@/utils/japanDate";
import { getDailySolarSchedule } from "@/utils/solarTime";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalDayStar,
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

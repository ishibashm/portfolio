import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  isAuspicious,
  isInauspicious,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import { forecastAnchorMs } from "@/utils/boardInstant";
import { getDailySolarSchedule } from "@/utils/solarTime";
import { evaluateTimePhase } from "@/lib/timePhase";
import { statusInfo, STAR_NAMES, STARS } from "@/lib/kigakuContent";
import type { StarFrequency } from "@/utils/ephemerisEngine";

/**
 * /houi/today（今日の方位と時間）のサーバー計算。
 *
 * 暦エンジン（lunar-javascript）はサーバーでだけ動かし、画面には
 * 計算済みの小さな JSON だけを渡す（client に 1.2MB を配らない）。
 *
 * - 日盤の方位は `judgeDayAllDirections` の dayLayer をそのまま読む。
 *   五黄殺・暗剣殺は本命星に関係なく全員の凶（NOISE_GOU / NOISE_ANKEN）。
 * - 生年月日が無いので個人の天中殺は判定に使わない（tenchusatsuMode: "off"）。
 * - 経度は東京（139.69°E）を代表にする。刻の境目は経度で数分ずれる。
 */
export const TOKYO_LON = 139.6917;

export interface TodayStarDirections {
  star: number;
  name: string;
  good: { dir: string; jp: string }[];
  bad: { dir: string; jp: string; label: string }[];
}

export interface TodayTimeSlot {
  branch: string;
  start: string; // HH:MM（JST）
  end: string;
  hourStar: string;
  /** 本命星ごとに吉の刻か */
  favorable: Record<number, boolean>;
}

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

/** YYYY-MM-DD（JST）を n 日ずらす */
export function shiftJstDate(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T12:00:00+09:00`) + days * 86_400_000;
  return new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function dayDirectionsByStar(ymd: string): TodayStarDirections[] {
  const anchor = new Date(forecastAnchorMs(new Date(`${ymd}T12:00:00+09:00`)));
  return STARS.map((star) => {
    const all = judgeDayAllDirections(anchor, {
      honmeiStar: star as StarFrequency,
      voidZodiacs: [],
      lon: TOKYO_LON,
      tenchusatsuMode: "off",
    });
    const good: TodayStarDirections["good"] = [];
    const bad: TodayStarDirections["bad"] = [];
    for (const dir of ALL_DIRECTIONS) {
      const s = all[dir].dayLayer;
      const jp = DIRECTION_LABELS[dir];
      if (isInauspicious(s))
        bad.push({
          dir,
          jp,
          label: statusInfo(s).label === "歳破" ? "日破" : statusInfo(s).label,
        });
      else if (isAuspicious(s)) good.push({ dir, jp });
    }
    return { star, name: STAR_NAMES[star], good, bad };
  });
}

export function timeSlotsByStar(ymd: string): TodayTimeSlot[] {
  const schedule = getDailySolarSchedule(
    new Date(`${ymd}T12:00:00+09:00`),
    TOKYO_LON,
  );
  return schedule.map((item) => ({
    branch: item.japanese,
    start: hhmm(item.startStandard),
    end: hhmm(item.endStandard),
    hourStar: item.kyusei.japanese,
    favorable: Object.fromEntries(
      STARS.map((s) => [
        s,
        evaluateTimePhase(item, { classical: s }, true).isOptimal,
      ]),
    ),
  }));
}

export function formatJpDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const w = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

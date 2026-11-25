/**
 * 吉方位取りプランナー（/houi/planner）の組み立て。
 *
 * ## なぜ要るか（利用者の依頼、2026-11-25）
 *
 * 「未来の方位吉取りを自動で計画してくれる、自動までいかなくても手軽に
 * 導線がある」。日取りの道具（/calendar・/houi/relocation-calendar）は
 * 引越し向けで、生年月日・経度を入れないと何も出ない。吉方位取り
 * （日帰り・1〜2泊）を「いつ・どの方位へ・どこへ」の形で、ボタンだけで
 * 引ける面が無かった。
 *
 * ## 判定は作らない
 *
 * 日の判定は `findPurposeDaysAllDirections`（MCP の find_auspicious_days に
 * purpose を付けたときと同じ関数）をそのまま使う。方位の割り当ては
 * `directionFromBearing`（伝統区分）だけ。ここでやるのは**並べ方と行き先の
 * 添え方**だけ。
 *
 * 距離で吉凶は変えない（distanceRings の方針。流派で割れるので決めない）。
 * 行き先は近い街から遠い街までばらけるように選ぶだけで、距離は表示のみ。
 */
import { DIRECTION_UNSTABLE_KM } from "@/lib/directionDistance";
import type { CompassDirection } from "@/lib/kigakuContent";
import {
  findPurposeDaysAllDirections,
  type PurposeDay,
} from "@/utils/auspiciousDays";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import type { StarFrequency } from "@/utils/ephemerisEngine";
import { toJapanDateString } from "@/utils/japanDate";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";
import {
  PURPOSE_BOARDS,
  PURPOSE_LABELS,
  type BoardName,
} from "@/utils/tripPurpose";

export type PlannerPurpose = "daytrip" | "short_stay";
export const PLANNER_PURPOSES: readonly PlannerPurpose[] = [
  "daytrip",
  "short_stay",
];
export const PLANNER_WEEKS = [4, 8, 12] as const;
export type PlannerWeeks = (typeof PLANNER_WEEKS)[number];
export const DEFAULT_PLANNER_WEEKS: PlannerWeeks = 8;

/** 行き先の市区町村を拾う範囲。houi/area・area_directions と同じ上限。 */
export const DESTINATION_MAX_KM = 150;
/** 一宮・名勝は遠出の目的地にもなるので広めに取る。 */
export const SPOT_MAX_KM = 300;
const DESTINATIONS_PER_DIRECTION = 5;
const SPOTS_PER_DIRECTION = 3;
const DEFAULT_DAYS_PER_DIRECTION = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

type Query = Record<string, string | string[] | undefined>;

export interface PlannerQuery {
  star: StarFrequency | null;
  purpose: PlannerPurpose;
  weeks: PlannerWeeks;
  from: string | undefined;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** クエリを読む。不正な値はエラーにせず既定に落とす。 */
export function parsePlannerQuery(query: Query): PlannerQuery {
  const rawStar = single(query.star);
  const star =
    rawStar && /^[1-9]$/.test(rawStar)
      ? (Number(rawStar) as StarFrequency)
      : null;
  const rawPurpose = single(query.purpose);
  const purpose = (PLANNER_PURPOSES as readonly string[]).includes(
    rawPurpose ?? "",
  )
    ? (rawPurpose as PlannerPurpose)
    : "daytrip";
  const rawWeeks = Number(single(query.weeks));
  const weeks = (PLANNER_WEEKS as readonly number[]).includes(rawWeeks)
    ? (rawWeeks as PlannerWeeks)
    : DEFAULT_PLANNER_WEEKS;
  const rawFrom = single(query.from)?.trim();
  return { star, purpose, weeks, from: rawFrom ? rawFrom : undefined };
}

export function plannerHref(params: {
  star?: number | null;
  purpose?: PlannerPurpose;
  weeks?: number;
  from?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.star) sp.set("star", String(params.star));
  if (params.purpose) sp.set("purpose", params.purpose);
  if (params.weeks) sp.set("weeks", String(params.weeks));
  if (params.from) sp.set("from", params.from);
  const qs = sp.toString();
  return qs ? `/houi/planner?${qs}` : "/houi/planner";
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function nextDateString(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + DAY_MS);
  return next.toISOString().slice(0, 10);
}

/**
 * Google カレンダーの「予定を追加」画面への終日予定リンク。
 * リンクを作るだけで、こちらから外部へは何も送らない。
 */
export function googleCalendarUrl(input: {
  date: string;
  title: string;
  details: string;
}): string {
  const sp = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${compactDate(input.date)}/${compactDate(nextDateString(input.date))}`,
    details: input.details,
  });
  return `https://calendar.google.com/calendar/render?${sp.toString()}`;
}

export interface PlannerPoint {
  code: string;
  full: string;
  lat: number;
  lon: number;
}

export interface PlannerSpotInput {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pref: string;
  city: string;
  /** 「諸国一宮」「名勝（国指定）」など。Wikidata の指定そのまま */
  basis: string;
}

export interface PlannerDestination {
  code: string;
  name: string;
  distanceKm: number;
}

export interface PlannerSpot {
  id: string;
  name: string;
  place: string;
  basis: string;
  distanceKm: number;
}

export interface PlannerDirection {
  direction: CompassDirection;
  label: string;
  totalAvailable: number;
  nextDate: string | null;
  days: PurposeDay[];
  destinations: PlannerDestination[];
  spots: PlannerSpot[];
}

export interface KichihouiPlan {
  from: string;
  to: string;
  purpose: PlannerPurpose;
  purposeLabel: string;
  boardsUsed: BoardName[];
  usesTenchusatsu: boolean;
  soonest: { date: string; direction: CompassDirection; label: string } | null;
  directions: PlannerDirection[];
}

interface Placed<T> {
  item: T;
  direction: CompassDirection;
  distanceKm: number;
}

function place<T extends { lat: number; lon: number }>(
  origin: { lat: number; lon: number },
  items: readonly T[],
  maxKm: number,
): Placed<T>[] {
  const out: Placed<T>[] = [];
  for (const item of items) {
    const distanceKm = distanceKmBetween(
      origin.lat,
      origin.lon,
      item.lat,
      item.lon,
    );
    if (!Number.isFinite(distanceKm)) continue;
    if (distanceKm < DIRECTION_UNSTABLE_KM || distanceKm > maxKm) continue;
    const bearing = bearingBetween(origin.lat, origin.lon, item.lat, item.lon);
    out.push({
      item,
      direction: directionFromBearing(bearing, "traditional"),
      distanceKm,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** 距離順の配列から、近い〜遠いがばらけるように count 件を等間隔で取る。 */
export function spreadPick<T>(sorted: readonly T[], count: number): T[] {
  if (sorted.length <= count) return [...sorted];
  if (count <= 1) return sorted.slice(0, count);
  const picked: T[] = [];
  const step = (sorted.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) picked.push(sorted[Math.round(i * step)]);
  return picked;
}

export function buildKichihouiPlan(input: {
  star: StarFrequency;
  voidZodiacs?: string[];
  purpose: PlannerPurpose;
  origin: { lat: number; lon: number; name: string };
  start: Date;
  weeks: PlannerWeeks;
  areas: readonly PlannerPoint[];
  spots: readonly PlannerSpotInput[];
  maxDaysPerDirection?: number;
}): KichihouiPlan {
  const end = new Date(input.start.getTime() + (input.weeks * 7 - 1) * DAY_MS);
  const voidZodiacs = input.voidZodiacs ?? [];
  const summaries = findPurposeDaysAllDirections(
    input.start,
    end,
    {
      honmeiStar: input.star,
      voidZodiacs,
      lon: input.origin.lon,
      tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
      involuntaryMove: false,
    },
    input.purpose,
  );
  const cap = input.maxDaysPerDirection ?? DEFAULT_DAYS_PER_DIRECTION;
  const areas = place(input.origin, input.areas, DESTINATION_MAX_KM);
  const spots = place(input.origin, input.spots, SPOT_MAX_KM);

  const directions: PlannerDirection[] = summaries.map((s) => {
    const direction = s.direction as CompassDirection;
    const available = s.days.filter((d) => !d.blockedByTenchusatsu);
    return {
      direction,
      label: s.directionLabel,
      totalAvailable: available.length,
      nextDate: available[0]?.date ?? null,
      days: available.slice(0, cap),
      destinations: spreadPick(
        areas.filter((a) => a.direction === direction),
        DESTINATIONS_PER_DIRECTION,
      ).map((a) => ({
        code: a.item.code,
        name: a.item.full,
        distanceKm: Math.round(a.distanceKm),
      })),
      spots: spreadPick(
        spots.filter((p) => p.direction === direction),
        SPOTS_PER_DIRECTION,
      ).map((p) => ({
        id: p.item.id,
        name: p.item.name,
        place: `${p.item.pref}${p.item.city}`,
        basis: p.item.basis,
        distanceKm: Math.round(p.distanceKm),
      })),
    };
  });

  directions.sort((a, b) => {
    if (a.nextDate && b.nextDate) {
      return (
        a.nextDate.localeCompare(b.nextDate) ||
        b.totalAvailable - a.totalAvailable
      );
    }
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return 0;
  });

  const first = directions[0];
  return {
    from: toJapanDateString(input.start),
    to: toJapanDateString(end),
    purpose: input.purpose,
    purposeLabel: PURPOSE_LABELS[input.purpose],
    boardsUsed: [...PURPOSE_BOARDS[input.purpose]],
    usesTenchusatsu: voidZodiacs.length > 0,
    soonest:
      first?.nextDate != null
        ? {
            date: first.nextDate,
            direction: first.direction,
            label: first.label,
          }
        : null,
    directions,
  };
}

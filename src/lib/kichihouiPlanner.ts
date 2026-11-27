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
import { haLabelForLayer, directionLabelName } from "@/lib/directionLabels";
import { kigakuMonthRange, type CompassDirection } from "@/lib/kigakuContent";
import {
  findAuspiciousDaysAllDirections,
  findPurposeDaysAllDirections,
  judgeDayAllDirections,
  type DayVerdict,
  type PurposeDay,
} from "@/utils/auspiciousDays";
import { TIER_LABELS, TIER_ORDER, type DayTier } from "@/utils/dayTier";
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
  gradeForPurpose,
  type BoardName,
  type TripPurpose,
} from "@/utils/tripPurpose";

export type PlannerPurpose = "daytrip" | "short_stay" | "long_stay";
export const PLANNER_PURPOSES: readonly PlannerPurpose[] = [
  "daytrip",
  "short_stay",
  "long_stay",
];
/** 画面用。長期は既存の relocation（年盤＋月盤）と同じ盤を使う。 */
export const PLANNER_PURPOSE_LABELS: Record<PlannerPurpose, string> = {
  daytrip: PURPOSE_LABELS.daytrip,
  short_stay: PURPOSE_LABELS.short_stay,
  long_stay: "長期（3泊以上・移転／年盤＋月盤）",
};
export function tripPurposeOf(purpose: PlannerPurpose): TripPurpose {
  return purpose === "long_stay" ? "relocation" : purpose;
}
export const PLANNER_WEEKS = [4, 8, 12] as const;
export type PlannerWeeks = (typeof PLANNER_WEEKS)[number];
export const DEFAULT_PLANNER_WEEKS: PlannerWeeks = 8;
export const PLANNER_MONTHS = [3, 6, 12] as const;
export type PlannerMonths = (typeof PLANNER_MONTHS)[number];
export const DEFAULT_PLANNER_MONTHS: PlannerMonths = 6;

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
  months: PlannerMonths;
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
  const rawMonths = Number(single(query.months));
  const months = (PLANNER_MONTHS as readonly number[]).includes(rawMonths)
    ? (rawMonths as PlannerMonths)
    : DEFAULT_PLANNER_MONTHS;
  const rawFrom = single(query.from)?.trim();
  return {
    star,
    purpose,
    weeks,
    months,
    from: rawFrom ? rawFrom : undefined,
  };
}

export function plannerPeriodInput(q: Pick<PlannerQuery, "weeks" | "months">): {
  weeks: PlannerWeeks;
  months: PlannerMonths;
} {
  return { weeks: q.weeks, months: q.months };
}

export function plannerTierLabel(
  purpose: PlannerPurpose,
  tier: DayTier,
): string {
  if (purpose === "long_stay") return LONG_STAY_TIER_LABELS[tier];
  if (purpose === "daytrip") {
    if (tier === "S") return "日盤が吉";
    if (tier === "C") return "凶なし（平）";
    return TIER_LABELS[tier];
  }
  if (tier === "S") return "月盤・日盤とも吉";
  if (tier === "A") return "吉2盤・凶なし";
  if (tier === "B") return "吉1盤・凶なし";
  if (tier === "C") return "凶なし（平）";
  return TIER_LABELS[tier];
}

export function plannerHref(params: {
  star?: number | null;
  purpose?: PlannerPurpose;
  weeks?: number;
  months?: number;
  from?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.star) sp.set("star", String(params.star));
  if (params.purpose) sp.set("purpose", params.purpose);
  if (params.purpose === "long_stay") {
    if (params.months) sp.set("months", String(params.months));
  } else if (params.weeks) {
    sp.set("weeks", String(params.weeks));
  }
  if (params.from) sp.set("from", params.from);
  const qs = sp.toString();
  return qs ? `/houi/planner?${qs}` : "/houi/planner";
}

function shiftYearMonth(year: number, month: number, delta: number) {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** 開始日の N か月後の同じ日（日本時間）。月末は先の月の末日に合わせる。 */
export function addJapanMonths(start: Date, months: number): Date {
  const [y, m, d] = toJapanDateString(start).split("-").map(Number);
  const { year, month } = shiftYearMonth(y, m, months);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(d, last), 3));
}

/**
 * その日が属する節入り月（既存の kigakuMonthRange）。
 * 暦月の 1 日は、まだ前の節に属することがある。
 */
export function kigakuTermOf(date: string): {
  year: number;
  month: number;
  start: string;
  end: string;
} {
  const [y, m] = date.split("-").map(Number);
  for (const delta of [0, -1, 1, -2, 2]) {
    const ym = shiftYearMonth(y, m, delta);
    const range = kigakuMonthRange(ym.year, ym.month);
    const start = toJapanDateString(range.start);
    const end = toJapanDateString(range.end);
    if (date >= start && date <= end) {
      return { year: ym.year, month: ym.month, start, end };
    }
  }
  const range = kigakuMonthRange(y, m);
  return {
    year: y,
    month: m,
    start: toJapanDateString(range.start),
    end: toJapanDateString(range.end),
  };
}

export function termLabel(year: number, month: number): string {
  return `${year}年${month}月節`;
}

/** 長期の段階表示。TIER_LABELS の「三盤吉」は三盤の話なので使わない。 */
export const LONG_STAY_TIER_LABELS: Record<DayTier, string> = {
  S: "年盤・月盤とも吉",
  A: "吉2盤・凶なし",
  B: "吉1盤・凶なし",
  C: "凶なし（平）",
  D: "軽い凶のみ",
  X: "五大凶殺あり",
};

export function layerStatusLabel(
  status: string | undefined,
  layer: "year" | "month",
): string {
  if (!status) return "—";
  if (status === "NOISE_HA") return haLabelForLayer(layer);
  if (status === "SAFE") return "平";
  return directionLabelName(status);
}

/** from〜to に重なる節入り月を、開始日の早い順で返す。 */
export function termsInRange(
  from: string,
  to: string,
): {
  year: number;
  month: number;
  start: string;
  end: string;
  label: string;
}[] {
  const out: {
    year: number;
    month: number;
    start: string;
    end: string;
    label: string;
  }[] = [];
  let cursor = from;
  for (let i = 0; i < 24 && cursor <= to; i++) {
    const t = kigakuTermOf(cursor);
    out.push({ ...t, label: termLabel(t.year, t.month) });
    cursor = nextDateString(t.end);
  }
  return out;
}

function noonOfJapanDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3));
}

function clampDate(date: string, from: string, to: string): string {
  if (date < from) return from;
  if (date > to) return to;
  return date;
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

export interface PlannerNoBadDay {
  date: string;
  tier: DayTier;
  rokuyo: string;
  tags: string[];
  inTenchusatsu: boolean;
}

export interface PlannerTerm {
  year: number;
  month: number;
  label: string;
  start: string;
  end: string;
  /** gradeForPurpose(..., "relocation")。S は年盤・月盤とも吉。 */
  tier: DayTier;
  yearStatus: string;
  monthStatus: string;
  /** 年盤・月盤が吉の日数（天中殺で塞がれない日） */
  available: number;
  days: PurposeDay[];
  /** その節の、三盤吉の出発日 */
  departureDays: PurposeDay[];
  /** その節の、三盤で凶の入らない日数 */
  noBadAvailable: number;
  /** その節の、三盤吉以外の三盤で凶の入らない出発日（段階順・日付順、先頭 cap 件） */
  noBadDays: PlannerNoBadDay[];
}

export interface PlannerDirection {
  direction: CompassDirection;
  label: string;
  totalAvailable: number;
  nextDate: string | null;
  days: PurposeDay[];
  noBadAvailable: number;
  nextNoBadDate: string | null;
  noBadDays: PurposeDay[];
  /** 長期だけ。節入り月ごとのまとめ。短期は空。 */
  terms: PlannerTerm[];
  /** 長期だけ。三盤吉の出発日（先頭 cap 件）。短期は空。 */
  departureDays: PurposeDay[];
  yearBoardValidUntil: string | null;
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
  soonest: {
    date: string;
    direction: CompassDirection;
    label: string;
    /** 三盤吉の出発日なら true。長期で年盤・月盤のみの日なら false。 */
    triple: boolean;
  } | null;
  soonestNoBad: {
    date: string;
    direction: CompassDirection;
    label: string;
    tier: DayTier;
  } | null;
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

function buildLongStayTerms(
  from: string,
  to: string,
  base: Parameters<typeof judgeDayAllDirections>[1],
  days: PurposeDay[],
  departureDates: Set<string>,
  noBadTripleDays: DayVerdict[],
  cap: number,
  direction: CompassDirection,
): PlannerTerm[] {
  return termsInRange(from, to).map((t) => {
    const rep = noonOfJapanDate(clampDate(t.start, from, to));
    const verdict = judgeDayAllDirections(rep, base)[direction];
    const inTerm = days.filter((d) => d.date >= t.start && d.date <= t.end);
    const departures = inTerm.filter((d) => departureDates.has(d.date));
    const inTermNoBad = noBadTripleDays.filter(
      (d) => d.date >= t.start && d.date <= t.end,
    );
    const nonSTriple = inTermNoBad
      .filter((d) => (d.tier ?? "C") !== "S")
      .sort(
        (a, b) =>
          TIER_ORDER.indexOf(a.tier ?? "C") -
            TIER_ORDER.indexOf(b.tier ?? "C") || a.date.localeCompare(b.date),
      )
      .slice(0, cap)
      .map((d) => ({
        date: d.date,
        tier: d.tier ?? "C",
        rokuyo: d.rokuyo,
        tags: d.tags,
        inTenchusatsu:
          d.voidScopes.year || d.voidScopes.month || d.voidScopes.day,
      }));
    return {
      ...t,
      tier: gradeForPurpose(verdict, "relocation"),
      yearStatus: verdict.yearLayer,
      monthStatus: verdict.monthLayer,
      available: inTerm.length,
      days: inTerm.slice(0, cap),
      departureDays: departures.slice(0, cap),
      noBadAvailable: inTermNoBad.length,
      noBadDays: nonSTriple,
    };
  });
}

export function buildKichihouiPlan(input: {
  star: StarFrequency;
  voidZodiacs?: string[];
  purpose: PlannerPurpose;
  origin: { lat: number; lon: number; name: string };
  start: Date;
  weeks?: PlannerWeeks;
  months?: PlannerMonths;
  areas: readonly PlannerPoint[];
  spots: readonly PlannerSpotInput[];
  maxDaysPerDirection?: number;
}): KichihouiPlan {
  const trip = tripPurposeOf(input.purpose);
  const end =
    input.purpose === "long_stay"
      ? addJapanMonths(input.start, input.months ?? DEFAULT_PLANNER_MONTHS)
      : new Date(
          input.start.getTime() +
            ((input.weeks ?? DEFAULT_PLANNER_WEEKS) * 7 - 1) * DAY_MS,
        );
  const voidZodiacs = input.voidZodiacs ?? [];
  const base = {
    honmeiStar: input.star,
    voidZodiacs,
    lon: input.origin.lon,
    tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE,
    involuntaryMove: false as const,
  };
  const summaries = findPurposeDaysAllDirections(
    input.start,
    end,
    base,
    trip,
    "noBad",
  );
  const cap = input.maxDaysPerDirection ?? DEFAULT_DAYS_PER_DIRECTION;
  const tripleByDirection = new Map<string, Set<string>>();
  const noBadTripleByDirection = new Map<string, DayVerdict[]>();
  if (input.purpose === "long_stay") {
    for (const s of findAuspiciousDaysAllDirections(
      input.start,
      end,
      base,
      "noBad",
    )) {
      const nonBlocked = s.days.filter((d) => !d.blockedByTenchusatsu);
      noBadTripleByDirection.set(s.direction, nonBlocked);
      tripleByDirection.set(
        s.direction,
        new Set(nonBlocked.filter((d) => d.tier === "S").map((d) => d.date)),
      );
    }
  }
  const areas = place(input.origin, input.areas, DESTINATION_MAX_KM);
  const spots = place(input.origin, input.spots, SPOT_MAX_KM);

  const earliestNoBadByDirection = new Map<string, PurposeDay>();
  const directions: PlannerDirection[] = summaries.map((s) => {
    const direction = s.direction as CompassDirection;
    const all = s.days.filter((d) => !d.blockedByTenchusatsu);
    const good = all.filter((d) => d.tier === "S");
    if (all[0]) earliestNoBadByDirection.set(direction, all[0]);
    const sortedNoBad = [...all].sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
        a.date.localeCompare(b.date),
    );
    const departureDates = tripleByDirection.get(s.direction) ?? new Set();
    const departureDays = good.filter((d) => departureDates.has(d.date));
    return {
      direction,
      label: s.directionLabel,
      totalAvailable: good.length,
      nextDate: good[0]?.date ?? null,
      days: good.slice(0, cap),
      noBadAvailable: all.length,
      nextNoBadDate: all[0]?.date ?? null,
      noBadDays: sortedNoBad.slice(0, cap),
      terms:
        input.purpose === "long_stay"
          ? buildLongStayTerms(
              toJapanDateString(input.start),
              toJapanDateString(end),
              base,
              good,
              departureDates,
              noBadTripleByDirection.get(s.direction) ?? [],
              cap,
              direction,
            )
          : [],
      departureDays: departureDays.slice(0, cap),
      yearBoardValidUntil: s.window?.yearBoardValidUntil ?? null,
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

  const bestTierRank = (d: PlannerDirection) => {
    if (d.terms.length === 0) return 99;
    return Math.min(...d.terms.map((t) => TIER_ORDER.indexOf(t.tier)));
  };
  directions.sort((a, b) => {
    const tierDiff = bestTierRank(a) - bestTierRank(b);
    if (tierDiff !== 0) return tierDiff;
    if (a.nextDate && b.nextDate) {
      return (
        a.nextDate.localeCompare(b.nextDate) ||
        b.totalAvailable - a.totalAvailable
      );
    }
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    if (a.nextNoBadDate && b.nextNoBadDate) {
      return (
        a.nextNoBadDate.localeCompare(b.nextNoBadDate) ||
        b.noBadAvailable - a.noBadAvailable
      );
    }
    if (a.nextNoBadDate) return -1;
    if (b.nextNoBadDate) return 1;
    return 0;
  });

  const firstTriple = directions.reduce<(typeof directions)[number] | null>(
    (best, d) => {
      const date = d.departureDays[0]?.date;
      if (!date) return best;
      if (!best || date < best.departureDays[0].date) return d;
      return best;
    },
    null,
  );
  const first = directions[0];
  const soonestFrom = firstTriple ?? first;
  const soonestDate = firstTriple
    ? firstTriple.departureDays[0].date
    : first?.nextDate;

  let soonestNoBad: KichihouiPlan["soonestNoBad"] = null;
  for (const d of directions) {
    const earliest = earliestNoBadByDirection.get(d.direction);
    if (!earliest) continue;
    if (!soonestNoBad || earliest.date < soonestNoBad.date) {
      soonestNoBad = {
        date: earliest.date,
        direction: d.direction,
        label: d.label,
        tier: earliest.tier,
      };
    }
  }

  return {
    from: toJapanDateString(input.start),
    to: toJapanDateString(end),
    purpose: input.purpose,
    purposeLabel: PLANNER_PURPOSE_LABELS[input.purpose],
    boardsUsed: [...PURPOSE_BOARDS[trip]],
    usesTenchusatsu: voidZodiacs.length > 0,
    soonest:
      soonestDate != null && soonestFrom
        ? {
            date: soonestDate,
            direction: soonestFrom.direction,
            label: soonestFrom.label,
            triple: Boolean(firstTriple),
          }
        : null,
    soonestNoBad,
    directions,
  };
}

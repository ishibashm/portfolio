import {
  buildBase,
  calculateMcpDirectionsDay,
  parseJstDate,
} from "./mcpDirections";
import { toJapanDateString } from "@/utils/japanDate";
import { isTenchusatsuMode } from "@/utils/tenchusatsuPolicy";
import { DIRECTION_FILTER_MODES } from "@/utils/directionFilterMode";

export type RelocationWindowsInput = Parameters<typeof buildBase>[0] & {
  from?: string;
  days?: number;
};
type Daily = ReturnType<typeof calculateMcpDirectionsDay>["payload"];
type Direction = Pick<
  Daily["directions"][number],
  "direction" | "label" | "tier"
>;
export interface RelocationWindow {
  from: string;
  to: string;
  days: number;
  directions: Direction[];
  allDirectionsBad: boolean;
  bestTier: Direction["tier"] | null;
  tenchusatsu: Daily["tenchusatsu"];
}
const strength = "SABCDX";
const DAY = 86400000;
const TTL = 6 * 60 * 60 * 1000;
const cache = new Map<
  string,
  { expires: number; payload: RelocationPayload }
>();
interface RelocationPayload {
  from: string;
  to: string;
  days: number;
  windows: RelocationWindow[];
  tripleDays: { date: string; directions: Direction[] }[];
  tripleDaysTotal: number;
  summary: {
    totalDays: number;
    windowsCount: number;
    allDirectionsBadDays: number;
    tenchusatsuDays: number;
    bestWindows: RelocationWindow[];
  };
}
function validDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseJstDate(value) : null;
  return date && toJapanDateString(date) === value ? date : null;
}

/** Deterministic JST scan; cache is process-local, bounded, and never logged. */
export function findRelocationWindows(
  input: RelocationWindowsInput,
  now = new Date(),
) {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!input.birthDate || !validDate(input.birthDate))
    return fail("birthDate は実在する YYYY-MM-DD で指定してください。");
  if (
    input.birthTime !== undefined &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.birthTime)
  )
    return fail("birthTime は HH:MM で指定してください。");
  if (
    typeof input.lon !== "number" ||
    !Number.isFinite(input.lon) ||
    input.lon < 122 ||
    input.lon > 154
  )
    return fail("lon は122〜154の数値で指定してください。");
  const days = input.days ?? 600;
  if (!Number.isInteger(days) || days < 30 || days > 730)
    return fail("days は30〜730の整数で指定してください。");
  if (
    input.tenchusatsuMode !== undefined &&
    !isTenchusatsuMode(input.tenchusatsuMode)
  )
    return fail("tenchusatsuMode が不正です。");
  if (
    input.directionFilterMode !== undefined &&
    !DIRECTION_FILTER_MODES.some((m) => m === input.directionFilterMode)
  )
    return fail("directionFilterMode が不正です。");
  const from = input.from ?? toJapanDateString(now);
  const start = validDate(from);
  if (!start) return fail("from は実在する YYYY-MM-DD で指定してください。");
  // Birth time affects existing year-boundary/day-pillar helpers; no hour void is used.
  const built = buildBase(input);
  if (!built.ok) return built;
  const key = JSON.stringify([
    input.birthDate,
    input.birthTime ?? null,
    input.lon,
    from,
    days,
    built.tenchusatsuMode,
    built.base.involuntaryMove,
    built.base.directionFilterMode,
  ]);
  const hit = cache.get(key);
  cache.delete(key);
  if (hit && hit.expires > now.getTime()) {
    cache.set(key, hit);
    return { ok: true as const, payload: structuredClone(hit.payload) };
  }
  const windows: RelocationWindow[] = [];
  const tripleDays: RelocationPayload["tripleDays"] = [];
  let tripleDaysTotal = 0,
    allDirectionsBadDays = 0,
    tenchusatsuDays = 0;
  let previousKey = "";
  for (let i = 0; i < days; i++) {
    const day = calculateMcpDirectionsDay(
      built,
      new Date(start.getTime() + i * DAY),
      "relocation",
    ).payload;
    const directions = day.directions
      .filter((d) => d.tier !== "X")
      .map(({ direction, label, tier }) => ({ direction, label, tier }))
      .sort((a, b) => strength.indexOf(a.tier) - strength.indexOf(b.tier));
    const signature = JSON.stringify([directions, day.tenchusatsu]);
    if (!directions.length) allDirectionsBadDays++;
    if (day.tenchusatsu.inPeriod) tenchusatsuDays++;
    if (signature === previousKey) {
      const last = windows[windows.length - 1];
      last.to = day.date;
      last.days++;
    } else {
      windows.push({
        from: day.date,
        to: day.date,
        days: 1,
        directions,
        allDirectionsBad: !directions.length,
        bestTier: directions[0]?.tier ?? null,
        tenchusatsu: day.tenchusatsu,
      });
    }
    previousKey = signature;
    const triples = day.directions
      .filter((d) => d.tier === "S" && d.isTripleAuspicious)
      .map(({ direction, label, tier }) => ({ direction, label, tier }));
    if (triples.length) {
      tripleDaysTotal++;
      if (tripleDays.length < 200)
        tripleDays.push({ date: day.date, directions: triples });
    }
  }
  const payload: RelocationPayload = {
    from,
    to: windows[windows.length - 1].to,
    days,
    windows,
    tripleDays,
    tripleDaysTotal,
    summary: {
      totalDays: days,
      windowsCount: windows.length,
      allDirectionsBadDays,
      tenchusatsuDays,
      bestWindows: windows
        .filter((w) => w.bestTier === "S")
        .sort((a, b) => b.days - a.days || a.from.localeCompare(b.from))
        .slice(0, 10),
    },
  };
  cache.set(key, {
    expires: now.getTime() + TTL,
    payload: structuredClone(payload),
  });
  while (cache.size > 50) cache.delete(cache.keys().next().value!);
  return { ok: true as const, payload };
}

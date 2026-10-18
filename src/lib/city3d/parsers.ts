import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
} from "@/utils/directionGeo";
import { TIER_FILL } from "@/utils/tierDisplay";
import type { DayTier } from "@/utils/dayTier";
import type { Location } from "./geo";
export interface Geocode extends Location {
  name: string;
  source: string;
}
export interface Judgement {
  directions: {
    direction: CompassDirection;
    label: string;
    tier: DayTier;
    status: string;
    yearLayer: string;
    monthLayer: string;
    dayLayer: string;
  }[];
  honmeiStar: number;
  date: string;
  blockedByTenchusatsu: boolean;
}
export function record(x: unknown): Record<string, unknown> {
  return typeof x === "object" && x !== null
    ? (x as Record<string, unknown>)
    : {};
}
export function parseGeocodeResponse(json: unknown): Geocode {
  const v = record(json);
  if (
    typeof v.lat !== "number" ||
    !Number.isFinite(v.lat) ||
    Math.abs(v.lat) > 85 ||
    typeof v.lon !== "number" ||
    !Number.isFinite(v.lon) ||
    Math.abs(v.lon) > 180 ||
    typeof v.name !== "string" ||
    typeof v.source !== "string"
  )
    throw new Error("住所が見つかりませんでした。別の表記でお試しください。");
  return { lat: v.lat, lon: v.lon, name: v.name, source: v.source };
}
export function parseJudgeDirectionsResponse(json: unknown): Judgement {
  const v = record(json),
    r = record(v.result);
  if (v.error || r.isError || !Array.isArray(r.content))
    throw new Error("方位の判定を取得できませんでした。");
  let p: Record<string, unknown>;
  try {
    p = record(JSON.parse(String(record(r.content[0]).text)));
  } catch {
    throw new Error("方位の応答を読み取れませんでした。");
  }
  if (
    !Array.isArray(p.directions) ||
    p.directions.length !== 8 ||
    !COMPASS_DIRECTIONS.every(
      (d) =>
        (p.directions as unknown[]).filter((x) => record(x).direction === d)
          .length === 1,
    ) ||
    !p.directions.every((x) => {
      const a = record(x);
      return (
        typeof a.tier === "string" &&
        Object.hasOwn(TIER_FILL, a.tier) &&
        ["label", "status", "yearLayer", "monthLayer", "dayLayer"].every(
          (k) => typeof a[k] === "string",
        )
      );
    }) ||
    typeof p.honmeiStar !== "number" ||
    p.honmeiStar < 1 ||
    p.honmeiStar > 9 ||
    !Number.isInteger(p.honmeiStar) ||
    typeof p.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
    typeof p.blockedByTenchusatsu !== "boolean"
  )
    throw new Error("方位の応答が不完全です。");
  return p as unknown as Judgement;
}
export function parseReverseGeocoder(json: unknown): string | null {
  const code = record(record(json).results).muniCd;
  return typeof code === "string" && /^\d{5}$/.test(code) ? code : null;
}
export interface PlateauEntry {
  url: string;
  year: number;
  name: string;
}
export function lookupPlateau(
  index: Record<string, PlateauEntry>,
  codes: { ward_code?: string | null; city_code?: string | null },
): PlateauEntry | null {
  return index[codes.ward_code || codes.city_code || ""] ?? null;
}
export function groundHeight(json: unknown, origin: Location): number {
  let height = 0,
    depth = -1;
  const root = record(record(json).root);
  const region = record(root.boundingVolume).region;
  if (Array.isArray(region) && Number.isFinite(region[4])) height = region[4];
  function visit(node: Record<string, unknown>, level: number) {
    const r = record(node.boundingVolume).region,
      lon = (origin.lon * Math.PI) / 180,
      lat = (origin.lat * Math.PI) / 180;
    if (
      Array.isArray(r) &&
      r.length === 6 &&
      r.every((v) => typeof v === "number" && Number.isFinite(v)) &&
      lon >= r[0] &&
      lon <= r[2] &&
      lat >= r[1] &&
      lat <= r[3] &&
      level > depth
    ) {
      height = r[4];
      depth = level;
    }
    if (Array.isArray(node.children))
      node.children.forEach((c) => visit(record(c), level + 1));
  }
  visit(root, 0);
  return height;
}

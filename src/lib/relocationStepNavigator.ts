/**
 * 引越しの 3 ステップ導線（RelocationStepNavigator）のための純関数。
 *
 * 九星気学（移動の方位）と八宅風水（部屋の向き）は**別の流派として並べるだけ**で、
 * 点を合算しない。ここでもスコアは一切作らない。
 */
import housingStats from "@/data/housingStats.json";
import {
  AREAS,
  findArea,
  neighboursByDirection,
  type Area,
} from "@/lib/areaContent";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import {
  hasAreaHousingData,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";
import { DIRECTIONS, type CompassDirection } from "@/lib/kigakuContent";
import { readFengShui, type Sex } from "@/utils/fengShuiEngine";

const HOUSING = housingStats as unknown as HousingSnapshotData;

/**
 * /houi/area/[code] が index される条件と同じ（編集文と住宅統計の両方がある）。
 * 判定を変えるときは area 頁の generateMetadata と sitemap も合わせること。
 */
export function isIndexableAreaCode(code: string): boolean {
  return Boolean(AREA_EDITORIAL[code]) && hasAreaHousingData(HOUSING, code);
}

export interface OriginOption {
  code: string;
  label: string;
}

/** 出発地の選択肢。索引対象の市区町村だけに絞り、クライアントへ送る量を抑える。 */
export function originOptions(): OriginOption[] {
  return AREAS.filter((a) => isIndexableAreaCode(a.code))
    .map((a) => ({ code: a.code, label: a.full }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export interface LuckyAreaItem {
  code: string;
  name: string;
  direction: CompassDirection;
  distanceKm: number;
  medianRent: number;
  rentDiffPct: number;
  indexable: boolean;
}

/** 文字列の並びから方位だけを取り出す（不正値は捨てる）。 */
export function parseDirections(raw: string | null): CompassDirection[] {
  if (!raw) return [];
  const set = new Set(raw.split(","));
  return DIRECTIONS.filter((d) => set.has(d));
}

/**
 * 出発地から見て、指定の方位にある市区町村を近い順に返す。
 * 索引対象の頁を優先し、方位ごとに perDirection 件まで。
 */
export function luckyAreasFrom(
  origin: Area,
  directions: readonly CompassDirection[],
  perDirection = 5,
): LuckyAreaItem[] {
  const groups = neighboursByDirection(origin);
  const out: LuckyAreaItem[] = [];
  for (const d of directions) {
    const list = groups[d]
      .map((a) => ({ a, indexable: isIndexableAreaCode(a.code) }))
      .sort(
        (x, y) =>
          Number(y.indexable) - Number(x.indexable) ||
          x.a.distanceKm - y.a.distanceKm,
      )
      .slice(0, perDirection);
    for (const { a, indexable } of list) {
      out.push({
        code: a.code,
        name: a.full,
        direction: d,
        distanceKm: a.distanceKm,
        medianRent: a.medianRent,
        rentDiffPct: a.rentDiffPct,
        indexable,
      });
    }
  }
  return out;
}

export function luckyAreasForCode(
  code: string,
  directions: readonly CompassDirection[],
): LuckyAreaItem[] | null {
  const origin = findArea(code);
  if (!origin) return null;
  return luckyAreasFrom(origin, directions);
}

/** 生まれ年（立春基準）から本命星。2026 → 1（一白）。 */
export function starOfYear(year: number): number {
  const n = (11 - (year % 9)) % 9;
  return n === 0 ? 9 : n;
}

/** その本命星になる代表の年（2000〜2008 年のどれか）。本命卦は年 mod 9 で決まる。 */
export function representativeYearForStar(star: number): number {
  for (let y = 2000; y < 2009; y++) if (starOfYear(y) === star) return y;
  throw new Error(`本命星が不正: ${star}`);
}

export interface FourLucky {
  sex: Sex;
  guaName: string;
  group: string;
  directions: { direction: CompassDirection; youxing: string }[];
}

/** 本命星から、男女それぞれの八宅の四吉方（生気・天医・延年・伏位）。 */
export function fourLuckyForStar(star: number): FourLucky[] {
  const year = representativeYearForStar(star);
  return (["male", "female"] as const).map((sex) => {
    const r = readFengShui(year, sex);
    return {
      sex,
      guaName: r.guaName,
      group: r.group,
      directions: r.directions
        .filter((d) => d.auspicious)
        .map((d) => ({ direction: d.direction, youxing: d.youxing })),
    };
  });
}

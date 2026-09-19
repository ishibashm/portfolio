import { TATAMI_SQM } from "@/lib/housingStatsDirections";

/**
 * e-Stat の住宅の統計の写し（`src/data/housingStats.json`）を読む。
 *
 * 市区町村ページの相場の札は、掲載（賃貸の巡回）から出した中央値と
 * ㎡単価で、巡回を止めた 2026-09-13 で凍結している。置き換え先は
 * 「統計でみる市区町村のすがた」Ｈ 居住の 1 畳当たり家賃・借家の畳数・
 * 空き家数。写しは元の値だけを積んであり（`scripts/estatHousing` の
 * `toHousingSnapshot`）、割り算はここで行う。定数（1 畳 = 1.62 ㎡）と
 * 目安の出し方は方位別の読み口（`housingStatsDirections`）と同じ。
 *
 * 写しの形は `scripts/estatHousing` の `HousingSnapshot` と同じだが、
 * `scripts/` は tsconfig の対象外なので型はここに写す。ずれたら見張り
 * （`housingSnapshot.test.ts`）が両方の形を同じ入力で突き合わせる。
 */
export interface HousingSnapshotArea {
  name: string;
  totalDwellings: number | null;
  vacantDwellings: number | null;
  rentPerTatamiYen: number | null;
  tatamiPerRental: number | null;
  floorAreaPerRental: number | null;
}

export interface HousingSnapshotData {
  year: number;
  generatedAt: string;
  areas: Record<string, HousingSnapshotArea>;
}

/** 頁に出す形。無い値は null（0 にしない）。 */
export interface HousingFigures {
  /** 調査年。出典に書く。 */
  year: number;
  /** 借家の家賃（円/㎡・月）。1 畳当たり家賃 ÷ 1.62、整数に丸める。 */
  rentPerSqm: number | null;
  /** 借家 1 戸の月額の目安（円）。1 畳当たり家賃 × 平均畳数、100 円に丸める。 */
  monthlyRentEstimate: number | null;
  /** 借家の平均延べ面積（㎡）。 */
  floorAreaPerRental: number | null;
  /** 空き家率（0〜1）。総住宅数が 0 なら null。 */
  vacancyRate: number | null;
  /** 総住宅数（戸）。街の規模の目安。 */
  totalDwellings: number | null;
}

/** 地域コード（JIS 5 桁）で引く。写しに無ければ null。 */
export function housingFiguresFor(
  snapshot: HousingSnapshotData,
  code: string,
): HousingFigures | null {
  const a = snapshot.areas[code];
  if (!a) return null;
  const rentPerSqm =
    a.rentPerTatamiYen === null
      ? null
      : Math.round(a.rentPerTatamiYen / TATAMI_SQM);
  const monthlyRentEstimate =
    a.rentPerTatamiYen === null || a.tatamiPerRental === null
      ? null
      : Math.round((a.rentPerTatamiYen * a.tatamiPerRental) / 100) * 100;
  const vacancyRate =
    a.totalDwellings === null ||
    a.vacantDwellings === null ||
    a.totalDwellings === 0
      ? null
      : a.vacantDwellings / a.totalDwellings;
  return {
    year: snapshot.year,
    rentPerSqm,
    monthlyRentEstimate,
    floorAreaPerRental: a.floorAreaPerRental,
    vacancyRate,
    totalDwellings: a.totalDwellings,
  };
}

/**
 * 出発地に対する差（%）。負なら安い。どちらかが無ければ null。
 * 掲載由来の `rentDiffPct`（`areaContent`）と同じ向き・同じ丸め。
 */
export function rentDiffPct(
  origin: HousingFigures | null,
  other: HousingFigures | null,
): number | null {
  if (!origin?.rentPerSqm || other?.rentPerSqm === null || !other) return null;
  return Math.round(
    ((other.rentPerSqm - origin.rentPerSqm) / origin.rentPerSqm) * 100,
  );
}

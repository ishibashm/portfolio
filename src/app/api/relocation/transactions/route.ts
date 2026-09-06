import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toResponseMessage } from "@/lib/errorMessage";
import {
  bearingBetween,
  distanceKmBetween,
  directionFromBearing,
} from "@/utils/directionGeo";

/**
 * 成約価格（過去に実際に売買された価格）を出発地からの方位つきで返す。
 *
 * 「物件を方位で探す」の購入モードの読み口。賃貸と違って**いま買える
 * 物件の一覧ではなく、国交省の取引実績**なので、応答は「成約事例」と
 * その方位別の相場に徹する。問い合わせ導線は張れない。
 *
 * 方位は賃貸のスキャンと同じ集約（utils/directionGeo）で、出発地からの
 * 真北基準で出す。判定（吉凶）は画面側が既存の判定器で行い、ここでは
 * 方位と距離という事実だけを返す。
 *
 * 座標は取り込みの geocode 段が地区名から埋める。**まだ埋まっていない
 * 行は方位を出せないので対象から外れる**が、黙って無かったことにせず
 * pendingCoords（座標整備中の件数）で応答に載せる。
 */

export const dynamic = "force-dynamic";

const DEFAULT_RADIUS_KM = 50;
const MAX_RADIUS_KM = 300;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
/** 絞り込み前に読む行の上限。密集地で無制限に読まないため。 */
const SCAN_CAP = 8000;

function toNum(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = toNum(searchParams.get("lat"));
    const lon = toNum(searchParams.get("lon"));
    if (lat === null || lon === null) {
      return NextResponse.json(
        { success: false, error: "lat と lon が必要です。" },
        { status: 400 },
      );
    }

    /*
      下限も置く。以前は上限しか無く、`radius_km=-50` は矩形の gte/lte が
      逆転して必ず 0 件（「無い」と出る）、`limit=-5` は slice(0, -5) で
      **近いほうの 5 件を黙って落とし**、truncated は常に true だった。
    */
    const radiusKm = Math.min(
      Math.max(toNum(searchParams.get("radius_km")) ?? DEFAULT_RADIUS_KM, 1),
      MAX_RADIUS_KM,
    );
    const limit = Math.min(
      Math.max(toNum(searchParams.get("limit")) ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const propertyType = searchParams.get("property_type");
    /*
      建物比率の下限（0〜1）。「建物がしっかりしているのに土地は普通」を
      探す口。値は取り込み時に前計算した building_ratio（積算による推定。
      #415・#416）で、ここでは索引の効く数値比較しかしない。
    */
    const minBuildingRatio = toNum(searchParams.get("min_building_ratio"));
    const nodeMapping =
      searchParams.get("node_mapping") === "physical"
        ? ("physical" as const)
        : ("traditional" as const);

    /*
      粗い箱で絞ってから、正確な距離で切る。緯度 1 度 ≈ 111km。
      経度は緯度で縮むので cos で補正する（高緯度で箱が狭くなりすぎ
      ないよう最低 0.5）。
    */
    const latDelta = radiusKm / 111;
    const lonDelta =
      radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.5));

    const [rows, pendingCoords] = await Promise.all([
      prisma.property_transactions.findMany({
        where: {
          lat: { not: null, gte: lat - latDelta, lte: lat + latDelta },
          lon: { not: null, gte: lon - lonDelta, lte: lon + lonDelta },
          ...(propertyType ? { property_type: propertyType } : {}),
          ...(minBuildingRatio !== null
            ? { building_ratio: { gte: minBuildingRatio } }
            : {}),
        },
        orderBy: [{ trade_year: "desc" }, { trade_quarter: "desc" }],
        take: SCAN_CAP,
      }),
      prisma.property_transactions.count({ where: { lat: null } }),
    ]);

    const withDirection = rows.flatMap((r) => {
      if (r.lat === null || r.lon === null) return [];
      const distanceKm = distanceKmBetween(lat, lon, r.lat, r.lon);
      if (distanceKm > radiusKm) return [];
      const bearing = bearingBetween(lat, lon, r.lat, r.lon);
      return [
        {
          id: r.id,
          prefecture: r.prefecture,
          municipality: r.municipality,
          districtName: r.district_name,
          propertyType: r.property_type,
          tradePrice: r.trade_price === null ? null : Number(r.trade_price),
          areaSqm: r.area_sqm,
          unitPriceSqm: r.unit_price_sqm,
          buildingYear: r.building_year,
          totalFloorAreaSqm: r.total_floor_area_sqm,
          // 積算による推定（est_）。実額ではない。null は「計算に要る
          // 項目が欠けている」（延床・築年・構造のどれか）。
          estBuildingPrice:
            r.est_building_price === null ? null : Number(r.est_building_price),
          estLandPrice:
            r.est_land_price === null ? null : Number(r.est_land_price),
          buildingRatio: r.building_ratio,
          tradeYear: r.trade_year,
          tradeQuarter: r.trade_quarter,
          lat: r.lat,
          lon: r.lon,
          distanceKm: Math.round(distanceKm * 10) / 10,
          direction: directionFromBearing(bearing, nodeMapping),
        },
      ];
    });

    /*
      方位別の相場。中央値で出す（成約価格は外れ値が大きく、平均だと
      1 件の豪邸で方位ごと歪む）。
    */
    const byDirection = new Map<
      string,
      { count: number; unitPrices: number[] }
    >();
    for (const row of withDirection) {
      const entry = byDirection.get(row.direction) ?? {
        count: 0,
        unitPrices: [],
      };
      entry.count += 1;
      if (row.unitPriceSqm !== null && row.unitPriceSqm !== undefined) {
        entry.unitPrices.push(row.unitPriceSqm);
      }
      byDirection.set(row.direction, entry);
    }

    return NextResponse.json({
      success: true,
      data: {
        rows: withDirection.slice(0, limit),
        totalInRadius: withDirection.length,
        truncated: withDirection.length > limit,
        /*
          読む行は SCAN_CAP（新しい順）で切っている。密集地では矩形の中に
          それ以上あり、totalInRadius も方位別の中央値も「新しい 8,000 件」
          の中の話になる。黙って半径の話に見せない。
        */
        scanCapped: rows.length >= SCAN_CAP,
        pendingCoords,
        byDirection: [...byDirection.entries()].map(([direction, v]) => ({
          direction,
          count: v.count,
          medianUnitPriceSqm: median(v.unitPrices),
        })),
      },
    });
  } catch (error) {
    console.error("transactions API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: toResponseMessage(error, "成約事例を読み出せませんでした。"),
      },
      { status: 500 },
    );
  }
}

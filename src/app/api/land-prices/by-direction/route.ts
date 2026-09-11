import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import {
  DEFAULT_MAX_KM,
  DEFAULT_MIN_KM,
  landPricesByDirection,
  type LandPriceRow,
} from "@/lib/landPriceDirections";

/**
 * 出発地から見た**方位ごとの地価**を返す。
 *
 * 出どころは `land_price_points`（地価公示・都道府県地価調査）。国交省の
 * 不動産情報ライブラリから取り込んだ公式データで、**取得の可否に規約上の
 * 制約が無い**（CLAUDE.md 3 節。ポータルの掲載情報とはここが違う）。
 *
 * 集計そのものは `lib/landPriceDirections` が持つ。ここは SQL で範囲を
 * 絞って渡すだけで、方位の割り当ても中央値も書かない。
 *
 * ## 矩形で絞ってから距離で切る
 *
 * 全国 2 万数千地点を毎回 JS に載せると無駄なので、SQL で緯度経度の
 * 矩形に落としてから渡す。**矩形は円より広いので、正確な距離の判定は
 * 集計側がやる。**ここで円に切ろうとすると距離の式が 2 か所になる。
 */
export const dynamic = "force-dynamic";

/** 緯度 1 度はおよそ 111km。矩形の半幅を度で出すのに使う。 */
const KM_PER_DEG_LAT = 111;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseLat = parseFloat(searchParams.get("baseLat") ?? "");
  const baseLon = parseFloat(searchParams.get("baseLon") ?? "");

  /*
    既定値に落とさない。出発地が無いまま東京駅で答えると、画面が
    「登録済み」と読んで保存に流す事故が起きている（#1100・#1114・#1126）。
    物件検索・市区町村比較と同じコードと文言で断る。
  */
  if (!Number.isFinite(baseLat) || !Number.isFinite(baseLon)) {
    return NextResponse.json(
      {
        error: "BASE_LOCATION_REQUIRED",
        message:
          "出発地（現在のお住まい）の座標が必要です。方位はここからの向きで決まるため、既定値では判定できません。",
      },
      { status: 400 },
    );
  }

  const maxKm = Math.min(
    Math.max(parseFloat(searchParams.get("maxKm") ?? "") || DEFAULT_MAX_KM, 10),
    500,
  );
  const minKm = Math.max(
    parseFloat(searchParams.get("minKm") ?? "") || DEFAULT_MIN_KM,
    0,
  );
  const useCategory = searchParams.get("useCategory");

  const latSpan = maxKm / KM_PER_DEG_LAT;
  /* 経度は緯度で縮む。高緯度ほど 1 度が短いので cos で割って広げる */
  const lonSpan =
    maxKm /
    (KM_PER_DEG_LAT * Math.max(0.1, Math.cos((baseLat * Math.PI) / 180)));

  try {
    const rows = await prisma.$queryRawUnsafe<LandPriceRow[]>(
      `SELECT point_id::text AS point_id,
              year,
              land_price_type,
              price_per_sqm::float8 AS price_per_sqm,
              lat, lon, use_category, prefecture, municipality
         FROM land_price_points
        WHERE lat BETWEEN $1 AND $2
          AND lon BETWEEN $3 AND $4
          AND lat IS NOT NULL AND lon IS NOT NULL`,
      baseLat - latSpan,
      baseLat + latSpan,
      baseLon - lonSpan,
      baseLon + lonSpan,
    );

    const directions = landPricesByDirection(rows, baseLat, baseLon, {
      minKm,
      maxKm,
      useCategory,
    });

    return NextResponse.json({
      directions,
      /** 何を見て出した数字かを画面に書けるようにする */
      meta: {
        pointsScanned: rows.length,
        minKm,
        maxKm,
        useCategory,
        source: "国土交通省 不動産情報ライブラリ（地価公示・都道府県地価調査）",
      },
    });
  } catch (e) {
    console.error("land-prices/by-direction:", toLogMessage(e));
    return NextResponse.json(
      {
        error: "LAND_PRICE_QUERY_FAILED",
        message: "地価の集計に失敗しました。",
      },
      { status: 500 },
    );
  }
}

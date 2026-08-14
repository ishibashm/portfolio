import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { buildCountFilters } from "@/lib/rentalCountFilters";
import {
  BUCKET_COUNT,
  OVERFLOW_FLOOR_YEN,
  shapeRentHistogram,
} from "@/lib/rentHistogram";

/**
 * 総家賃（賃料＋管理費）の分布。「家賃上限をいくつにすれば何件
 * 残るか」を、入力する前に見せるための口。
 *
 * viewport-count と同じ作り: 座標の範囲（任意）と SQL で表せる
 * 絞り込みだけで数え、名寄せも判定もしない。かつて相場の統計を
 * リクエストごとに取っていた重いクエリ（#307 で廃止）とは別物で、
 * width_bucket の GROUP BY 1 本（升 31 個）だけ。
 *
 * 升の定義は lib/rentHistogram の 1 か所。SQL の引数（0 / 30万 / 30）と
 * 整形側の定数がずれると、升番号と金額の対応が黙って崩れる。
 */

export const dynamic = "force-dynamic";

function coordinate(raw: string | null, limit: number): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { conditions, appliedFilters } = buildCountFilters(searchParams);

  // 表示範囲は任意。あれば範囲内だけの分布になる（地図と連動する場合）。
  const minLat = coordinate(searchParams.get("minLat"), 90);
  const maxLat = coordinate(searchParams.get("maxLat"), 90);
  const minLon = coordinate(searchParams.get("minLon"), 180);
  const maxLon = coordinate(searchParams.get("maxLon"), 180);
  const hasBounds =
    minLat !== null && maxLat !== null && minLon !== null && maxLon !== null;
  if (hasBounds) {
    conditions.push(
      Prisma.sql`lat BETWEEN ${minLat} AND ${maxLat}`,
      Prisma.sql`lon BETWEEN ${minLon} AND ${maxLon}`,
    );
  }

  try {
    // width_bucket は 30 万円以上に BUCKET_COUNT（あふれ升）を返す。
    // 0 円未満は無いので 0 番は実質出ない（整形側でも捨てる）。
    const rows = await prisma.$queryRaw<Array<{ bucket: number; n: number }>>`
      SELECT width_bucket(
               rent + coalesce(management_fee, 0),
               0,
               ${OVERFLOW_FLOOR_YEN},
               ${BUCKET_COUNT - 1}
             ) AS bucket,
             count(*)::int AS n
        FROM rental_properties
       WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY bucket`;

    return NextResponse.json({
      success: true,
      data: {
        buckets: shapeRentHistogram(rows),
        appliedFilters,
        bounded: hasBounds,
      },
    });
  } catch (e) {
    console.error("家賃分布の集計に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "家賃の分布を数えられませんでした。" },
      { status: 500 },
    );
  }
}

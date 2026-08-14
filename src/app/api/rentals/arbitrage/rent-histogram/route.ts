import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { buildCountFilters } from "@/lib/rentalCountFilters";
import { RENT_BUCKET_SQL, shapeRentHistogram } from "@/lib/rentHistogram";

/**
 * 総家賃（賃料＋管理費）の分布。「家賃上限をいくつにすれば何件
 * 残るか」を、入力する前に見せるための口。
 *
 * **表示範囲は必須。**最初にこれを足したとき（#318・#319）は範囲を
 * 任意にしていた。すると地図が範囲を報告する前――つまりページを
 * 開いた瞬間――に範囲なしで呼ばれ、全国 100 万行の全表集計になる。
 * それがページを開くたび、絞り込みを変えるたびに走っていた。DB は
 * 4 OCPU で、同時に何か走ると桁で振れることが実測で分かっている。
 * 事故として一度取り消してある（#320）。
 *
 * 範囲があれば @@index([lat, lon]) の範囲引きで済む。範囲が無い
 * 呼び出しは 400 で断る。**「うっかり全国を数える」経路を作らない。**
 *
 * 升の定義（RENT_BUCKET_SQL）は lib/rentHistogram の 1 か所。実行計画を
 * 測るスクリプトも同じ式を読む。
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

  const minLat = coordinate(searchParams.get("minLat"), 90);
  const maxLat = coordinate(searchParams.get("maxLat"), 90);
  const minLon = coordinate(searchParams.get("minLon"), 180);
  const maxLon = coordinate(searchParams.get("maxLon"), 180);

  if (
    minLat === null ||
    maxLat === null ||
    minLon === null ||
    maxLon === null ||
    minLat > maxLat ||
    minLon > maxLon
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "表示範囲（minLat〜maxLon）が要ります。",
      },
      { status: 400 },
    );
  }

  const { conditions, appliedFilters } = buildCountFilters(searchParams);
  conditions.push(
    Prisma.sql`lat BETWEEN ${minLat} AND ${maxLat}`,
    Prisma.sql`lon BETWEEN ${minLon} AND ${maxLon}`,
  );

  try {
    const rows = await prisma.$queryRaw<Array<{ bucket: number; n: number }>>`
      SELECT ${Prisma.raw(RENT_BUCKET_SQL)} AS bucket,
             count(*)::int AS n
        FROM rental_properties
       WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY bucket`;

    return NextResponse.json({
      success: true,
      data: { buckets: shapeRentHistogram(rows), appliedFilters },
    });
  } catch (e) {
    console.error("家賃分布の集計に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "家賃の分布を数えられませんでした。" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import {
  buildCountFilters,
  UNSUPPORTED_COUNT_FILTERS,
} from "@/lib/rentalCountFilters";

/**
 * 地図の表示範囲に入る掲載件数を数えるだけの口。
 *
 * 走査（/api/rentals/arbitrage）は名寄せ・判定込みで数秒かかる。地図を
 * 動かすたびにそれを待っていては、件数が指の動きに追従しない。ここは
 * 座標の範囲と SQL で表せる絞り込みだけで数え、他は何もしない。
 * lat/lon の索引（@@index([lat, lon])）の範囲引きで返る。
 *
 * 数えるのは**掲載件数（名寄せ前）**。名寄せ後の正確な数には全対象行の
 * 集約が要り、軽い口でなくなる。俯瞰の県ラベルも掲載件数なので単位が
 * 揃う。画面は「掲載 N 件」と単位を書き、走査後に出る「条件に一致
 * N 件」（名寄せ後）と取り違えないようにする。
 *
 * 絞り込みの条件は県別件数の口と同じ lib（rentalCountFilters）から
 * 引く。別々に書くと、同じ絞り込みなのに県の合計と表示範囲の数が
 * 食い違う。
 *
 * 認証は掛けない。掲載数は公開情報で、返すのは整数 1 つ。
 */

export const dynamic = "force-dynamic";

/** 緯度・経度として通る値だけ受ける。それ以外は「範囲が無い」扱い。 */
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
      { success: false, error: "表示範囲（minLat〜maxLon）が要ります。" },
      { status: 400 },
    );
  }

  const { conditions, appliedFilters } = buildCountFilters(searchParams);
  conditions.push(
    Prisma.sql`lat BETWEEN ${minLat} AND ${maxLat}`,
    Prisma.sql`lon BETWEEN ${minLon} AND ${maxLon}`,
  );

  try {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
        FROM rental_properties
       WHERE ${Prisma.join(conditions, " AND ")}`;

    return NextResponse.json({
      success: true,
      data: {
        count: Number(rows[0]?.n ?? 0),
        appliedFilters,
        unsupportedFilters: [...UNSUPPORTED_COUNT_FILTERS],
      },
    });
  } catch (e) {
    console.error("表示範囲の件数の集計に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "表示範囲の件数を数えられませんでした。" },
      { status: 500 },
    );
  }
}

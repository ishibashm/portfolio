import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * 地図に置く物件ピン。
 *
 * MagneticMapInner の `properties` に渡す。使うのは
 * id / lat / lon / property_name / rent / address / is_new_build。
 *
 * この route は 2026-05 に作られたが、呼び出し側が繋がれないまま
 * 残っていた（SolarTimeClock の mapProperties は setter を一度も
 * 呼ばれず、常に空だった）。繋ぐにあたって 2 つ直した。
 *
 *   1. 掲載が終わった物件を出さない。expire_date を過ぎたリンクは
 *      404 になる。スキャナー（/api/rentals/arbitrage）は既に外して
 *      いるので、地図だけ古いものを出す状態にしない。expire_date を
 *      持たない古い行は判定できないので、そちらは残す。
 *   2. 必要な列だけ返す。全スカラー列を返すと source_emails まで
 *      ブラウザに出ていく。地図が読まない列は渡さない。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseInt(searchParams.get("limit") || "500", 10);
    // 上限を置く。公開ページから叩ける endpoint なので、limit=999999 で
    // 45 万行を引かせない。
    const limit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 2000)
      : 500;

    const properties = await prisma.rental_properties.findMany({
      where: {
        lat: { not: null },
        lon: { not: null },
        OR: [{ expire_date: null }, { expire_date: { gte: new Date() } }],
      },
      select: {
        id: true,
        lat: true,
        lon: true,
        property_name: true,
        rent: true,
        address: true,
        is_new_build: true,
        url: true,
      },
      take: limit,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(properties);
  } catch (error) {
    console.error("Error fetching map properties:", error);
    return NextResponse.json(
      { error: "Failed to fetch properties" },
      { status: 500 },
    );
  }
}

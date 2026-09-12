import { NextResponse } from "next/server";
import { AREAS } from "@/lib/areaContent";
import { mergeWithListed } from "@/lib/municipalityCoords";
import { nearestMunicipality } from "@/lib/nearestMunicipality";

/**
 * 座標 → 一番近い市区町村名。画面が「35.689 / 139.692」のような座標の
 * 代わりに「東京都千代田区 付近」と出すための口（lib/nearestMunicipality）。
 *
 * 外部サービスには出さない。同梱の代表点（1,894 市区町村）から引く
 * だけなので、DB も要らない。同じ座標は何度も引かれるので 1 日は共有
 * キャッシュに置く（座標は 3 桁に丸めて鍵にする。100m の違いで別の
 * 市区町村になることはまず無い）。
 *
 * 判定には一切使わない。表示だけ。
 */
export const dynamic = "force-dynamic";

let pointsCache: ReturnType<typeof mergeWithListed> | null = null;
function allPoints() {
  pointsCache ??= mergeWithListed(AREAS);
  return pointsCache;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat と lon が要ります" },
      { status: 400 },
    );
  }
  const hit = nearestMunicipality(
    Math.round(lat * 1000) / 1000,
    Math.round(lon * 1000) / 1000,
    allPoints(),
  );
  return NextResponse.json(
    { data: hit },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}

import { NextResponse } from "next/server";
import { AREAS } from "@/lib/areaContent";
import { mergeWithListed } from "@/lib/municipalityCoords";
import { nearestMunicipality } from "@/lib/nearestMunicipality";
import { PORTAL_LINK_DISCLAIMER, portalLinksForCity } from "@/lib/portalLinks";

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
 *
 * ## `portal`（2026-09-23）
 *
 * その市区町村の募集を外部のサイトで見るためのリンク（`portalLinksForCity`）。
 * 「この地点を調べる」が、調べた地点の街の一覧へ渡すのに使う。
 *
 * **組み立てはここ（サーバ）でする。**`portalLinks` は `prefContent` を
 * 引き、その先で方位の JSON と暦エンジンまで連れてくる。物件検索の頁が
 * 画面側で import すると初期バンドルに乗る（`arbitrageBundleLeaf` が止める）。
 * 断り書きも同じ理由で一緒に返す。
 *
 * **開きに行かない。**URL を文字列として組むだけで、相手のサーバーには
 * 1 回も触らない。
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
    {
      data: hit,
      portal: hit
        ? {
            links: portalLinksForCity(hit.code),
            disclaimer: PORTAL_LINK_DISCLAIMER,
          }
        : null,
    },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}

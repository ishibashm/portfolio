import { NextResponse } from "next/server";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * 地名の候補を返す。入力しながら選べるようにするための口。
 *
 * 既存の `/api/geocode` は 1 件しか返さない（normalize が 1 つに畳む）。
 * 「京都市」と打った時点で候補が並ばないと、利用者は正式な住所を
 * 思い出しながら打ち切る必要がある。**入力を楽にするのが目的**なので、
 * 途中まででも候補が出ることを優先する。
 *
 * 引くのは国土地理院の住所検索。物件の座標を埋めるジオコーダ
 * （scripts/geocode_properties.ts）と同じ提供元にする。**同じ地名に
 * 対して画面と物件データで違う座標を使わない**ため。
 *
 * 外部が落ちても画面は止めない。候補が空で返れば、利用者は
 * 緯度経度を直接入れる方へ回れる（入力欄はそちらも残してある）。
 */

export const dynamic = "force-dynamic";

const GSI_ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

/** 出す候補の数。多すぎると選ぶのが仕事になる。 */
const MAX_SUGGESTIONS = 6;

interface GsiFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { title?: string };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  // 1 文字だと候補が広すぎて意味が無い。外に出さない。
  if (q.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  try {
    const res = await fetch(`${GSI_ENDPOINT}?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(8000),
      // 同じ地名は何度も引かれる。公共の口なので共有して負荷を下げる。
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return NextResponse.json({ success: true, data: [] });
    }

    const json = (await res.json()) as GsiFeature[];
    if (!Array.isArray(json)) {
      return NextResponse.json({ success: true, data: [] });
    }

    const seen = new Set<string>();
    const data: { name: string; lat: number; lon: number }[] = [];

    for (const f of json) {
      const coords = f?.geometry?.coordinates;
      const title = f?.properties?.title;
      // GeoJSON は [経度, 緯度] の順。入れ替えて読む。
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const [lon, lat] = coords;
      if (typeof lat !== "number" || typeof lon !== "number") continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (typeof title !== "string" || title.length === 0) continue;
      // 同じ地名が複数返ることがある。並べても選べないので畳む。
      if (seen.has(title)) continue;
      seen.add(title);

      data.push({ name: title, lat, lon });
      if (data.length >= MAX_SUGGESTIONS) break;
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    // 候補が出せなくても入力そのものは続けられる。空で返す。
    console.error("地名の候補を取得できませんでした:", toLogMessage(e));
    return NextResponse.json({ success: true, data: [] });
  }
}

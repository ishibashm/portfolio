import { NextResponse } from "next/server";
import { normalize } from "@geolonia/normalize-japanese-addresses";
import { municipalityCodeFromPortalUrl } from "@/lib/portalLinks";
import { AREAS } from "@/lib/areaContent";
import { mergeWithListed } from "@/lib/municipalityCoords";

/**
 * 市区町村コード（JIS 5 桁）から代表点を引く。
 *
 * 掲載のある街に出典の側を合流させた 1,894 件。合流の向きは
 * `mergeWithListed` の註のとおりで、**掲載側の座標を優先する**
 * （同じ画面の一覧と方位が食い違わないため）。
 */
const POINT_BY_CODE = new Map(mergeWithListed(AREAS).map((m) => [m.code, m]));

/**
 * 入力が URL かどうか。**綴りだけを見る。開きに行かない。**
 *
 * URL を外へ投げないために要る。下の nominatim は `q` をそのまま
 * 載せるので、物件ページの URL を貼られると**貼った本人の物件が
 * 外部のサービスに渡る。**#1310 で「地点に物件の URL を控える」欄を
 * 作った以上、この欄に URL が貼られるのは想定内の操作。
 */
function looksLikeUrl(raw: string): boolean {
  return (
    /^(?:https?:)?\/\//i.test(raw.trim()) ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw.trim())
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 },
    );
  }

  /*
    URL は**ここで折り返す。**外（geolonia・nominatim）へは一切渡さない。

    綴りから市区町村が読めるなら、その街の代表点を返す（相手のサーバーには
    1 回も触らない。`municipalityCodeFromPortalUrl` の註）。読めないなら
    404 にして、地名で入れ直してもらう。
  */
  if (looksLikeUrl(q)) {
    const code = municipalityCodeFromPortalUrl(q);
    const point = code ? POINT_BY_CODE.get(code) : undefined;
    if (point) {
      return NextResponse.json({
        lat: point.lat,
        lon: point.lon,
        name: `${point.pref}${point.city}`,
        /* 街の代表点であって、物件そのものの場所ではない */
        source: "municipality",
      });
    }
    return NextResponse.json(
      {
        error:
          "その URL からは場所を読み取れませんでした。市区町村名で入れてみてください。",
      },
      { status: 404 },
    );
  }

  try {
    const result = await normalize(q);

    if (result.point && result.point.lat && result.point.lng) {
      return NextResponse.json({
        lat: result.point.lat,
        lon: result.point.lng,
        name:
          `${result.pref || ""}${result.city || ""}${result.town || ""}${result.addr || ""}` ||
          q,
      });
    }

    // Fallback: If normalize fails, we can try nominatim or just return 404
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      {
        headers: {
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          "User-Agent": "Kigaku-Relocation-App/1.0",
        },
      },
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        return NextResponse.json({
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          name: item.display_name.split(",")[0] || q,
        });
      }
    } else {
      console.error(`Nominatim API returned ${res.status} ${res.statusText}`);
    }

    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  } catch (error) {
    console.error("Geocoding API error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

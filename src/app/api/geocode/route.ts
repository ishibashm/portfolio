import { NextResponse } from "next/server";
import { normalize } from "@geolonia/normalize-japanese-addresses";
import { lookupGsi } from "@/lib/gsiGeocode";
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

  /*
    住所は**国土地理院を先に引く。**

    `normalize()` が返す `point` は町丁目ごとの座標とは限らない。岡崎市では
    706 種類の町名がすべて level=3 と判定されながら**同一の点（市の代表点）**
    を返しており、巡回の実測で 157,116 件中 72,527 件が「50 件以上が完全に
    同一座標」の塊に入っていた（`src/lib/gsiGeocode.ts` の註）。

    巡回はこれを理由に国土地理院へ切り替えたが、**選んだ文字列を点に落とす
    この口は取り残されていた。**物件ページから住所を正確に写して入れても、
    市の中心が返りうる状態だった。

    **番地は落とさない。**巡回（`scripts/geocodeGsi.ts`）は町丁目単位の
    キャッシュを作るために番地を捨てるが、あれは公共 API への負荷を
    「行数」ではなく「町丁目の数」で頭打ちにするための都合。ここは
    1 回の操作に 1 回引くだけなので、捨てると精度をただ失う。

    `normalize()` は**表記ゆれを整えるためだけ**に使う（"字６丁目" →
    "字六丁目" など）。点は見ない。
  */
  try {
    let normalized: Awaited<ReturnType<typeof normalize>> | null = null;
    try {
      normalized = await normalize(q);
    } catch {
      /* 正規化に失敗しても生の住所で引けることがあるので、そのまま進む */
    }

    const tidy =
      normalized?.pref && normalized?.city
        ? `${normalized.pref}${normalized.city}${normalized.town ?? ""}${normalized.addr ?? ""}`
        : null;
    const name = tidy || q;

    for (const query of tidy && tidy !== q ? [tidy, q] : [q]) {
      /* 整えた綴りで見つからないことがある（過剰に整うことがある）ので、
         元の綴りでも 1 度試す。**落ちた（error）ときは次へ回さない** —
         通信が落ちただけの回で「無い」と答えないため */
      const gsi = await lookupGsi(query);
      if (gsi.kind === "ok") {
        return NextResponse.json({
          lat: gsi.point.lat,
          lon: gsi.point.lon,
          name,
          /* 番地まで当たった点。呼ぶ側が粗さを見分けられるようにする */
          source: "gsi",
        });
      }
      if (gsi.kind === "error") break;
    }

    if (normalized?.point && normalized.point.lat && normalized.point.lng) {
      return NextResponse.json({
        lat: normalized.point.lat,
        lon: normalized.point.lng,
        name,
        /* **市の中心に潰れていることがある。**黙って番地の点として
           扱わせない（CLAUDE.md 3 節「黙って別のものに落ちる」） */
        source: "normalize",
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
          /* 日本の住所に強くない。最後の手段 */
          source: "nominatim",
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

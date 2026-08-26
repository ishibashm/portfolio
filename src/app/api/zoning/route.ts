import { NextResponse } from "next/server";
import { toLogMessage } from "@/lib/errorMessage";
import {
  isTinyGeometry,
  simplifyGeometry,
  toleranceForZoom,
  type SimplifyStats,
} from "@/lib/simplifyGeo";
import {
  isTileCoordinate,
  isZoningZoom,
  zoningPropertiesOf,
  ZONING_MAX_ZOOM,
  ZONING_MIN_ZOOM,
} from "@/utils/zoning";

/**
 * 用途地域を 1 タイルぶん中継する。
 *
 * 取得元は国土交通省「不動産情報ライブラリ」の `XKT002`
 * （都市計画決定情報・用途地域）。地価公示（`XPT002`）や成約価格
 * （`XIT001`）と同じ ex-api で、鍵も同じ `LIBRARY_API_KEY`。
 *
 * ## DB に取り込まない
 *
 * 1 タイルが z=14 で 35〜216KB（実測。全国 18 か所）。ブラウザから
 * 直接叩けば済む大きさだが、サーバを挟む理由が 3 つある。
 *
 *   1. **鍵をブラウザに出さない。**ex-api は
 *      `Ocp-Apim-Subscription-Key` を要求する
 *   2. **キャッシュを共有する。**用途地域は年に数回しか変わらないので、
 *      利用者ごとに外へ出る必要がない
 *   3. **書式をここで揃える。**建蔽率・容積率が "50%" と "50.0%" で
 *      混ざって来る（実測）
 *
 * 取り込まないので、DDL も夜間の取り込みも要らず、常に最新が出る。
 *
 * ## 広域では出さない・頂点は間引く
 *
 * 下限は `ZONING_MIN_ZOOM`（z13。受け取る側で測った根拠は
 * `utils/zoning`）。返す前に、そのズームの 0.5 画素に満たない折れ点を
 * 間引き、1 画素四方に満たない区画を落とす（`lib/simplifyGeo`）。
 * 見た目は 1 画素未満しか変わらず、いちばん重い千代田区で 1 タイルが
 * 3 割強小さくなる（実測は `scripts/probe_zoning_simplify.ts`）。
 * z=12 は間引いても 1 画面 6.5MB になるので出さない。
 */

/**
 * 30 日。用途地域の変更は年に数回で、決定から施行まで数か月かかる。
 * 1 日で捨てると、変わらないものを毎日取りに行くことになる。
 */
export const revalidate = 2592000;

const ENDPOINT = "https://www.reinfolib.mlit.go.jp/ex-api/external/XKT002";

/*
  この error は地図の帯にそのまま出る（利用者が読む）ので**日本語**。
  CLAUDE.md 4 節の「その応答の error を誰が読むか」に従う。
*/
const MESSAGES = {
  BAD_TILE: "タイルの指定が正しくありません。",
  ZOOM: "この縮尺では用途地域を出していません（地図を拡大してください）。",
  NO_KEY: "用途地域の取得が設定されていません。",
  UPSTREAM: "用途地域を取得できませんでした。時間をおいてお試しください。",
} as const;

interface RawFeature {
  type?: string;
  /* 上流は Polygon / MultiPolygon しか返さない（probe_zoning.ts の実測）。
     知らない型が来ても simplifyGeometry はそのまま返すだけで、落とさない。 */
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  /*
    先に「有るか」を見る。Number(null) は 0 になるので、指定なしの
    要求が z=0/x=0/y=0 として通り、縮尺の判定まで進んでしまう。
    本番で叩いたら「この縮尺では用途地域を出していません」と返ってきた
    （実測）。指定が無いのは縮尺の問題ではないので、そう言わない。
  */
  if (
    !searchParams.has("z") ||
    !searchParams.has("x") ||
    !searchParams.has("y")
  ) {
    return NextResponse.json({ error: MESSAGES.BAD_TILE }, { status: 400 });
  }

  const z = Number(searchParams.get("z"));
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));

  if (!Number.isInteger(z) || !isTileCoordinate(z, x, y)) {
    return NextResponse.json({ error: MESSAGES.BAD_TILE }, { status: 400 });
  }
  if (!isZoningZoom(z)) {
    return NextResponse.json(
      {
        error: MESSAGES.ZOOM,
        minZoom: ZONING_MIN_ZOOM,
        maxZoom: ZONING_MAX_ZOOM,
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.LIBRARY_API_KEY;
  if (!apiKey) {
    /*
      鍵が無いのは環境の設定漏れで、利用者には直せない。500 ではなく
      503 にして「いまは出せない」と分かる形にする。
    */
    console.error("用途地域: LIBRARY_API_KEY が未設定");
    return NextResponse.json({ error: MESSAGES.NO_KEY }, { status: 503 });
  }

  const url = `${ENDPOINT}?response_format=geojson&z=${z}&x=${x}&y=${y}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey, Accept: "*/*" },
      next: { revalidate },
    });
  } catch (e) {
    console.error("用途地域の取得に失敗:", toLogMessage(e));
    return NextResponse.json({ error: MESSAGES.UPSTREAM }, { status: 502 });
  }

  if (res.status === 404) {
    /*
      そのタイルに都市計画の決定が無い（都市計画区域の外など）。
      失敗ではないので、空のまま返す。エラーにすると海や山を見るたびに
      赤い帯が出る。
    */
    return NextResponse.json({ type: "FeatureCollection", features: [] });
  }
  if (!res.ok) {
    console.error(`用途地域: 上流が ${res.status} ${res.statusText}`);
    return NextResponse.json({ error: MESSAGES.UPSTREAM }, { status: 502 });
  }

  let body: { features?: RawFeature[] };
  try {
    body = await res.json();
  } catch (e) {
    console.error("用途地域: JSON として読めない:", toLogMessage(e));
    return NextResponse.json({ error: MESSAGES.UPSTREAM }, { status: 502 });
  }

  /*
    要る項目だけに絞る。落としているのは _id・_index と、全国どこでも
    空文字だった decision_date・notice_number・decision_maker など（実測）。

    座標は**間引くだけ**で、位置は動かさない。許容量はそのズームの
    0.5 画素ぶんなので、消えるのは描いても見えない折れ点だけ。輪が
    4 点を下回るなら元の輪をそのまま返す（区画が線に潰れて消えるのは
    重いより悪い。lib/simplifyGeo）。1 画素四方に満たない区画も落とす
    （z13 で最大 3/135 件、z14 では 0 件——実測）。
  */
  const tolerance = toleranceForZoom(z, 0.5);
  const minArea = toleranceForZoom(z, 1) ** 2;
  const stats: SimplifyStats = { before: 0, after: 0, dropped: 0 };
  const features = (body.features ?? []).flatMap((f) => {
    if (!f.geometry) return [];
    const geometry = simplifyGeometry(f.geometry, tolerance, stats);
    if (isTinyGeometry(geometry, minArea)) {
      stats.dropped += 1;
      return [];
    }
    return [
      {
        type: "Feature" as const,
        geometry,
        properties: zoningPropertiesOf(f.properties),
      },
    ];
  });

  /*
    dropped は「小さすぎて落とした区画の数」。**黙って減らさない**ための
    しるしで、GeoJSON の foreign member として載せる（読む側は無視して
    よい。ZoningLayer は features しか読まない）。
  */
  return NextResponse.json({
    type: "FeatureCollection",
    features,
    dropped: stats.dropped,
  });
}

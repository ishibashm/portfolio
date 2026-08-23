import { NextResponse } from "next/server";
import { toLogMessage } from "@/lib/errorMessage";
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
 * ## 広域では出さない
 *
 * z=13 以下は 1 タイルで 435KB〜3.6MB（実測）。画面には十数タイル並ぶので
 * そのまま出すと 1 画面で数十 MB になる。`ZONING_MIN_ZOOM` で弾く。
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
  geometry?: unknown;
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
    要る項目だけに絞る。**座標には触らない。**多角形を触ると形が変わる。
    落としているのは _id・_index と、全国どこでも空文字だった
    decision_date・notice_number・decision_maker など（実測）。
  */
  const features = (body.features ?? [])
    .filter((f) => f.geometry)
    .map((f) => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: zoningPropertiesOf(f.properties),
    }));

  return NextResponse.json({ type: "FeatureCollection", features });
}

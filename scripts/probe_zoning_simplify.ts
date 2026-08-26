import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import { latToTileY, lonToTileX } from "../src/lib/tileCoords";
import {
  isTinyGeometry,
  simplifyGeometry,
  toleranceForZoom,
  type SimplifyStats,
} from "../src/lib/simplifyGeo";
import { zoningPropertiesOf } from "../src/utils/zoning";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 用途地域を**間引いたらどこまで軽くなるか**を実物で測る。
 *
 * ## なぜ要るか
 *
 * 用途地域は z14 より広くは出していない。理由は `utils/zoning` に書いた
 * 実測で、千代田区の 1 タイルが z13 で 435KB、z12 で 1.9MB になる。
 * 画面には十数タイル並ぶので、z13 で出すと 1 画面 5MB 前後。
 *
 * 利用者から「どこまで俯瞰で出せるか」と聞かれた。**広い縮尺ほど頂点は
 * 要らない**はずなので、間引けば下げられる見込みはある。ただし
 * **どこまで減るかは推測で書かない。**同じ理由で `probe_zoning.ts` を
 * 書いた（推測で実装を書かない）。
 *
 * ## 何を測るか
 *
 * z12 / z13 のタイルを取り、次の 3 通りで大きさを比べる。
 *
 *   1. 上流そのまま
 *   2. **中継後**（/api/zoning と同じく zoningPropertiesOf で 5 項目に絞る）
 *   3. 2 に加えて頂点を間引く（許容量 = そのズームの 1 / 2 画素ぶん）
 *   4. 3 に加えて、1 画素にも満たない区画を落とす
 *
 * ## 2 を測るのがいちばん大事
 *
 * `ZONING_MIN_ZOOM = 14` の根拠に書いてある数字（z13 で 435KB、z12 で
 * 1.9MB）は**上流のサイズ**。ところが `/api/zoning` は上流をそのまま
 * 返しておらず、`zoningPropertiesOf` で 5 項目に絞っている。
 * **判断すべきはブラウザが受け取る側なのに、そこは誰も測っていない。**
 *
 * 出すのは**バイト数・件数・頂点数**。減り方が分かれば、z を下げられるか
 * どうかを数で決められる。
 *
 * ## 何も変えない
 *
 * 読んで数えるだけ。DB にも API にも書かない。
 */

const API_KEY = process.env.LIBRARY_API_KEY ?? "";
if (!API_KEY) {
  console.error("LIBRARY_API_KEY がありません。");
  process.exit(1);
}

const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const ZONING_ID = "XKT002";
const headers = { "Ocp-Apim-Subscription-Key": API_KEY, Accept: "*/*" };

/** 上流を叩きすぎない。1 秒あける。 */
const WAIT_MS = 1000;
const wait = () => new Promise((r) => setTimeout(r, WAIT_MS));

/** 密なところと粗いところの両方を見る。片方だけだと判断を誤る。 */
const SPOTS = [
  { name: "東京・千代田区", lat: 35.6938, lon: 139.7536 },
  { name: "大阪・北区", lat: 34.7055, lon: 135.4983 },
  { name: "札幌・中央区", lat: 43.0554, lon: 141.3469 },
  { name: "松本市", lat: 36.238, lon: 137.972 },
];

const ZOOMS = [12, 13, 14];

interface FeatureCollection {
  type: string;
  features: {
    type: string;
    geometry: { type: string; coordinates: unknown };
    properties?: Record<string, unknown>;
  }[];
}

async function fetchTile(
  z: number,
  x: number,
  y: number,
): Promise<FeatureCollection | null> {
  const url = `${BASE}/${ZONING_ID}?response_format=geojson&z=${z}&x=${x}&y=${y}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as FeatureCollection;
  } catch {
    return null;
  }
}

function countVertices(fc: FeatureCollection): number {
  const stats: SimplifyStats = { before: 0, after: 0, dropped: 0 };
  for (const f of fc.features) simplifyGeometry(f.geometry, 0, stats);
  return stats.before;
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function main() {
  console.log("# 用途地域を間引いたときの大きさ\n");
  console.log(
    "許容量はそのズームの **0.5 画素**ぶん、落とす区画は **1 画素四方**に満たないもの。\n",
  );
  console.log(
    "| 場所 | z | 件数 | 上流 | 中継後 | +間引き | +小区画を落とす | 残った件数 | 頂点 |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|");

  for (const spot of SPOTS) {
    for (const z of ZOOMS) {
      const x = lonToTileX(spot.lon, z);
      const y = latToTileY(spot.lat, z);
      const fc = await fetchTile(z, x, y);
      await wait();

      if (!fc || !Array.isArray(fc.features)) {
        console.log(`| ${spot.name} | ${z} | 取得できず | | | | | |`);
        continue;
      }

      const rawBytes = bytesOf(fc);
      const rawVerts = countVertices(fc);

      /* 中継（/api/zoning）と同じ絞り込み。ブラウザが受け取るのはこれ。 */
      const relayed: FeatureCollection = {
        type: "FeatureCollection",
        features: fc.features
          .filter((f) => f.geometry)
          .map((f) => ({
            type: "Feature",
            geometry: f.geometry,
            properties: zoningPropertiesOf(f.properties) as unknown as Record<
              string,
              unknown
            >,
          })),
      };
      const relayBytes = bytesOf(relayed);

      const tol = toleranceForZoom(z, 0.5);
      const stats: SimplifyStats = { before: 0, after: 0, dropped: 0 };
      const simplified: FeatureCollection = {
        ...relayed,
        features: relayed.features.map((f) => ({
          ...f,
          geometry: simplifyGeometry(f.geometry, tol, stats) as {
            type: string;
            coordinates: unknown;
          },
        })),
      };
      const simpBytes = bytesOf(simplified);

      // 1 画素四方に満たない区画を落とす
      const px = toleranceForZoom(z, 1);
      const minArea = px * px;
      const pruned: FeatureCollection = {
        ...simplified,
        features: simplified.features.filter(
          (f) => !isTinyGeometry(f.geometry, minArea),
        ),
      };
      const prunedBytes = bytesOf(pruned);

      const pct = (n: number) => `${((n / rawBytes) * 100).toFixed(0)}%`;

      console.log(
        `| ${spot.name} | ${z} | ${fc.features.length} | ` +
          `${rawBytes.toLocaleString()} | ` +
          `${relayBytes.toLocaleString()} (${pct(relayBytes)}) | ` +
          `${simpBytes.toLocaleString()} (${pct(simpBytes)}) | ` +
          `${prunedBytes.toLocaleString()} (${pct(prunedBytes)}) | ` +
          `${pruned.features.length} | ${rawVerts.toLocaleString()} → ${stats.after.toLocaleString()} |`,
      );
    }
  }

  console.log("\n## 読み方\n");
  console.log(
    "- 画面には十数タイル並ぶ。**1 タイルの大きさ × 15 くらい**が 1 画面ぶん\n" +
      "- **比べるのは「中継後」の列どうし。**ブラウザが受け取るのはこれ\n" +
      "- いまの下限 z14 の中継後が基準。z13 / z12 がこれに近ければ下げられる\n" +
      "- **落ちた件数も見ること。**軽くても区画が消えていたら意味が無い",
  );
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});

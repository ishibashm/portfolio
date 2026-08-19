import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 地価公示・都道府県地価調査（XPT002）の**実物を見るだけ**の道具。
 *
 * import_land_prices.ts は価格の項目名を推測で拾っている。
 *
 *   feature.properties?.price ||
 *   feature.properties?.LandPrice ||
 *   feature.properties?.["地価"] ||
 *   feature.properties?.P01 ||
 *   parseInt(feature.properties?.P01_006 || "0")
 *
 * それでも当たらないと、**properties の中で 1000 より大きい数値を
 * 何でも 1 つ拾う**という最後の手段に落ちる。面積・座標・年度・
 * 整理番号のどれを拾っても気付けない。しかもその値は市区町村の
 * landPricePerSqm に入り、/relocation/wealth のコスパ指数
 * （所得 ÷ 地価）の分母になる。
 *
 * 直す前に**本当の項目名を確かめる**。成約価格の取り込み
 * （propertyTxParse.ts）で「項目名は probe で実物を確認済み」と
 * したのと同じ手順。ここは取得して表示するだけで、DB には
 * 一切書かない。
 *
 *   LAND_PROBE_YEAR=2025 npx tsx scripts/probe_land_prices.ts
 *
 * 年を変えて 404 になるかどうかも、この道具で分かる（import 側は
 * 2023 で固定されたままなので、いつまで有効かを知っておきたい）。
 */

const API_KEY = process.env.LIBRARY_API_KEY;
if (!API_KEY) {
  console.error("LIBRARY_API_KEY が未設定。");
  process.exit(1);
}

const YEAR = process.env.LAND_PROBE_YEAR || "2025";

/** 見に行く地点。都心・地方都市・郊外で、項目の欠け方が違わないか見る。 */
const SPOTS: { name: string; lat: number; lon: number }[] = [
  { name: "東京都千代田区", lat: 35.6938, lon: 139.7532 },
  { name: "愛知県名古屋市中区", lat: 35.1667, lon: 136.9066 },
  { name: "京都府京都市下京区", lat: 34.9859, lon: 135.7585 },
  { name: "北海道旭川市", lat: 43.7708, lon: 142.365 },
  { name: "鹿児島県鹿児島市", lat: 31.5966, lon: 130.5571 },
];

function latLonToTile(lat: number, lon: number, zoom = 15) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
  return { z: zoom, x, y };
}

async function main() {
  console.log(`対象年: ${YEAR}（z=15 のタイルで取得）`);

  /** 項目名 → 出てきた回数。全地点をまたいで数える。 */
  const keyCount = new Map<string, number>();
  /** 項目名 → 値の例（先頭 3 つ）。 */
  const keySamples = new Map<string, unknown[]>();
  let totalFeatures = 0;

  for (const spot of SPOTS) {
    const { z, x, y } = latLonToTile(spot.lat, spot.lon);
    const url = `https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002?response_format=geojson&z=${z}&x=${x}&y=${y}&year=${YEAR}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Ocp-Apim-Subscription-Key": API_KEY!, Accept: "*/*" },
      });
    } catch (err) {
      console.log(`${spot.name}: 取得に失敗 ${String(err)}`);
      continue;
    }

    if (!res.ok) {
      console.log(`${spot.name}: HTTP ${res.status} ${res.statusText}`);
      continue;
    }

    const body = (await res.json()) as {
      features?: { properties?: Record<string, unknown> }[];
    };
    const features = body.features ?? [];
    console.log(
      `${spot.name}: タイル ${z}/${x}/${y} → ${features.length} 地点`,
    );
    totalFeatures += features.length;

    for (const f of features) {
      for (const [k, v] of Object.entries(f.properties ?? {})) {
        keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
        const s = keySamples.get(k) ?? [];
        if (s.length < 3) {
          s.push(v);
          keySamples.set(k, s);
        }
      }
    }

    // 1 秒空ける。import 側と同じ間隔。
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n合計 ${totalFeatures} 地点。項目は ${keyCount.size} 種類。\n`);
  console.log("項目名 / 出現数 / 値の例");
  for (const [k, n] of [...keyCount.entries()].sort((a, b) => b[1] - a[1])) {
    const samples = (keySamples.get(k) ?? [])
      .map((v) => JSON.stringify(v))
      .join(" , ");
    console.log(`  ${k}  (${n})  ${samples}`);
  }

  // いまの import が拾っている値が何なのかも、その場で見せる。
  console.log("\n※ import_land_prices.ts が推測で見ている項目:");
  for (const k of ["price", "LandPrice", "地価", "P01", "P01_006"]) {
    console.log(`  ${k}: ${keyCount.has(k) ? "ある" : "**無い**"}`);
  }
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});

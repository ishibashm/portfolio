import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 用途地域（都市計画決定情報）を**実物で確かめるだけ**の道具。
 *
 * ## 1 回目で分かったこと（2026-08-22 実測）
 *
 * **用途地域は `XKT002`**（`_index: bs001_use_area_…`）。東京の z=14 で
 * 60 件 / 191,779 バイト。項目は次のとおり。
 *
 *   use_area_ja                   "商業地域" "第１種住居地域" …（**全角の数字**）
 *   youto_id                      10 5 3 11
 *   u_building_coverage_ratio_ja  "80.0%" "60.0%"      建蔽率
 *   u_floor_area_ratio_ja         "600.0%" "300.0%"    容積率
 *   prefecture / city_code / city_name
 *
 * `XKT001` は都市計画区域・区域区分（`area_classification_ja` が
 * "都市計画区域" "市街化区域"、`kubun_id` が 21 22）。XKT004〜011 は
 * 学区・学校・医療・福祉で、用途地域ではない。
 *
 * ## 2 回目で確かめること
 *
 * 1 回目はズームと場所を **XKT001 で**振ってしまった（応えた一覧の
 * 1 つめを使う作りだった）ので、**XKT002 の大きさを測れていない。**
 * それと `youto_id` は 13 区分あるはずが 4 つしか見えていない。
 *
 *   1. XKT002 のズーム別の件数と大きさ（どの z から中継できるか）
 *   2. `youto_id` ↔ `use_area_ja` の対応を**全国の多数のタイルで埋める**
 *   3. 建蔽率・容積率の値の書式が場所によって崩れないか
 *
 * 「商業地域などの区分を地図で見たい」という要望に対して、まずどの
 * API がどんな形で返すのかを見る。**推測で実装を書かない。**
 * 地価公示（`probe_land_prices.ts`）で同じ手順を踏んだのと同じ理由で、
 * 項目名を当てずっぽうで拾う実装は、外れても気付けない。
 *
 * このリポジトリは既に不動産情報ライブラリ（reinfolib）の XPT002 と
 * XIT001 を使っていて、鍵（`LIBRARY_API_KEY`）も通っている。用途地域も
 * 同じ ex-api にあるはずだが、**エンドポイントの ID を確かめていない。**
 * 開発環境からは mlit.go.jp に出られない（egress で 403）ので、
 * ここで確かめる以外に手が無い。
 *
 * 見たいのは 4 つ。
 *
 *   1. どの ID が 200 を返すか（候補を順に叩く）
 *   2. どのズームで取れるか（タイル指定 API はズームに制限がある）
 *   3. 用途地域の種類がどの項目名・どの値で入っているか
 *   4. 1 タイルあたりのポリゴン数と応答の大きさ（そのまま中継できるか）
 *
 * **DB には一切書かない。**DATABASE_URL も要らない。
 *
 *   npx tsx scripts/probe_zoning.ts
 */

const API_KEY = process.env.LIBRARY_API_KEY;
if (!API_KEY) {
  console.error("LIBRARY_API_KEY が未設定。");
  process.exit(1);
}

const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";

/** 用途地域のエンドポイント。1 回目の実測で確定した。 */
const ZONING_ID = "XKT002";

/**
 * 見に行く場所。
 *
 * `youto_id` の 13 区分を埋めるには、**用途の偏りが違う場所**を混ぜる
 * 必要がある。都心だけ見ても工業専用地域も低層住居専用地域も出てこない。
 * 湾岸の工業地帯、郊外の住宅地、地方都市、田園部を入れる。
 */
const SPOTS: { name: string; lat: number; lon: number }[] = [
  { name: "東京都千代田区（都心）", lat: 35.6938, lon: 139.7532 },
  { name: "東京都世田谷区（低層住宅）", lat: 35.6465, lon: 139.6533 },
  { name: "東京都大田区京浜島（工業専用）", lat: 35.5661, lon: 139.7625 },
  { name: "千葉県市原市五井（臨海工業）", lat: 35.5133, lon: 140.0906 },
  { name: "神奈川県川崎市川崎区（工業）", lat: 35.5133, lon: 139.7028 },
  { name: "愛知県名古屋市中区", lat: 35.1667, lon: 136.9066 },
  { name: "愛知県豊田市（工業＋住居）", lat: 35.0824, lon: 137.1563 },
  { name: "京都府京都市下京区", lat: 34.9859, lon: 135.7585 },
  { name: "大阪府堺市西区（臨海）", lat: 34.5333, lon: 135.4333 },
  { name: "兵庫県神戸市灘区（住居）", lat: 34.7078, lon: 135.2311 },
  { name: "福岡県福岡市博多区", lat: 33.5904, lon: 130.4207 },
  { name: "北海道札幌市中央区", lat: 43.0554, lon: 141.3469 },
  { name: "宮城県仙台市青葉区", lat: 38.2682, lon: 140.8694 },
  { name: "広島県広島市中区", lat: 34.3853, lon: 132.4553 },
  { name: "静岡県浜松市中央区", lat: 34.7108, lon: 137.7261 },
  { name: "茨城県つくば市（田園部）", lat: 36.0835, lon: 140.0764 },
  { name: "長野県松本市（地方都市）", lat: 36.238, lon: 137.9721 },
  { name: "沖縄県那覇市", lat: 26.2124, lon: 127.6809 },
];

/**
 * タイル指定 API のズーム制限を探る。
 *
 * 前回（run 33806982160）は 11〜15 で、11 が返ることまで分かった。
 * 利用者の要望「用途地域を全国の俯瞰でも見たい」に答えるには、
 * **10 以下を上流が返すのか**を知る必要がある。返らないなら
 * 子タイルから組むしかなく、z5 の 1 枚は z11 の 4,096 枚になる
 * （utils/zoning の註）。返るなら raster の下限をそこまで下げられる。
 *
 * 10 以下は「非対応」と「区画が無い」がどちらも 404 で区別できない
 * （lib/zoningUpstream）ので、本文の先頭（note）も一緒に出す。
 * 12 は前回と同じ値が返るかを見る対照。
 */
const ZOOMS = [5, 6, 7, 8, 9, 10, 11, 12];

function latLonToTile(lat: number, lon: number, zoom: number) {
  const x = Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
  return { z: zoom, x, y };
}

const headers = { "Ocp-Apim-Subscription-Key": API_KEY, Accept: "*/*" };

/** 叩く間隔。import 側と同じ 1 秒。 */
const WAIT_MS = 1000;
const wait = () => new Promise((r) => setTimeout(r, WAIT_MS));

interface Probe {
  status: number;
  bytes: number;
  features: number;
  keys: Map<string, unknown[]>;
  note: string;
}

async function probe(url: string): Promise<Probe> {
  const empty = { status: 0, bytes: 0, features: 0, keys: new Map(), note: "" };
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    return { ...empty, note: `取得に失敗 ${String(err)}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return {
      ...empty,
      status: res.status,
      bytes: text.length,
      /* 本文に理由が入っていることがある。先頭だけ出す。 */
      note: text.slice(0, 200).replace(/\s+/g, " "),
    };
  }

  let body: { features?: { properties?: Record<string, unknown> }[] };
  try {
    body = JSON.parse(text);
  } catch {
    return {
      ...empty,
      status: res.status,
      bytes: text.length,
      note: `JSON として読めない: ${text.slice(0, 120)}`,
    };
  }

  const features = body.features ?? [];
  const keys = new Map<string, unknown[]>();
  for (const f of features) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      const s = keys.get(k) ?? [];
      if (
        s.length < 4 &&
        !s.some((x) => JSON.stringify(x) === JSON.stringify(v))
      )
        s.push(v);
      keys.set(k, s);
    }
  }
  return {
    status: res.status,
    bytes: text.length,
    features: features.length,
    keys,
    note: "",
  };
}

/** 中身まで要るとき。properties をそのまま返す。 */
async function probeFeatures(
  url: string,
): Promise<{ features: Record<string, unknown>[]; bytes: number }> {
  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch {
    return { features: [], bytes: 0 };
  }
  const text = await res.text();
  if (!res.ok) return { features: [], bytes: text.length };
  try {
    const body = JSON.parse(text) as {
      features?: { properties?: Record<string, unknown> }[];
    };
    return {
      features: (body.features ?? []).map((f) => f.properties ?? {}),
      bytes: text.length,
    };
  } catch {
    return { features: [], bytes: text.length };
  }
}

async function main() {
  console.log("## 1. XKT002 のズーム別（東京・千代田区）\n");
  console.log("| z | 件数 | バイト |");
  console.log("|---|---|---|");
  for (const zoom of ZOOMS) {
    const t = latLonToTile(SPOTS[0].lat, SPOTS[0].lon, zoom);
    const url = `${BASE}/${ZONING_ID}?response_format=geojson&z=${t.z}&x=${t.x}&y=${t.y}`;
    const r = await probe(url);
    console.log(
      `| ${zoom} | ${r.status === 200 ? r.features : `HTTP ${r.status}`} | ${r.bytes.toLocaleString()} | ${r.note}`,
    );
    await wait();
  }

  console.log("\n## 2. youto_id と use_area_ja の対応（全国を走査）\n");

  /** youto_id → 名前（複数出たら食い違い）。 */
  const idToNames = new Map<number, Set<string>>();
  /** 建蔽率・容積率の書式。崩れがあれば分かる。 */
  const coverageFormats = new Set<string>();
  const floorFormats = new Set<string>();
  /** 場所ごとの件数と大きさ。中継できるかの目安。 */
  const perSpot: { name: string; features: number; bytes: number }[] = [];

  for (const spot of SPOTS) {
    /*
      z=14 で見る。z=13 以下は 1 タイルが重く、z=15 以上だと 1 タイルに
      1〜2 区分しか入らず対応表が埋まらない。
    */
    const t = latLonToTile(spot.lat, spot.lon, 14);
    const url = `${BASE}/${ZONING_ID}?response_format=geojson&z=${t.z}&x=${t.x}&y=${t.y}`;
    const r = await probeFeatures(url);
    perSpot.push({
      name: spot.name,
      features: r.features.length,
      bytes: r.bytes,
    });

    for (const props of r.features) {
      const id = props.youto_id;
      const name = props.use_area_ja;
      if (typeof id === "number" && typeof name === "string" && name !== "") {
        const set = idToNames.get(id) ?? new Set<string>();
        set.add(name);
        idToNames.set(id, set);
      }
      const cov = props.u_building_coverage_ratio_ja;
      if (typeof cov === "string" && cov !== "") coverageFormats.add(cov);
      const flo = props.u_floor_area_ratio_ja;
      if (typeof flo === "string" && flo !== "") floorFormats.add(flo);
    }
    await wait();
  }

  console.log("| youto_id | use_area_ja |");
  console.log("|---|---|");
  for (const id of [...idToNames.keys()].sort((a, b) => a - b)) {
    const names = [...(idToNames.get(id) ?? [])];
    /* 1 つの id に 2 つ以上の名前が付いたら、対応表にできない。 */
    const flag = names.length > 1 ? "  ← **食い違い**" : "";
    console.log(`| ${id} | ${names.join(" / ")}${flag} |`);
  }
  console.log(`\n見つかった区分: ${idToNames.size} 種類（用途地域は 13 種類）`);

  console.log("\n## 3. 場所ごとの件数と大きさ（z=14）\n");
  console.log("| 場所 | 件数 | バイト |");
  console.log("|---|---|---|");
  for (const p of perSpot) {
    console.log(`| ${p.name} | ${p.features} | ${p.bytes.toLocaleString()} |`);
  }

  console.log("\n## 4. 建蔽率・容積率の書式\n");
  console.log(`  建蔽率: ${[...coverageFormats].sort().join(" , ")}`);
  console.log(`  容積率: ${[...floorFormats].sort().join(" , ")}`);
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});

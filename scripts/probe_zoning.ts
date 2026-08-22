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

/**
 * 叩いてみる ID。都市計画決定情報のあたりを順に見る。
 *
 * 当たりが分かったら**この一覧は消して、当たった 1 つだけ**を
 * import 側に書く。候補を並べたまま実装に持ち込むと、どれが効いて
 * いるのか分からなくなる。
 */
const CANDIDATE_IDS = [
  "XKT001",
  "XKT002",
  "XKT003",
  "XKT004",
  "XKT005",
  "XKT006",
  "XKT007",
  "XKT010",
  "XKT011",
];

/** 用途地域が必ずある場所（都市計画区域の中心部）で見る。 */
const SPOTS: { name: string; lat: number; lon: number }[] = [
  { name: "東京都千代田区", lat: 35.6938, lon: 139.7532 },
  { name: "愛知県名古屋市中区", lat: 35.1667, lon: 136.9066 },
  { name: "京都府京都市下京区", lat: 34.9859, lon: 135.7585 },
];

/** タイル指定 API のズーム制限を探る。 */
const ZOOMS = [11, 12, 13, 14, 15];

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

async function main() {
  console.log("## 1. どの ID が応えるか（東京・z=14）\n");
  const { z, x, y } = latLonToTile(SPOTS[0].lat, SPOTS[0].lon, 14);
  const alive: string[] = [];

  for (const id of CANDIDATE_IDS) {
    const url = `${BASE}/${id}?response_format=geojson&z=${z}&x=${x}&y=${y}`;
    const r = await probe(url);
    const head = `  ${id}: HTTP ${r.status}`;
    if (r.status === 200) {
      alive.push(id);
      console.log(`${head} / ${r.features} 件 / ${r.bytes} バイト`);
    } else {
      console.log(`${head} ${r.note}`);
    }
    await wait();
  }

  if (alive.length === 0) {
    console.log(
      "\n応える ID が 1 つも無い。パラメータの形（year が要る等）が違う疑い。",
    );
    return;
  }

  console.log(`\n応えた ID: ${alive.join(", ")}\n`);

  console.log("## 2. 項目名と値（応えた ID ごと・東京 z=14）\n");
  for (const id of alive) {
    const url = `${BASE}/${id}?response_format=geojson&z=${z}&x=${x}&y=${y}`;
    const r = await probe(url);
    console.log(`### ${id}（${r.features} 件）`);
    for (const [k, samples] of r.keys) {
      const shown = samples.map((v) => JSON.stringify(v)).join(" , ");
      console.log(`  ${k}: ${shown}`);
    }
    console.log("");
    await wait();
  }

  console.log("## 3. 取れるズーム（応えた ID の 1 つめ）\n");
  const target = alive[0];
  for (const zoom of ZOOMS) {
    const t = latLonToTile(SPOTS[0].lat, SPOTS[0].lon, zoom);
    const url = `${BASE}/${target}?response_format=geojson&z=${t.z}&x=${t.x}&y=${t.y}`;
    const r = await probe(url);
    console.log(
      `  z=${zoom}: HTTP ${r.status} / ${r.features} 件 / ${r.bytes} バイト ${r.note}`,
    );
    await wait();
  }

  console.log("\n## 4. 場所による違い（応えた ID の 1 つめ・z=14）\n");
  for (const spot of SPOTS) {
    const t = latLonToTile(spot.lat, spot.lon, 14);
    const url = `${BASE}/${target}?response_format=geojson&z=${t.z}&x=${t.x}&y=${t.y}`;
    const r = await probe(url);
    console.log(
      `  ${spot.name}: ${r.features} 件 / ${r.bytes} バイト ${r.note}`,
    );
    await wait();
  }

  console.log(
    "\n※ 1 タイルの大きさが分かれば、DB に取り込まずそのまま中継できるかが決まる。",
  );
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});

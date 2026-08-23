import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 不動産情報ライブラリの ex-api に**何があるのか**を一覧にする。
 *
 * きっかけは「路線価も地図で見たい」という要望。用途地域のときと同じで、
 * **どの ID がそれなのかを確かめてから書く。**
 *
 * 用途地域を探したときに分かったのは、応答の `_index` が中身を名乗って
 * いるということ（`bs001_use_area_…`、`bs010_urban_plan_area_…`、
 * `bs007_medical_institution_…`）。**ID を総当たりして `_index` を読めば、
 * 何がどこにあるか一覧にできる。**
 *
 * 路線価が無いなら「無い」とここで分かる。相続税路線価は国税庁のもので、
 * 国交省のこの API に入っている保証はない。**入っているつもりで実装を
 * 始めないための確認。**
 *
 * 開発環境からは mlit.go.jp に出られない（egress で 403）ので、
 * ワークフローから回す。DB には一切書かない。
 */

const API_KEY = process.env.LIBRARY_API_KEY;
if (!API_KEY) {
  console.error("LIBRARY_API_KEY が未設定。");
  process.exit(1);
}

const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const headers = { "Ocp-Apim-Subscription-Key": API_KEY, Accept: "*/*" };

/** 叩く間隔。既存の取り込みと同じ 1 秒。 */
const wait = () => new Promise((r) => setTimeout(r, 1000));

/**
 * 見に行く ID。
 *
 * 接頭辞ごとに意味が違うらしい（XPT=地価、XIT=取引、XCT=鑑定、XKT=地図の層）。
 * 路線価がどれに入るか分からないので、全部の接頭辞を少しずつ見る。
 */
function candidates(): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) out.push(`XPT${String(i).padStart(3, "0")}`);
  for (let i = 1; i <= 3; i++) out.push(`XIT${String(i).padStart(3, "0")}`);
  for (let i = 1; i <= 3; i++) out.push(`XCT${String(i).padStart(3, "0")}`);
  for (let i = 1; i <= 30; i++) out.push(`XKT${String(i).padStart(3, "0")}`);
  return out;
}

/** 東京・千代田区の z=14 タイル。都心なら何かしら入っている。 */
const TILE = { z: 14, x: 14552, y: 6450 };

interface Result {
  id: string;
  status: number;
  index: string;
  features: number;
  bytes: number;
  keys: string[];
  note: string;
}

async function probe(id: string): Promise<Result> {
  const url = `${BASE}/${id}?response_format=geojson&z=${TILE.z}&x=${TILE.x}&y=${TILE.y}`;
  const empty: Result = {
    id,
    status: 0,
    index: "",
    features: 0,
    bytes: 0,
    keys: [],
    note: "",
  };
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
      note: text.slice(0, 120).replace(/\s+/g, " "),
    };
  }
  try {
    const body = JSON.parse(text) as {
      features?: { properties?: Record<string, unknown> }[];
    };
    const features = body.features ?? [];
    const first = features[0]?.properties ?? {};
    const index = typeof first._index === "string" ? first._index : "";
    return {
      id,
      status: res.status,
      /* 末尾の日付は毎回変わるので落とす。中身の名前だけ見たい。 */
      index: index.replace(/_\d{8,}$/, ""),
      features: features.length,
      bytes: text.length,
      keys: Object.keys(first).filter((k) => !k.startsWith("_")),
      note: "",
    };
  } catch {
    return {
      ...empty,
      status: res.status,
      bytes: text.length,
      note: "JSON として読めない",
    };
  }
}

async function main() {
  console.log(`## ex-api の一覧（東京・千代田区 z=${TILE.z}）\n`);
  console.log("| ID | HTTP | 中身（_index） | 件数 | バイト |");
  console.log("|---|---|---|---|---|");

  const found: Result[] = [];
  for (const id of candidates()) {
    const r = await probe(id);
    if (r.status === 200) {
      found.push(r);
      console.log(
        `| ${id} | 200 | ${r.index || "（空。この場所にデータが無い）"} | ${r.features} | ${r.bytes.toLocaleString()} |`,
      );
    } else if (r.status !== 404) {
      console.log(`| ${id} | ${r.status} | ${r.note} | | |`);
    }
    await wait();
  }

  console.log("\n## 路線価らしきものがあるか\n");
  /*
    名前で探す。相続税路線価は国税庁のもので、この API に入っている
    保証はない。**無ければ「無い」と書く。**
  */
  const hits = found.filter((r) =>
    /rosenka|road_?price|land_?price|route|inheritance|zei/i.test(r.index),
  );
  if (hits.length === 0) {
    console.log(
      "名前に路線価らしき語を含むものは無し。地価公示・地価調査（XPT002）とは別物なので、",
    );
    console.log("この API では取れない可能性が高い。国税庁側を当たること。");
  } else {
    for (const h of hits) {
      console.log(`- ${h.id}: ${h.index}`);
      console.log(`  項目: ${h.keys.join(", ")}`);
    }
  }

  console.log("\n## 見つかったものの項目\n");
  for (const r of found) {
    if (!r.index) continue;
    console.log(`### ${r.id} — ${r.index}`);
    console.log(`  ${r.keys.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});

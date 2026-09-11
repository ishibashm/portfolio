import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * 市区町村別の**家賃と空き家率**を e-Stat のどの表・どの項目で取るかを
 * **実物で確かめるだけ**の道具。DB には一切書かない。
 *
 * ## なぜ先に見るか
 *
 * 富裕度（import_municipalities_wealth.ts）は「統計でみる市区町村のすがた」
 * （statsDataId 0000020103）の C120110 / C120120 を取っている。同じ表に
 * 住宅の項目（H 系）もあるはずで、そこに
 *
 *   - 民営借家の 1 か月当たり家賃（円）
 *   - 住宅総数・空き家数（→ 空き家率）
 *
 * が入っていれば、取り込みは富裕度と同じ作りで済む（同じ表・同じ地域
 * コード・同じ年度の付け方）。ただし項目コードを推測で書くと、別の項目
 * （1 畳当たり家賃、持ち家の評価額など）を家賃として取り込んでも気付け
 * ない。probe_land_prices.ts と同じで、**項目名を実物で見てから書く。**
 *
 * ## 何を出すか
 *
 * 1. getMetaInfo で 0000020103 の cat01（項目）を全部引き、名前に
 *    「家賃」「空き家」「住宅数」「借家」を含むものを、コードと単位つきで
 *    並べる
 * 2. getStatsList で「住宅・土地統計調査」の市区町村別の表を探し、
 *    id・表題・調査年を並べる（0000020103 に無いときの代替）
 *
 * ## 規約
 *
 * e-Stat の利用規約（政府標準利用規約 2.0 準拠、CC BY 互換。商用可・
 * 出典表示・加工の明記）と、API 機能の利用規約のクレジット表示
 * （「このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、
 * サービスの内容は国によって保証されたものではありません。」）は
 * 2026-09-11 に利用者が読んで貼ってくれた。backlog 26 節に写してある。
 *
 *   npx tsx scripts/probe_estat_housing.ts
 */

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error(
    "ESTAT_APP_ID が設定されていません。ENV_FILE に入っているはずです。",
  );
  process.exit(1);
}

const BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";
/** 統計でみる市区町村のすがた（富裕度と同じ表）。 */
const MUNICIPAL_TABLE_ID = "0000020103";
const WORDS = ["家賃", "空き家", "住宅数", "借家", "住宅総数"];

/* 読むのは使う枝だけ。応答全体を型にしない（CLAUDE.md 4 節）。 */
interface MetaClass {
  "@code": string;
  "@name": string;
  "@unit"?: string;
}
interface MetaClassObj {
  "@id": string;
  "@name"?: string;
  CLASS: MetaClass | MetaClass[];
}
interface MetaInfoResponse {
  GET_META_INFO?: {
    RESULT?: { STATUS?: number; ERROR_MSG?: string };
    METADATA_INF?: {
      TABLE_INF?: { TITLE?: string | { $?: string } };
      CLASS_INF?: { CLASS_OBJ: MetaClassObj | MetaClassObj[] };
    };
  };
}
interface TableInfo {
  "@id"?: string;
  STAT_NAME?: { $?: string };
  TITLE?: string | { $?: string };
  SURVEY_DATE?: string | number;
  UPDATED_DATE?: string;
}
interface StatsListResponse {
  GET_STATS_LIST?: {
    RESULT?: { STATUS?: number; ERROR_MSG?: string };
    DATALIST_INF?: { NUMBER?: number; TABLE_INF?: TableInfo | TableInfo[] };
  };
}

const asArray = <T>(v: T | T[] | undefined): T[] =>
  Array.isArray(v) ? v : v ? [v] : [];
const titleOf = (t: TableInfo["TITLE"]): string =>
  typeof t === "string" ? t : (t?.$ ?? "(表題なし)");

async function listHousingItems(): Promise<void> {
  console.log(
    `### 1. 表 ${MUNICIPAL_TABLE_ID} の項目（cat01）から住宅系を探す\n`,
  );
  const url =
    `${BASE}/getMetaInfo?appId=${encodeURIComponent(APP_ID!)}` +
    `&statsDataId=${MUNICIPAL_TABLE_ID}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  HTTP ${res.status}`);
    return;
  }
  const body: MetaInfoResponse = await res.json();
  const result = body.GET_META_INFO?.RESULT;
  if (result?.STATUS !== 0) {
    console.log(
      `  e-Stat が拒否: ${result?.STATUS} ${result?.ERROR_MSG ?? ""}`,
    );
    return;
  }
  const meta = body.GET_META_INFO?.METADATA_INF;
  console.log(`  表題: ${titleOf(meta?.TABLE_INF?.TITLE)}`);
  const objs = asArray(meta?.CLASS_INF?.CLASS_OBJ);
  const cat01 = objs.find((o) => o["@id"] === "cat01");
  const items = asArray(cat01?.CLASS);
  console.log(`  cat01 の項目数: ${items.length}`);
  const hits = items.filter((c) => WORDS.some((w) => c["@name"].includes(w)));
  console.log(`  住宅系の候補: ${hits.length} 件\n`);
  for (const c of hits) {
    console.log(
      `    code=${c["@code"]}  ${c["@name"]}  単位=${c["@unit"] ?? "?"}`,
    );
  }
  /* 年度（time）の取りうる値。住調は 5 年ごとなので、どの年が入って
     いるかで cdTime を決める */
  const time = objs.find((o) => o["@id"] === "time");
  const times = asArray(time?.CLASS).map((c) => `${c["@code"]}(${c["@name"]})`);
  console.log(`\n  time の値（末尾 8 件）: ${times.slice(-8).join(", ")}`);
}

async function searchHousingSurveyTables(): Promise<void> {
  console.log(`\n### 2. 住宅・土地統計調査の市区町村別の表を探す（代替）\n`);
  for (const word of [
    "住宅・土地統計調査 市区町村 家賃",
    "住宅・土地統計調査 市区町村 空き家",
  ]) {
    console.log(`  「${word}」`);
    const url =
      `${BASE}/getStatsList?appId=${encodeURIComponent(APP_ID!)}` +
      `&searchWord=${encodeURIComponent(word)}&limit=20`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`    HTTP ${res.status}`);
      continue;
    }
    const body: StatsListResponse = await res.json();
    const result = body.GET_STATS_LIST?.RESULT;
    if (result?.STATUS !== 0) {
      console.log(
        `    e-Stat が拒否: ${result?.STATUS} ${result?.ERROR_MSG ?? ""}`,
      );
      continue;
    }
    const list = body.GET_STATS_LIST?.DATALIST_INF;
    const tables = asArray(list?.TABLE_INF);
    console.log(`    該当 ${list?.NUMBER ?? 0} 件（先頭 ${tables.length} 件）`);
    for (const t of tables) {
      console.log(
        `      id=${t["@id"] ?? "?"} / 調査=${t.SURVEY_DATE ?? "?"} / ${titleOf(t.TITLE)}`,
      );
    }
  }
}

async function main() {
  console.log("## 市区町村別の家賃と空き家率を e-Stat のどこで取るか\n");
  try {
    await listHousingItems();
  } catch (e) {
    console.log(`  失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await searchHousingSurveyTables();
  } catch (e) {
    console.log(`  失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(
    "\n1 の候補に「1か月当たり家賃」と「空き家数」「住宅総数」があれば、" +
      "富裕度と同じ表・同じ作りで取り込む。無ければ 2 の表を使う。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

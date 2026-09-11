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
 * 1. 「統計でみる市区町村のすがた」は分野ごとに表が分かれている。
 *    1 回目（run 34648446818）で 0000020103 は「Ｃ 経済基盤」と分かり、
 *    住宅系の項目は 0 件だった。id は分野の並び（A 人口 → B 自然環境 →
 *    C 経済基盤 → …）で連番らしいので、0000020101〜0000020115 を
 *    getMetaInfo で順に引いて表題を出し、住宅系の項目がある表は cat01 から
 *    「家賃」「空き家」「住宅数」「借家」を含む項目を、コードと単位つきで
 *    並べる
 * 2. getStatsList で住宅・土地統計調査（2023 年）の市区町村別の表を探し、
 *    id・表題を並べる（1 に無いときの代替。1 回目は 2018 年の表しか
 *    先頭に出ず、家賃は「10 区分別の借家数」＝分布で、平均ではなかった）
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

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 分野の表を順に引き、表題を出す。住宅系の項目がある表は項目も出す。 */
async function scanMunicipalTables(): Promise<void> {
  console.log("### 1. 「統計でみる市区町村のすがた」の分野ごとの表\n");
  for (let n = 1; n <= 15; n++) {
    const id = `00000201${String(n).padStart(2, "0")}`;
    try {
      await listHousingItems(id);
    } catch (e) {
      console.log(
        `  ${id}: 失敗 ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await pause(300);
  }
}

async function listHousingItems(
  tableId: string = MUNICIPAL_TABLE_ID,
): Promise<void> {
  const url =
    `${BASE}/getMetaInfo?appId=${encodeURIComponent(APP_ID!)}` +
    `&statsDataId=${tableId}`;
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
  const title = titleOf(meta?.TABLE_INF?.TITLE);
  const objs = asArray(meta?.CLASS_INF?.CLASS_OBJ);
  const cat01 = objs.find((o) => o["@id"] === "cat01");
  const items = asArray(cat01?.CLASS);
  const hits = items.filter((c) => WORDS.some((w) => c["@name"].includes(w)));
  console.log(
    `  ${tableId}: ${title}（cat01 ${items.length} 項目、住宅系の候補 ${hits.length} 件）`,
  );
  /* 住宅系の無い分野は表題だけで済ませる */
  if (hits.length === 0) return;
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
  /* 2023 年（令和 5 年）調査に絞る。平均家賃の表は「１か月当たり家賃
     (借家)」の表題で、「10 区分別…借家数」（分布）とは別 */
  for (const word of [
    "住宅・土地統計調査 市区町村 １か月当たり家賃",
    "住宅・土地統計調査 市区町村 空き家率",
    "住宅・土地統計調査 市区町村 住宅数 空き家数",
  ]) {
    console.log(`  「${word}」（surveyYears=2023）`);
    const url =
      `${BASE}/getStatsList?appId=${encodeURIComponent(APP_ID!)}` +
      `&searchWord=${encodeURIComponent(word)}&surveyYears=2023&limit=25`;
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
    await scanMunicipalTables();
  } catch (e) {
    console.log(`  失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await searchHousingSurveyTables();
  } catch (e) {
    console.log(`  失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(
    "\n1 の住宅系の表に「1か月当たり家賃」と「空き家数」「住宅総数」があれば、" +
      "富裕度と同じ表・同じ作りで取り込む。無ければ 2 の表を使う。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

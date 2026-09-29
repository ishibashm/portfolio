/**
 * 不動産価格指数が e-Stat のどこにあるかを**探すだけ**のスクリプト。
 *
 * ## なぜ探索から始めるか
 *
 * 査定（/relocation/appraisal）は 2023〜2025 年の成約を分母にしている。
 * **今日の水準ではない。**この数年でマンション価格は動いているので、
 * そのまま出すと古い数字を新しい顔で見せることになる。
 *
 * 直すには国土交通省の不動産価格指数を掛ければよい。ただし、
 *
 *   - **不動産情報ライブラリの API には無い**（XIT001/XIT002/XCT001/
 *     XPT001/XPT002/XKT00x を確認。価格指数は含まれない）
 *   - e-Stat にあるはずだが、**統計表 ID が分からない**
 *
 * 手元の環境から e-Stat に出られないので、当てずっぽうで ID を書かずに
 * **まず検索して、出た ID を報告する。**#493（利回りが成り立つかを数える）
 * と同じ進め方で、作ってから「取れませんでした」を避ける。
 *
 * 読むだけ。何も書き込まない。
 *
 * ## 家賃の統計も探す（2026-09-30）
 *
 * 掲載の取り込みを止めたので、家賃市場の頁の「家賃指数の推移」が
 * 2026-09-13 で止まった（利用者の指摘「このデータは最新？」）。公的な
 * 毎月の家賃の統計（消費者物価指数の民営家賃、小売物価統計調査の民営家賃）
 * に置き換えたいが、これも統計表 ID が分からない。同じスクリプトで探す。
 *
 * - `PROBE_WORDS`（カンマ区切り）… 探す言葉。空なら従来の不動産価格指数
 * - `PROBE_META_ID` … 統計表 ID。指定すると、その表の項目（分類）の
 *   一覧を出す。`PROBE_META_FILTER` に含む語で絞れる（例: 家賃）
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error(
    "ESTAT_APP_ID が設定されていません。ENV_FILE に入っているはずです。",
  );
  process.exit(1);
}

const BASE = "https://api.e-stat.go.jp/rest/3.0/app/json";

/** 探す言葉。表記ゆれがあるので複数試す。 */
const SEARCH_WORDS = (process.env.PROBE_WORDS ?? "")
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);
if (SEARCH_WORDS.length === 0)
  SEARCH_WORDS.push("不動産価格指数", "不動産価格", "住宅価格指数");

type StatsListResponse = {
  GET_STATS_LIST?: {
    RESULT?: { STATUS?: number; ERROR_MSG?: string };
    DATALIST_INF?: {
      NUMBER?: number;
      TABLE_INF?: unknown;
    };
  };
};

/** 統計表 1 件ぶんの、報告に要る項目だけ。 */
type TableInfo = {
  "@id"?: string;
  STAT_NAME?: { $?: string };
  TITLE?: { $?: string } | string;
  SURVEY_DATE?: string | number;
  UPDATED_DATE?: string;
  GOV_ORG?: { $?: string };
};

/** TITLE は文字列のことも {$: "..."} のこともある。 */
function titleOf(t: TableInfo["TITLE"]): string {
  if (typeof t === "string") return t;
  return t?.$ ?? "(表題なし)";
}

async function search(word: string): Promise<void> {
  const url =
    `${BASE}/getStatsList?appId=${encodeURIComponent(APP_ID!)}` +
    `&searchWord=${encodeURIComponent(word)}&limit=30`;

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  HTTP ${res.status}`);
    return;
  }
  const body: StatsListResponse = await res.json();
  const result = body.GET_STATS_LIST?.RESULT;
  if (result?.STATUS !== 0) {
    console.log(
      `  e-Stat が拒否: ${result?.STATUS} ${result?.ERROR_MSG ?? ""}`,
    );
    return;
  }

  const list = body.GET_STATS_LIST?.DATALIST_INF;
  const raw = list?.TABLE_INF;
  /* 1 件だけのときは配列にならない。 */
  const tables: TableInfo[] = Array.isArray(raw)
    ? raw
    : raw
      ? [raw as TableInfo]
      : [];

  console.log(
    `  該当 ${list?.NUMBER ?? 0} 件（先頭 ${tables.length} 件を表示）`,
  );
  for (const t of tables) {
    console.log(
      [
        `    id=${t["@id"] ?? "?"}`,
        `統計=${t.STAT_NAME?.$ ?? "?"}`,
        `表題=${titleOf(t.TITLE)}`,
        `作成=${t.GOV_ORG?.$ ?? "?"}`,
        `更新=${t.UPDATED_DATE ?? "?"}`,
      ].join(" / "),
    );
  }
}

type MetaResponse = {
  GET_META_INFO?: {
    RESULT?: { STATUS?: number; ERROR_MSG?: string };
    METADATA_INF?: {
      TABLE_INF?: TableInfo;
      CLASS_INF?: {
        CLASS_OBJ?: MetaClassObj | MetaClassObj[];
      };
    };
  };
};
type MetaClass = { "@code"?: string; "@name"?: string; "@unit"?: string };
type MetaClassObj = {
  "@id"?: string;
  "@name"?: string;
  CLASS?: MetaClass | MetaClass[];
};

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** 統計表 1 つの項目（分類）を出す。多い分類は filter で絞り、先頭だけ */
async function meta(id: string, filter: string): Promise<void> {
  const url =
    `${BASE}/getMetaInfo?appId=${encodeURIComponent(APP_ID!)}` +
    `&statsDataId=${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  HTTP ${res.status}`);
    return;
  }
  const body: MetaResponse = await res.json();
  const result = body.GET_META_INFO?.RESULT;
  if (result?.STATUS !== 0) {
    console.log(
      `  e-Stat が拒否: ${result?.STATUS} ${result?.ERROR_MSG ?? ""}`,
    );
    return;
  }
  const info = body.GET_META_INFO?.METADATA_INF;
  console.log(
    `  表題=${titleOf(info?.TABLE_INF?.TITLE)} / 統計=${info?.TABLE_INF?.STAT_NAME?.$ ?? "?"}`,
  );
  for (const obj of asArray(info?.CLASS_INF?.CLASS_OBJ)) {
    const all = asArray(obj.CLASS);
    const hit = filter
      ? all.filter((c) => (c["@name"] ?? "").includes(filter))
      : all;
    console.log(
      `  分類 ${obj["@id"]}（${obj["@name"]}）: ${all.length} 項目` +
        (filter ? `、「${filter}」を含む ${hit.length} 項目` : ""),
    );
    for (const c of hit.slice(0, 40)) {
      console.log(
        `    ${c["@code"]} ${c["@name"]}${c["@unit"] ? `（${c["@unit"]}）` : ""}`,
      );
    }
  }
}

async function main() {
  const metaId = (process.env.PROBE_META_ID ?? "").trim();
  if (metaId) {
    console.log(`## 統計表 ${metaId} の項目\n`);
    try {
      await meta(metaId, (process.env.PROBE_META_FILTER ?? "").trim());
    } catch (e) {
      console.log(`  失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }
  console.log(`## e-Stat で探す: ${SEARCH_WORDS.join("、")}\n`);
  for (const word of SEARCH_WORDS) {
    console.log(`### 「${word}」`);
    try {
      await search(word);
    } catch (e) {
      console.log(`  失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log("");
  }
  console.log(
    "見つかった id を statsDataId として getStatsData に渡すと、" +
      "実際の指数の系列が引ける。次はそこを確かめる。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
const SEARCH_WORDS = ["不動産価格指数", "不動産価格", "住宅価格指数"];

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

async function main() {
  console.log("## 不動産価格指数を e-Stat で探す\n");
  console.log(
    "不動産情報ライブラリの API には無いことを確認済み。" +
      "e-Stat 側に統計表があるかを見る。\n",
  );
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

/**
 * 公的な家賃の統計（e-Stat）を取り、家賃市場の頁が読む写し
 * （src/data/estatRent.json）に書く。集計は src/utils/estatRent.ts。
 *
 * なぜ・何を取るかは src/utils/estatRent.ts の冒頭に書いてある。
 * ここは通信と書き出しだけ。
 *
 * - 項目のコードは実行のたびに getMetaInfo の名前から選ぶ。選んだ
 *   コードはログに出す（あとで何を取ったか分かるように）
 * - `ESTAT_RENT_DRY_RUN=1` なら書かずに中身だけ出す
 *
 * 規約: 政府統計の総合窓口の利用規約（CC BY 互換・商用可・出典と加工の
 * 明記）と API のクレジット表示（docs/improvement-backlog.md 26 節）。
 * 表示は頁の側（src/lib/estatCredit）。
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import {
  asArray,
  buildCpiRent,
  buildRetailRent,
  codeByName,
  monthCodes,
  type EstatRentClassObj,
  type EstatRentResponse,
  type EstatRentSnapshot,
} from "../src/utils/estatRent";

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
/** 消費者物価指数（2025年基準） */
const CPI_TABLE = "0004052037";
/** 小売物価統計調査 主要品目の都市別小売価格 */
const RETAIL_TABLE = "0003421913";
/** 月次の推移を持つ地域 */
const SERIES_AREAS = ["全国", "東京都区部"] as const;
/** 推移に持つ月数（7 年） */
const CPI_MONTHS = 84;
/** 都市別は最新月と前年同月が要る */
const RETAIL_MONTHS = 13;
const OUT = path.resolve(process.cwd(), "src/data/estatRent.json");

type MetaResponse = {
  GET_META_INFO: {
    RESULT: { STATUS: number; ERROR_MSG?: string };
    METADATA_INF?: {
      CLASS_INF?: { CLASS_OBJ: EstatRentClassObj | EstatRentClassObj[] };
    };
  };
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function metaClasses(id: string): Promise<EstatRentClassObj[]> {
  const body = await getJson<MetaResponse>(
    `${BASE}/getMetaInfo?appId=${encodeURIComponent(APP_ID!)}&statsDataId=${id}`,
  );
  const r = body.GET_META_INFO;
  if (r.RESULT.STATUS !== 0) {
    throw new Error(
      `e-Stat が拒否: ${r.RESULT.STATUS} ${r.RESULT.ERROR_MSG ?? ""}`,
    );
  }
  return asArray(r.METADATA_INF?.CLASS_INF?.CLASS_OBJ);
}

/** 月の時点のコードを、新しいほうから n 個 */
function latestMonthCodes(classes: EstatRentClassObj[], n: number): string[] {
  return [...monthCodes(classes).entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .slice(-n)
    .map(([code]) => code);
}

async function statsData(
  id: string,
  params: Record<string, string>,
): Promise<EstatRentResponse> {
  const q = new URLSearchParams({ appId: APP_ID!, statsDataId: id, ...params });
  return getJson<EstatRentResponse>(`${BASE}/getStatsData?${q.toString()}`);
}

async function fetchCpi(): Promise<EstatRentSnapshot["cpi"]> {
  const classes = await metaClasses(CPI_TABLE);
  const cat01 = codeByName(classes, "cat01", "民営家賃");
  const tab = codeByName(classes, "tab", "指数");
  const times = latestMonthCodes(classes, CPI_MONTHS);
  console.log(
    `CPI ${CPI_TABLE}: 品目 cat01=${cat01} / 表章 tab=${tab} / 時点 ${times[0]}〜${times.at(-1)}（${times.length} か月）`,
  );
  const data = await statsData(CPI_TABLE, {
    cdCat01: cat01,
    cdTab: tab,
    cdTime: times.join(","),
  });
  return buildCpiRent(data, CPI_TABLE, SERIES_AREAS);
}

async function fetchRetail(): Promise<EstatRentSnapshot["retail"]> {
  const classes = await metaClasses(RETAIL_TABLE);
  const cat02 = codeByName(classes, "cat02", "民営家賃");
  const times = latestMonthCodes(classes, RETAIL_MONTHS);
  console.log(
    `小売物価 ${RETAIL_TABLE}: 銘柄 cat02=${cat02} / 時点 ${times[0]}〜${times.at(-1)}（${times.length} か月）`,
  );
  const data = await statsData(RETAIL_TABLE, {
    cdCat02: cat02,
    cdTime: times.join(","),
  });
  return buildRetailRent(data, RETAIL_TABLE);
}

async function main() {
  const cpi = await fetchCpi();
  const retail = await fetchRetail();
  const snapshot: EstatRentSnapshot = { cpi, retail };

  const nat = cpi.areas.find((a) => a.areaName === "全国");
  console.log(
    `\nCPI 民営家賃: 最新 ${cpi.latestMonth} / 全国 ${nat?.index ?? "?"}（前年同月比 ${nat?.yoyPct ?? "?"}%） / 地域 ${cpi.areas.length}`,
  );
  for (const s of cpi.series) {
    console.log(
      `  推移 ${s.areaName}: ${s.points.length} か月（${s.points[0]?.month}〜${s.points.at(-1)?.month}）`,
    );
  }
  console.log(
    `小売物価 民営家賃: 最新 ${retail.latestMonth} / 単位 ${retail.unit || "?"} / 都市 ${retail.cities.length}`,
  );
  for (const c of retail.cities.slice(0, 5)) {
    console.log(
      `  ${c.areaCode} ${c.areaName}: ${c.yen}（前年同月 ${c.yenYearAgo ?? "-"}）`,
    );
  }

  if (process.env.ESTAT_RENT_DRY_RUN === "1") {
    console.log("\ndry-run: 書き込まない。");
    return;
  }
  // 詰めて書く（housingStats.json と同じ）。client が読む配布物で、
  // .prettierignore に載せてある
  fs.writeFileSync(OUT, `${JSON.stringify(snapshot)}\n`);
  console.log(`\n${path.relative(process.cwd(), OUT)} に書いた。`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

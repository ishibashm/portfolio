import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

import { Pool } from "pg";
import { toLogMessage } from "../src/lib/errorMessage";
import municipalityCoords from "../src/data/municipalityCoords.json";
import areaDirections from "../src/data/areaDirections.json";
import type { EstatStatsResponse } from "./estatWealth";
import {
  HOUSING_ITEMS,
  HOUSING_TABLE_ID,
  aggregateHousing,
  joinCoverage,
  type HousingRow,
} from "./estatHousing";

/**
 * 市区町村別の住宅の統計（家賃・空き家）を e-Stat から取り込む。
 *
 * ## 代表点と結合できるかを、取り込んだ時点で数える
 *
 * 読み口（/api/housing-stats/by-direction）は area_code を
 * `municipalityCoords` + `areaDirections` の代表点に突き合わせて方位を
 * 出す。**コードの体系が合っていなければ、表は埋まるのに画面は
 * 「統計のある市区町村がありませんでした」になる**（dry-run の通過を
 * 根拠にしない、と同じ種類の落とし穴。CLAUDE.md 3 節）。1 回目の
 * 取り込み（run 34657021102）は件数しか出しておらず、結合できるかは
 * 誰も見ていなかった。取り込むたびに結合率と結合できない行の顔ぶれを
 * Summary に出し、半分を切ったら ::warning:: にする。
 *
 * 出どころは「統計でみる市区町村のすがた」Ｈ 居住（表 0000020108）。
 * 富裕度（import_municipalities_wealth.ts）と同じ体系・同じ地域コード。
 * 取るのは 5 項目だけ（estatHousing.ts の HOUSING_ITEMS）。
 *
 * ## 年度は 1 か所で決める
 *
 * 住調は 5 年ごと（2018・2023）。ESTAT_HOUSING_YEAR（既定 2023）から
 * cdTime と data_year の両方を作る。別々に書くと、年を上げるときに
 * 片方だけ直して「去年のデータに今年の年度が付く」（富裕度の註と同じ）。
 *
 * ## 0 行なら失敗にする
 *
 * 表が無い・年度に値が無いときに console.warn だけで緑にすると、誰も
 * 気付かない（MarketDailySummary が 1 日も積まれていなかった件。
 * CLAUDE.md 3 節）。::error:: を出して 1 で終える。
 *
 * ## 規約
 *
 * 政府統計の総合窓口の利用規約（CC BY 互換・商用可・出典と加工の明記）と
 * API のクレジット表示は backlog 26 節に写してある。要求は 1 回
 * （市区町村ぶんを 1 度に取る）。
 *
 *   ESTAT_HOUSING_YEAR=2023 npx tsx scripts/import_estat_housing.ts
 */
const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error("::error::ESTAT_APP_ID が未設定。ENV_FILE に入っているはず。");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("::error::DATABASE_URL が未設定。");
  process.exit(1);
}

const DATA_YEAR = process.env.ESTAT_HOUSING_YEAR || "2023";
if (!/^\d{4}$/.test(DATA_YEAR)) {
  console.error(`::error::ESTAT_HOUSING_YEAR が年でない: ${DATA_YEAR}`);
  process.exit(1);
}
const CD_TIME = `${DATA_YEAR}100000`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function fetchHousing(): Promise<HousingRow[]> {
  const cdCat01 = Object.values(HOUSING_ITEMS).join(",");
  const url =
    `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData` +
    `?appId=${encodeURIComponent(APP_ID!)}` +
    `&statsDataId=${HOUSING_TABLE_ID}` +
    `&cdCat01=${cdCat01}&cdTime=${CD_TIME}`;
  console.log(
    `e-Stat から Ｈ 居住（${HOUSING_TABLE_ID}）の ${DATA_YEAR} 年度を取得...`,
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat HTTP ${res.status}`);
  const data = (await res.json()) as EstatStatsResponse;
  const result = data.GET_STATS_DATA?.RESULT;
  if (!result || result.STATUS !== 0) {
    throw new Error(
      `e-Stat が拒否: ${result?.STATUS} ${result?.ERROR_MSG ?? ""}`,
    );
  }
  return aggregateHousing(data);
}

/** 200 行ずつまとめて upsert する。鍵は (area_code, data_year)。 */
async function saveRows(rows: HousingRow[]): Promise<number> {
  const year = Number(DATA_YEAR);
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: (string | number | null)[] = [];
    const tuples = chunk.map((r) => {
      const base = params.length;
      params.push(
        r.areaCode,
        year,
        r.areaName,
        r.totalDwellings,
        r.vacantDwellings,
        r.rentPerTatamiYen,
        r.tatamiPerRental,
        r.floorAreaPerRental,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });
    await pool.query(
      `INSERT INTO municipality_housing_stats
         (area_code, data_year, area_name, total_dwellings, vacant_dwellings,
          rent_per_tatami_yen, tatami_per_rental, floor_area_per_rental)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (area_code, data_year) DO UPDATE SET
         area_name = EXCLUDED.area_name,
         total_dwellings = EXCLUDED.total_dwellings,
         vacant_dwellings = EXCLUDED.vacant_dwellings,
         rent_per_tatami_yen = EXCLUDED.rent_per_tatami_yen,
         tatami_per_rental = EXCLUDED.tatami_per_rental,
         floor_area_per_rental = EXCLUDED.floor_area_per_rental,
         updated_at = now()`,
      params,
    );
    written += chunk.length;
  }
  return written;
}

/**
 * 読み口と同じ母集団（掲載の有無と無関係な代表点 + 掲載を集計できた
 * 市区町村）のコード。`municipalityCoords.mergeWithListed` と同じ和集合。
 * `@/` の別名は tsx が解決しないので JSON を直に読む。
 */
function coordinateCodes(): Set<string> {
  const codes = new Set<string>();
  for (const a of municipalityCoords.areas) codes.add(a.code);
  for (const a of areaDirections.areas) codes.add(a.code);
  return codes;
}

async function main() {
  const rows = await fetchHousing();
  const withRent = rows.filter((r) => r.rentPerTatamiYen !== null).length;
  const withVacancy = rows.filter(
    (r) => r.totalDwellings !== null && r.vacantDwellings !== null,
  ).length;
  console.log(
    `市区町村 ${rows.length} 件（家賃あり ${withRent}、空き家率を出せる ${withVacancy}）`,
  );
  const coverage = joinCoverage(rows, coordinateCodes());
  const unmatchedNames = coverage.unmatched
    .slice(0, 30)
    .map((r) => `${r.areaCode} ${r.areaName}`)
    .join("、");
  /*
    政令市の親コード（01100 札幌市など 20 件）と 13100 特別区部は、代表点の
    側が区で持っているので結合できなくて正しい（municipalityCoords の註）。
    実測（run 34660353940）はちょうどその 21 件で、区の側は 1,214 件が
    結合した。ここに区や市が並び始めたら体系がずれている。
  */
  console.log(
    `代表点と結合できる行: ${coverage.matched} / ${rows.length}（結合できない ${coverage.unmatched.length}: ${unmatchedNames}。政令市の親コードと特別区部は区の側で結合するので、ここに出て正しい）`,
  );
  if (rows.length > 0 && coverage.matched * 2 < rows.length) {
    console.warn(
      `::warning::取り込んだ行の半分以上が代表点と結合できない（${coverage.matched} / ${rows.length}）。地域コードの体系が読み口と合っていない可能性。`,
    );
  }
  if (rows.length === 0) {
    console.error(
      `::error::${DATA_YEAR} 年度の値が 0 件。年度（ESTAT_HOUSING_YEAR）か表を確かめる。`,
    );
    process.exit(1);
  }
  const written = await saveRows(rows);
  console.log(`municipality_housing_stats に ${written} 件を upsert した。`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    fs.appendFileSync(
      summary,
      [
        `## 住宅の統計の取り込み（${DATA_YEAR} 年度）`,
        "",
        `- 市区町村: **${rows.length}** 件`,
        `- 1 畳当たり家賃あり: ${withRent} 件`,
        `- 空き家率を出せる（総住宅数と空き家数あり）: ${withVacancy} 件`,
        `- 代表点と結合できる（読み口が方位を出せる）: **${coverage.matched}** 件 / 結合できない ${coverage.unmatched.length} 件`,
        coverage.unmatched.length > 0
          ? `  - 結合できない行（先頭 30。政令市の親コードと特別区部は区の側で結合するので、ここに出て正しい）: ${unmatchedNames}`
          : "",
        "",
      ].join("\n"),
    );
  }
}

main()
  .catch((e) => {
    console.error(`::error::${toLogMessage(e)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

import { Pool } from "pg";
import * as dotenv from "dotenv";

/**
 * 土地と建物の推定内訳（#415・#416）が**まともな分布か**を数える。
 * **読み取りだけ。**
 *
 * 積算評価の単価表は目安なので、実データで分布を見てから全国に回す。
 * 見るのは 3 つ。
 *
 *   1. 埋まり方 — 宅地(土地と建物) のうち何割で計算できたか。
 *      延床・築年・構造のどれが欠けて計算できなかったかの内訳
 *   2. building_ratio の分布 — 0.1 刻みの度数。両端に山があれば
 *      単価か頭打ちの扱いを疑う
 *   3. 実例 — ratio の高い・低い取引を数件ずつ。目視で妥当か見る
 *
 * 使い方（GitHub Actions の db-audit-building-split.yml から回す）:
 *   npx tsx scripts/audit_building_split.ts
 *
 * 環境変数
 *   SPLIT_AUDIT_PREF  都道府県名で絞る（例 "京都府"）。空で全国
 */
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

/*
  「全国」は絞らない指定。空文字で表すと workflow_dispatch が
  **空入力を default（京都府）に落とす**ため、全国のつもりで回して
  京都の数字を見てしまう（実際にやった）。空ではなく言葉で指定する。
*/
const rawPref = process.env.SPLIT_AUDIT_PREF || "";
const PREF = rawPref === "全国" ? "" : rawPref;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL が無い");
  const pool = new Pool({ connectionString: url, max: 2 });

  const where = PREF
    ? `property_type = '宅地(土地と建物)' AND prefecture = $1`
    : `property_type = '宅地(土地と建物)'`;
  const params = PREF ? [PREF] : [];

  console.log(`対象: 宅地(土地と建物)${PREF ? ` / ${PREF}` : "（全国）"}`);

  // 1. 埋まり方と、欠けの内訳
  const fill = await pool.query(
    `SELECT count(*)::bigint AS total,
            count(building_ratio)::bigint AS filled,
            count(*) FILTER (WHERE total_floor_area_sqm IS NULL)::bigint AS no_floor,
            count(*) FILTER (WHERE building_year IS NULL)::bigint AS no_year,
            count(*) FILTER (WHERE structure IS NULL)::bigint AS no_structure
       FROM property_transactions WHERE ${where}`,
    params,
  );
  const f = fill.rows[0];
  console.log(`\n埋まり方: ${f.filled} / ${f.total}`);
  console.log(
    `欠けの内訳: 延床なし ${f.no_floor} / 築年なし ${f.no_year} / 構造なし ${f.no_structure}`,
  );

  // 2. 0.1 刻みの度数
  const hist = await pool.query(
    `SELECT width_bucket(building_ratio, 0, 1, 10) AS bucket,
            count(*)::bigint AS n
       FROM property_transactions
      WHERE ${where} AND building_ratio IS NOT NULL
      GROUP BY bucket ORDER BY bucket`,
    params,
  );
  console.log("\nbuilding_ratio の分布（0.1 刻み）:");
  for (const r of hist.rows) {
    const lo = ((Number(r.bucket) - 1) / 10).toFixed(1);
    const hi = (Number(r.bucket) / 10).toFixed(1);
    console.log(`  ${lo}-${hi}  ${String(r.n).padStart(8)}`);
  }

  // 3. 実例（高い側・低い側）
  for (const [label, order] of [
    ["ratio が高い（建物寄り）", "DESC"],
    ["ratio が低い（土地寄り）", "ASC"],
  ] as const) {
    const rows = await pool.query(
      `SELECT municipality, district_name, trade_year, trade_price,
              total_floor_area_sqm, building_year, structure,
              est_building_price, est_land_price,
              round(building_ratio::numeric, 3) AS ratio
         FROM property_transactions
        WHERE ${where} AND building_ratio IS NOT NULL
        ORDER BY building_ratio ${order} LIMIT 5`,
      params,
    );
    console.log(`\n${label}:`);
    for (const r of rows.rows) {
      console.log(
        `  ${r.ratio}  ${r.municipality}${r.district_name ?? ""} ` +
          `${r.trade_year}年 総額${r.trade_price} 延床${r.total_floor_area_sqm}㎡ ` +
          `築${r.building_year} ${r.structure} → 建物${r.est_building_price} 土地${r.est_land_price}`,
      );
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

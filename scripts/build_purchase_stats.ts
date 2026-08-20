/**
 * 購入（成約価格）の相場を集計して src/data/purchaseStats.json に書き出す。
 *
 * build_market_stats.ts（家賃）の購入版。理由も同じで、
 * property_transactions は 1,948 MB あり、訪問のたびには集計できない。
 *
 * ## なぜ SQL 側で集計するか
 *
 * 家賃のほうは行を JS に引き上げてから回帰まで掛けているが、こちらは
 * 桁が違う（賃貸 45 万行に対して成約は 200 万行超）。**全行を引くと
 * メモリに乗らない。**中央値・分位点は PostgreSQL の
 * percentile_cont に任せ、JS へは集計済みの行だけを持ってくる。
 *
 * ヒストグラムだけは width_bucket ではなく JS の histogram() を使う。
 * marketStats と同じ関数を通すことで、家賃と購入で分布の作り方が
 * 食い違わないようにする（同じことを 2 か所に書かない）。そのぶん
 * ㎡単価と建物比率の 2 列だけは行を引くが、外れ値を切ったうえで
 * サンプリングするので載る。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { histogram } from "../src/utils/marketStats";
import {
  buildingAgeBucket,
  buildingRatioBand,
  type PurchaseAgeStat,
  type PurchasePrefectureStat,
  type PurchaseRatioStat,
  type PurchaseStats,
  type PurchaseStructureStat,
  type PurchaseTypeStat,
  type PurchaseYearPoint,
} from "../src/utils/purchaseStats";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * ㎡単価の外れ値カット。1 万円/㎡ 未満と 500 万円/㎡ 超は
 * 記載ミスか特殊物件。中央値には効かないが、ヒストグラムの幅が
 * 外れ値ひとつで潰れるので切る。
 */
const UNIT_PRICE_MIN = 10_000;
const UNIT_PRICE_MAX = 5_000_000;

/** 統計に載せる最低標本数。少なすぎる区分は中央値が暴れる。 */
const MIN_ROWS = 30;

/** ヒストグラム用に引く行の上限。全行は載らない。 */
const SAMPLE_LIMIT = 400_000;

/** 単一の数値を返す問い合わせ。 */
async function scalar(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
): Promise<number | null> {
  const r = await pool.query(sql, params);
  const v = r.rows[0] ? Object.values(r.rows[0])[0] : null;
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString, max: 1 });

  try {
    await pool.query("SET statement_timeout = 0");

    /* 対象の共通条件。㎡単価が読めない行は分析に使えない。 */
    const BASE_WHERE = `
      unit_price_sqm IS NOT NULL
      AND unit_price_sqm BETWEEN ${UNIT_PRICE_MIN} AND ${UNIT_PRICE_MAX}
      AND trade_price IS NOT NULL
    `;

    console.log("集計の対象を数える...");
    const rows =
      (await scalar(
        pool,
        `SELECT count(*) FROM property_transactions WHERE ${BASE_WHERE}`,
      )) ?? 0;
    if (rows === 0) {
      throw new Error(
        "対象が 0 件。property_transactions が空か、unit_price_sqm が入っていない。",
      );
    }
    const withCoords =
      (await scalar(
        pool,
        `SELECT count(*) FROM property_transactions
          WHERE ${BASE_WHERE} AND lat IS NOT NULL AND lon IS NOT NULL`,
      )) ?? 0;
    const withBuildingRatio =
      (await scalar(
        pool,
        `SELECT count(*) FROM property_transactions
          WHERE ${BASE_WHERE} AND building_ratio IS NOT NULL`,
      )) ?? 0;
    const yearFrom = await scalar(
      pool,
      `SELECT min(trade_year) FROM property_transactions WHERE ${BASE_WHERE}`,
    );
    const yearTo = await scalar(
      pool,
      `SELECT max(trade_year) FROM property_transactions WHERE ${BASE_WHERE}`,
    );
    console.log(
      `  ${rows} 件（座標つき ${withCoords} / 建物比率つき ${withBuildingRatio}）${yearFrom}〜${yearTo}`,
    );

    /* 種類別。総額と㎡単価の両方を出す。総額だけでは広さの違いで比べられない。 */
    console.log("種類別を集計...");
    const typeRes = await pool.query(
      `SELECT
         coalesce(property_type, '不明') AS type,
         count(*)::bigint AS n,
         avg(trade_price)::float8       AS price_mean,
         percentile_cont(0.10) WITHIN GROUP (ORDER BY trade_price)::float8 AS price_p10,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY trade_price)::float8 AS price_p25,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY trade_price)::float8 AS price_p50,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY trade_price)::float8 AS price_p75,
         percentile_cont(0.90) WITHIN GROUP (ORDER BY trade_price)::float8 AS price_p90,
         stddev_samp(trade_price)::float8 AS price_sd,
         avg(unit_price_sqm)::float8      AS unit_mean,
         percentile_cont(0.10) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS unit_p10,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS unit_p25,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS unit_p50,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS unit_p75,
         percentile_cont(0.90) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS unit_p90,
         stddev_samp(unit_price_sqm)::float8 AS unit_sd
       FROM property_transactions
       WHERE ${BASE_WHERE}
       GROUP BY 1
       HAVING count(*) >= ${MIN_ROWS}
       ORDER BY n DESC`,
    );
    /*
      歪度と尖度は出さない。SQL で出すと重い割に画面で使わない。
      **0 で埋めない**ので、型のほうを PriceSummary（DistributionSummary
      から 2 つを Omit したもの）にしてある。歪度 0 は「左右対称」という
      主張であって「計算していない」ではない。成約価格は高額側に裾が
      伸びるので、0 と書けば嘘になる。
    */
    const byType: PurchaseTypeStat[] = typeRes.rows.map((r) => ({
      type: String(r.type),
      count: Number(r.n),
      price: {
        n: Number(r.n),
        mean: Number(r.price_mean),
        median: Number(r.price_p50),
        p10: Number(r.price_p10),
        p25: Number(r.price_p25),
        p75: Number(r.price_p75),
        p90: Number(r.price_p90),
        sd: Number(r.price_sd ?? 0),
        cv: Number(r.price_mean)
          ? Number(r.price_sd) / Number(r.price_mean)
          : 0,
      },
      unitPrice: {
        n: Number(r.n),
        mean: Number(r.unit_mean),
        median: Number(r.unit_p50),
        p10: Number(r.unit_p10),
        p25: Number(r.unit_p25),
        p75: Number(r.unit_p75),
        p90: Number(r.unit_p90),
        sd: Number(r.unit_sd ?? 0),
        cv: Number(r.unit_mean) ? Number(r.unit_sd) / Number(r.unit_mean) : 0,
      },
    }));
    console.log(`  ${byType.length} 種類`);

    /* 年次の推移。 */
    console.log("年次の推移を集計...");
    const yearRes = await pool.query(
      `SELECT trade_year AS year, count(*)::bigint AS n,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS p50
         FROM property_transactions
        WHERE ${BASE_WHERE}
        GROUP BY 1 HAVING count(*) >= ${MIN_ROWS}
        ORDER BY 1`,
    );
    const yearly: PurchaseYearPoint[] = yearRes.rows.map((r) => ({
      year: Number(r.year),
      count: Number(r.n),
      medianUnitPrice: Math.round(Number(r.p50)),
    }));

    /* 構造別（RC・木造…）。 */
    console.log("構造別を集計...");
    const structRes = await pool.query(
      `SELECT structure, count(*)::bigint AS n,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS p50
         FROM property_transactions
        WHERE ${BASE_WHERE} AND structure IS NOT NULL AND structure <> ''
        GROUP BY 1 HAVING count(*) >= ${MIN_ROWS}
        ORDER BY n DESC LIMIT 12`,
    );
    const byStructure: PurchaseStructureStat[] = structRes.rows.map((r) => ({
      structure: String(r.structure),
      count: Number(r.n),
      medianUnitPrice: Math.round(Number(r.p50)),
    }));

    /*
      築年数別。区分は buildingAgeBucket に持たせてあるので、SQL では
      成約年と建築年の組ごとに集計だけして、区分けは JS 側で畳む。
      こうすると「欠損を 0 で埋めない」規則が 1 か所で効く。
    */
    console.log("築年数別を集計...");
    const ageRes = await pool.query(
      `SELECT trade_year, building_year, count(*)::bigint AS n,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS p50
         FROM property_transactions
        WHERE ${BASE_WHERE} AND building_year IS NOT NULL
        GROUP BY 1, 2`,
    );
    const ageAcc = new Map<number, { label: string; n: number; sum: number }>();
    for (const r of ageRes.rows) {
      const b = buildingAgeBucket(
        Number(r.trade_year),
        Number(r.building_year),
      );
      if (!b) continue;
      const n = Number(r.n);
      const cur = ageAcc.get(b.order) ?? { label: b.label, n: 0, sum: 0 };
      cur.n += n;
      // 中央値の中央値は取れないので、件数で重み付けした平均で代表させる。
      cur.sum += Number(r.p50) * n;
      ageAcc.set(b.order, cur);
    }
    const byAge: PurchaseAgeStat[] = [...ageAcc.entries()]
      .map(([order, v]) => ({
        order,
        label: v.label,
        count: v.n,
        medianUnitPrice: Math.round(v.sum / v.n),
      }))
      .sort((a, b) => a.order - b.order);

    /* 建物比率の帯別。「建物代が高い物件はいくらか」を出す。 */
    console.log("建物比率の帯別を集計...");
    const ratioRes = await pool.query(
      `SELECT building_ratio, count(*)::bigint AS n,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY trade_price)::float8 AS p50
         FROM property_transactions
        WHERE ${BASE_WHERE} AND building_ratio IS NOT NULL
        GROUP BY 1`,
    );
    const ratioAcc = new Map<
      number,
      { label: string; n: number; sum: number }
    >();
    for (const r of ratioRes.rows) {
      const b = buildingRatioBand(Number(r.building_ratio));
      if (!b) continue;
      const n = Number(r.n);
      const cur = ratioAcc.get(b.order) ?? { label: b.label, n: 0, sum: 0 };
      cur.n += n;
      cur.sum += Number(r.p50) * n;
      ratioAcc.set(b.order, cur);
    }
    const byRatioBand: PurchaseRatioStat[] = [...ratioAcc.entries()]
      .map(([order, v]) => ({
        order,
        label: v.label,
        count: v.n,
        medianPrice: Math.round(v.sum / v.n),
      }))
      .sort((a, b) => a.order - b.order);

    /*
      都道府県別。地価公示（land_price_points）と突き合わせる。
      成約は建物込み・公示は更地なので**水準は比べられない**が、
      県をまたいだ相対の並びは読める（型の註に書いてある）。
    */
    console.log("都道府県別を集計...");
    const prefRes = await pool.query(
      `SELECT prefecture, count(*)::bigint AS n,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_sqm)::float8 AS p50,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY building_ratio)::float8 AS ratio50
         FROM property_transactions
        WHERE ${BASE_WHERE}
        GROUP BY 1 HAVING count(*) >= ${MIN_ROWS}
        ORDER BY n DESC`,
    );
    const landRes = await pool.query(
      `SELECT prefecture,
              percentile_cont(0.50) WITHIN GROUP (ORDER BY price_per_sqm)::float8 AS p50
         FROM land_price_points
        WHERE price_per_sqm IS NOT NULL
        GROUP BY 1`,
    );
    const landByPref = new Map<string, number>();
    for (const r of landRes.rows) {
      const v = Number(r.p50);
      if (Number.isFinite(v) && v > 0) landByPref.set(String(r.prefecture), v);
    }
    const prefectures: PurchasePrefectureStat[] = prefRes.rows.map((r) => {
      const pref = String(r.prefecture);
      const median = Math.round(Number(r.p50));
      const land = landByPref.get(pref) ?? null;
      return {
        prefecture: pref,
        count: Number(r.n),
        medianUnitPrice: median,
        medianBuildingRatio:
          r.ratio50 === null
            ? null
            : Math.round(Number(r.ratio50) * 1000) / 1000,
        landPriceMedian: land === null ? null : Math.round(land),
        vsLandPrice:
          land && land > 0 ? Math.round((median / land) * 100) / 100 : null,
      };
    });
    console.log(
      `  ${prefectures.length} 県（地価公示と突き合わせ ${
        prefectures.filter((p) => p.vsLandPrice !== null).length
      } 県）`,
    );

    /*
      分布は marketStats の histogram() を通す。家賃と作り方を揃えるため。
      全行はメモリに載らないので抽出する。

      **`LIMIT` だけでは無作為にならない。**ORDER BY が無いと物理順、
      つまり取り込み順で返る。取り込みは県ごとに回しているので、
      先頭 40 万行は特定の県に偏る。分布としては使えない。

      `ORDER BY random()` は全行に乱数を振って整列するので 200 万行だと
      重い。`TABLESAMPLE BERNOULLI` は**行ごとに**確率で採るので偏らず、
      整列も要らない。ページ単位の SYSTEM は速いが、同じ県が同じページに
      固まっている以上ここでは偏るので使わない。
    */
    const samplePct = Math.min(100, Math.ceil((SAMPLE_LIMIT / rows) * 100));
    console.log(`分布のために標本を引く（${samplePct}%）...`);
    const sampleRes = await pool.query(
      `SELECT unit_price_sqm, building_ratio
         FROM property_transactions TABLESAMPLE BERNOULLI (${samplePct})
        WHERE ${BASE_WHERE}`,
    );
    const unitPrices: number[] = [];
    const ratios: number[] = [];
    for (const r of sampleRes.rows) {
      const u = Number(r.unit_price_sqm);
      if (Number.isFinite(u)) unitPrices.push(u);
      if (r.building_ratio !== null) {
        const b = Number(r.building_ratio);
        if (Number.isFinite(b) && b >= 0 && b <= 1) ratios.push(b);
      }
    }
    const unitPriceHist = histogram(unitPrices, 0, 1_500_000, 30);
    const buildingRatioHist = histogram(ratios, 0, 1, 20);
    console.log(
      `  ㎡単価 ${unitPrices.length} 件 / 建物比率 ${ratios.length} 件`,
    );

    const out: PurchaseStats = {
      generatedAt: new Date().toISOString(),
      source: { rows, withCoords, withBuildingRatio, yearFrom, yearTo },
      national: {
        byType,
        unitPriceHist,
        buildingRatioHist,
        byAge,
        byRatioBand,
        byStructure,
      },
      prefectures,
      yearly,
    };

    const outPath = path.join(
      process.cwd(),
      "src",
      "data",
      "purchaseStats.json",
    );
    fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
    console.log(`書き出した: ${outPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

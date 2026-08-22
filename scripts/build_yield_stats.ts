/**
 * 区画ごとの表面利回りを集計して src/data/yieldStats.json に書き出す。
 *
 * build_purchase_stats.ts（購入）・build_market_stats.ts（家賃）に続く 3 本目。
 * こちらは**両方を割る**ので、片側だけでは作れない。
 *
 * ## 区画で突き合わせられることは数えて確かめてある
 *
 * 2026-08-22 の実測（prisma/sql/20260822_probe_yield_coverage.sql）:
 *
 *   賃貸 rental_properties       989,705 行（座標あり 989,665）
 *   成約 property_transactions 2,471,817 行（座標あり 2,470,047）
 *
 *   賃貸が 5 件以上の区画   3,289
 *   成約が 5 件以上の区画  10,061
 *   両側そろう区画          3,253
 *
 * **制約は賃貸側**である。賃貸が 5 件以上ある区画の 98.9% は成約側もそろう。
 * 地図が白いところは「成約価格が無い」のではなく「賃貸を集めていない」。
 * この非対称は画面にも書くこと。読む人は逆に受け取りやすい。
 *
 * ## SQL 側で中央値まで出す
 *
 * 合わせて 340 万行あり、JS へ引き上げると載らない。区画ごとの中央値は
 * percentile_cont に任せ、JS には**区画 1 行ずつ**だけ持ってくる
 * （3,000 行程度）。build_purchase_stats.ts と同じ考え方。
 *
 * ## 割り算そのものは utils に置いてある
 *
 * grossYield / cellIdFor / MIN_SAMPLES_PER_SIDE は src/utils/yieldStats.ts。
 * **ここで書き直さない。**画面と集計で分母が食い違うのを避ける。
 * SQL 側の floor(lat/CELL) は cellIdFor と同じ丸めであること。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { summarizeDistribution } from "../src/utils/marketStats";
import type { PriceSummary } from "../src/utils/purchaseStats";
import {
  CELL_DEGREES,
  MIN_SAMPLES_PER_SIDE,
  grossYield,
  type YieldCell,
  type YieldStats,
} from "../src/utils/yieldStats";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * ㎡ あたり月額賃料の外れ値カット（円/㎡/月）。
 *
 * 都心の高級物件で 1 万円/㎡/月 を超えることはある（30㎡ で 30 万円）。
 * 5 万を超えるのは記載ミスか、面積が 1 桁間違っている行。下限の 300 は
 * 30㎡ で 9,000 円で、これも実在しない。中央値には効きにくいが、
 * **区画の件数が少ないときは 1 件で動く**ので先に落とす。
 */
const RENT_PER_SQM_MIN = 300;
const RENT_PER_SQM_MAX = 50_000;

/** 購入の ㎡ 単価の外れ値カット。build_purchase_stats.ts と同じ値にする。 */
const UNIT_PRICE_MIN = 10_000;
const UNIT_PRICE_MAX = 5_000_000;

/**
 * 購入側は**中古マンションだけ**に絞る。
 *
 * unit_price_sqm は propertyTxParse.ts で trade_price / area_sqm として
 * 作っている。この area_sqm は国交省 API の面積で、**種別によって指す
 * ものが違う。**
 *
 *   中古マンション等      専有面積        ← 賃貸の㎡と同じ土俵
 *   宅地(土地)            土地面積
 *   宅地(土地と建物)      土地面積（延床ではない）
 *
 * 戸建の土地は専有面積よりずっと広いので㎡単価が小さく出る。それを
 * 分母にすると利回りが跳ね上がる。**絞る前の実測（2026-08-22）で
 * 福井県 39.50% / 富山県 38.94% という値が出た。**実際の表面利回りは
 * 4〜12% の世界なので、明らかに壊れている。地方が上位に並んだのは
 * 土地が安いからで、これが種別の混入を示していた。
 *
 * 賃貸側は建物の構造で絞れない（rental_properties に構造の列が無い）。
 * 木造アパートと RC マンションの㎡賃料は違うので、**分子には両方が
 * 混ざっている。**これは画面に断りとして書く。
 */
const MANSION_TYPE = "中古マンション等";

/**
 * 購入側に使う年の幅。最新の年から数えてこの年数ぶん。
 *
 * 分子は「いまの募集賃料」なので、分母だけ 10 年前の成約価格を混ぜると
 * 利回りが実態より高く出る。**時点を揃える。**逆に 1 年だけにすると
 * 件数が減って区画が落ちるので 3 年。
 */
const YEARS_BACK = 3;

/** 表面利回りの上下限（年）。これを外れる区画は片側の集計が壊れている。 */
const YIELD_MIN = 0.005;
const YIELD_MAX = 0.5;

type CellRow = {
  y: number;
  x: number;
  rental_n: string;
  rental_med: string;
  purchase_n: string;
  purchase_med: string;
  prefecture: string | null;
};

/** DistributionSummary から skewness / kurtosis を落として PriceSummary に。 */
function toPriceSummary(values: number[]): PriceSummary | null {
  const s = summarizeDistribution(values);
  if (!s) return null;
  const { skewness: _skew, kurtosis: _kurt, ...rest } = s;
  return rest;
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString, max: 1 });

  try {
    await pool.query("SET statement_timeout = 0");

    /*
      種別の一覧を毎回出す。**絞り込みの名前が合っているかを、走らせる
      たびに目で確かめられるようにする。**取り込み側が名前を変えたら
      黙って 0 件になるのが一番こわい。
    */
    const typeRes = await pool.query<{ type: string | null; n: string }>(
      `SELECT property_type AS type, count(*) AS n
         FROM property_transactions GROUP BY 1 ORDER BY 2 DESC`,
    );
    console.log("成約の種別:");
    for (const t of typeRes.rows) {
      console.log(`  ${t.type ?? "(不明)"}  ${t.n}`);
    }
    if (!typeRes.rows.some((t) => t.type === MANSION_TYPE)) {
      throw new Error(
        `種別「${MANSION_TYPE}」が 1 件も無い。上の一覧と名前を突き合わせること。`,
      );
    }

    const yearRes = await pool.query<{ latest: number | null }>(
      `SELECT max(trade_year) AS latest FROM property_transactions
        WHERE unit_price_sqm BETWEEN $1 AND $2 AND property_type = $3`,
      [UNIT_PRICE_MIN, UNIT_PRICE_MAX, MANSION_TYPE],
    );
    const yearTo = yearRes.rows[0]?.latest ?? null;
    if (yearTo === null) {
      throw new Error(
        "成約価格が 1 件も無い。property_transactions の取り込みが先。",
      );
    }
    const yearFrom = yearTo - (YEARS_BACK - 1);
    console.log(`購入側の対象年: ${yearFrom}〜${yearTo}`);

    /*
      区画ごとの中央値を両側そろえて 1 行にする。

      floor(lat / CELL) は cellIdFor と同じ丸め。片側だけ別の丸め方に
      すると、境目の物件がずれた区画に入って件数が偏る。

      prefecture は mode()（最頻値）。区画は県境をまたぐことがあるが、
      並びの見出しに使うだけなので多数派で足りる。
    */
    const sql = `
      WITH r AS (
        SELECT floor(lat / $1)::int AS y,
               floor(lon / $1)::int AS x,
               count(*) AS n,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY rent::numeric / size_sqm
               ) AS med
        FROM rental_properties
        WHERE lat IS NOT NULL AND lon IS NOT NULL
          AND rent > 0 AND size_sqm > 0
          AND rent::numeric / size_sqm BETWEEN $2 AND $3
        GROUP BY 1, 2
        HAVING count(*) >= $4
      ), p AS (
        SELECT floor(lat / $1)::int AS y,
               floor(lon / $1)::int AS x,
               count(*) AS n,
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY unit_price_sqm
               ) AS med,
               mode() WITHIN GROUP (ORDER BY prefecture) AS prefecture
        FROM property_transactions
        WHERE lat IS NOT NULL AND lon IS NOT NULL
          AND property_type = $9
          AND unit_price_sqm BETWEEN $5 AND $6
          AND trade_year BETWEEN $7 AND $8
        GROUP BY 1, 2
        HAVING count(*) >= $4
      )
      SELECT r.y, r.x,
             r.n AS rental_n, r.med AS rental_med,
             p.n AS purchase_n, p.med AS purchase_med,
             p.prefecture
      FROM r JOIN p ON p.y = r.y AND p.x = r.x
    `;

    console.log("区画ごとの中央値を集計中...");
    const res = await pool.query<CellRow>(sql, [
      CELL_DEGREES,
      RENT_PER_SQM_MIN,
      RENT_PER_SQM_MAX,
      MIN_SAMPLES_PER_SIDE,
      UNIT_PRICE_MIN,
      UNIT_PRICE_MAX,
      yearFrom,
      yearTo,
      MANSION_TYPE,
    ]);
    console.log(`両側そろった区画: ${res.rowCount}`);

    const cells: YieldCell[] = [];
    const dropped: string[] = [];
    /* 都道府県ごとの利回り。区画を作るのと同じ回で貯める。 */
    const byPref = new Map<string, number[]>();

    for (const row of res.rows) {
      const rental = {
        n: Number(row.rental_n),
        medianPerSqm: Number(row.rental_med),
      };
      const purchase = {
        n: Number(row.purchase_n),
        medianPerSqm: Number(row.purchase_med),
      };
      const yieldValue = grossYield(rental, purchase);
      /*
        SQL の HAVING を通っていれば null にはならないはず。**なったら
        丸め方か件数の下限が食い違っている。**黙って捨てず数えて出す。
      */
      if (yieldValue === null) {
        dropped.push(`${row.y}:${row.x}`);
        continue;
      }
      /*
        上下限の外は、片側の集計が壊れている区画。0.5%（年）を下回るのは
        分母が異常に大きい、50% を超えるのは分母が小さすぎる。どちらも
        地図で見ると 1 マスだけ極端な色になって全体の目盛りを潰す。
      */
      if (yieldValue < YIELD_MIN || yieldValue > YIELD_MAX) {
        dropped.push(`${row.y}:${row.x}`);
        continue;
      }
      cells.push({
        cell: `${row.y}:${row.x}`,
        lat: (row.y + 0.5) * CELL_DEGREES,
        lon: (row.x + 0.5) * CELL_DEGREES,
        rental,
        purchase,
        grossYield: yieldValue,
      });
      if (row.prefecture) {
        const list = byPref.get(row.prefecture) ?? [];
        list.push(yieldValue);
        byPref.set(row.prefecture, list);
      }
    }
    if (dropped.length > 0) {
      console.log(
        `落とした区画: ${dropped.length}（例 ${dropped.slice(0, 5).join(", ")}）`,
      );
    }

    const byPrefecture = [...byPref.entries()]
      .map(([prefecture, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianYield =
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        return { prefecture, cells: values.length, medianYield };
      })
      .sort((a, b) => b.medianYield - a.medianYield);

    const rentalRows =
      Number(
        (
          await pool.query<{ n: string }>(
            `SELECT count(*) AS n FROM rental_properties
              WHERE lat IS NOT NULL AND lon IS NOT NULL
                AND rent > 0 AND size_sqm > 0`,
          )
        ).rows[0]?.n,
      ) || 0;
    const purchaseRows =
      Number(
        (
          await pool.query<{ n: string }>(
            `SELECT count(*) AS n FROM property_transactions
              WHERE lat IS NOT NULL AND lon IS NOT NULL
                AND property_type = $5
                AND unit_price_sqm BETWEEN $1 AND $2
                AND trade_year BETWEEN $3 AND $4`,
            [UNIT_PRICE_MIN, UNIT_PRICE_MAX, yearFrom, yearTo, MANSION_TYPE],
          )
        ).rows[0]?.n,
      ) || 0;

    const out: YieldStats = {
      generatedAt: new Date().toISOString(),
      source: {
        rentalRows,
        purchaseRows,
        cells: cells.length,
        yearFrom,
        yearTo,
      },
      distribution: toPriceSummary(
        cells.flatMap((c) => (c.grossYield === null ? [] : [c.grossYield])),
      ),
      cells,
      byPrefecture,
    };

    const outPath = path.join(process.cwd(), "src", "data", "yieldStats.json");
    fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
    console.log(`書き出した: ${outPath}（区画 ${cells.length}）`);
    for (const p of byPrefecture.slice(0, 10)) {
      console.log(
        `  ${p.prefecture}  区画 ${p.cells}  中央値 ${(p.medianYield * 100).toFixed(2)}%`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

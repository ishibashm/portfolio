/**
 * 家賃市場の計量分析データを集計して src/data/marketStats.json に書き出す。
 *
 * /relocation/market が静的に読み込む。ビルド時に DB を引かないのは
 * areaDirections.json と同じ理由（訪問のたびに 45 万行を集計しない）。
 * 毎晩 scrape-rentals.yml の geocode ジョブから叩き直す。
 *
 * 計算そのもの（OLS・分位点・Kaplan-Meier）は src/utils/marketStats.ts に
 * あり、そちらはユニットテストで検証している。このスクリプトは
 * 「DB から行を出して関数へ流す」だけに保つ。
 */
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import { toLogMessage } from "../src/lib/errorMessage";
import { addressPrefixClause } from "../src/lib/jisCityAlias";
import { TARGET_PREFECTURE_NAMES } from "../src/lib/scrapeTargets";
import {
  DailySummaryRow,
  MarketStats,
  MunicipalityVolatility,
  OlsAccumulator,
  PrefectureStats,
  PrefectureWeeklyMove,
  buildHedonicModel,
  hedonicX,
  histogram,
  kaplanMeier,
  summarizeDistribution,
  weeklyBaseRow,
  weeklyMoveFromRows,
} from "../src/utils/marketStats";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/** 統計に載せる最低標本数。少なすぎる県は回帰が暴れる */
const MIN_PREF_ROWS = 500;
/** 市区町村ボラティリティの最低標本数 */
const MIN_MUNI_ROWS = 100;

/** 家賃の外れ値カット。1 万円未満と 100 万円超は入力ミスか業務物件 */
const RENT_MIN = 10_000;
const RENT_MAX = 1_000_000;

interface Row {
  total: number;
  size: number;
  age: number;
  station: number;
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query("SET statement_timeout = 0");

    const nationalAcc = new OlsAccumulator(4);
    const nationalRents: number[] = [];
    const nationalSqm: number[] = [];
    // 全国の残差ヒストグラムは「県ごとのモデルに対する残差」を合算する。
    // 全国一本のモデルへの残差だと、地方と首都圏の水準差が残差に化けて
    // 「地方はぜんぶ割安」に見えてしまう。
    const nationalResidualHist = histogram([], -60, 60, 24);
    const prefStats: PrefectureStats[] = [];
    let totalListings = 0;

    for (const pref of TARGET_PREFECTURE_NAMES) {
      const { rows } = await pool.query<{
        total: string;
        size: string;
        age: string | null;
        station: string | null;
      }>(
        `SELECT (rent + coalesce(management_fee, 0))::float8 AS total,
                size_sqm::float8 AS size,
                building_age::float8 AS age,
                minutes_to_station::float8 AS station
           FROM rental_properties
          WHERE address LIKE $1 || '%'
            AND rent BETWEEN $2 AND $3
            AND size_sqm > 8 AND size_sqm < 300
            AND last_seen_at > now() - interval '30 days'
            AND (expire_date IS NULL OR expire_date >= now())`,
        [pref, RENT_MIN, RENT_MAX],
      );
      if (rows.length < MIN_PREF_ROWS) {
        if (rows.length > 0) {
          console.log(
            `${pref}: ${rows.length} 行（${MIN_PREF_ROWS} 未満なのでスキップ）`,
          );
        }
        continue;
      }
      totalListings += rows.length;

      const data: Row[] = rows.map((r) => ({
        total: Number(r.total),
        size: Number(r.size),
        age: r.age === null ? NaN : Number(r.age),
        station: r.station === null ? NaN : Number(r.station),
      }));

      const rents = data.map((d) => d.total);
      const sqmRents = data.map((d) => d.total / d.size);
      // 全国ぶんへの積み上げ。**スプレッドで push しないこと。**
      //
      // `push(...rents)` は配列の要素を 1 つずつ「引数」としてスタックに
      // 積むので、行数が多い県で `RangeError: Maximum call stack size
      // exceeded` になる。この環境の実測で 12 万件は通り 13 万件で落ちた。
      //
      // 対象の 6 番目が大阪府で、ここが閾値を超えていた。東京・神奈川・
      // 埼玉・千葉・兵庫まで進んだところで毎晩落ちており、しかも
      // ワークフロー側が continue-on-error なので**誰も気付かないまま
      // marketStats.json が 2026-08-13 から 11 日間更新されていなかった。**
      // 画面は古い数字を出し続けていた。
      //
      // 要素数に依らない for..of に変える。結果は同じ。
      for (const r of rents) nationalRents.push(r);
      for (const r of sqmRents) nationalSqm.push(r);

      // ヘドニック回帰。築年・駅徒歩が欠けている行はモデルからだけ外す
      const acc = new OlsAccumulator(4);
      const usable = data.filter(
        (d) => Number.isFinite(d.age) && Number.isFinite(d.station),
      );
      for (const d of usable) {
        acc.add(hedonicX(d.size, d.age, d.station), Math.log(d.total));
      }
      const model = buildHedonicModel(acc);
      nationalAcc.merge(acc);

      // 残差（% 換算）。exp(残差)-1 が「理論家賃に対する乖離率」
      let residualPct: number[] = [];
      if (model) {
        residualPct = usable.map((d) => {
          const pred = acc.predict(
            model.beta,
            hedonicX(d.size, d.age, d.station),
          );
          return (Math.exp(Math.log(d.total) - pred) - 1) * 100;
        });
        const h = histogram(residualPct, -60, 60, 24);
        h.forEach((b, i) => (nationalResidualHist[i].count += b.count));
      }

      prefStats.push({
        prefecture: pref,
        n: rows.length,
        rent: summarizeDistribution(rents)!,
        sqmRent: summarizeDistribution(sqmRents)!,
        hedonic: model,
        residualHist: histogram(residualPct, -60, 60, 24),
        residual: summarizeDistribution(residualPct),
      });
      console.log(
        `${pref}: ${rows.length} 行 / R²=${model ? model.r2.toFixed(3) : "-"}`,
      );
    }

    // ---- 新規掲載の日次系列（直近 90 日） ----
    const daily = await pool.query<{ d: string; n: string }>(
      `SELECT first_seen_at::date::text AS d, count(*)::int AS n
         FROM rental_properties
        WHERE first_seen_at > now() - interval '90 days'
        GROUP BY 1 ORDER BY 1`,
    );

    // ---- 掲載の生存分析 ----
    //
    // パージが古い行を消すため「消えた掲載」を完全には観測できない。
    // 近似として、7 日以上巡回で見かけていない行を「掲載終了（event）」、
    // それ以外を「掲載継続（打ち切り）」として扱う。metro は毎日、
    // regional も 3 日おきに巡回するので、7 日見ないのはほぼ終了を意味する。
    const survivalRows = await pool.query<{
      dur: number;
      gone: boolean;
      n: string;
    }>(
      `SELECT GREATEST(0, last_seen_at::date - first_seen_at::date) AS dur,
              (last_seen_at < now() - interval '7 days') AS gone,
              count(*)::int AS n
         FROM rental_properties
        WHERE first_seen_at IS NOT NULL AND last_seen_at IS NOT NULL
        GROUP BY 1, 2`,
    );
    const observations: { duration: number; event: boolean }[] = [];
    for (const r of survivalRows.rows) {
      const count = Number(r.n);
      for (let i = 0; i < count; i++) {
        observations.push({ duration: Number(r.dur), event: r.gone });
      }
    }
    const km = kaplanMeier(observations, 120);
    // 曲線は間引いて持つ。1 日刻み 120 点あれば描画には十分
    const seen = new Set<number>();
    const curve = km.curve.filter((p) => {
      const key = Math.round(p.day);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ---- 市区町村ボラティリティ（JIS 対照表がある県のみ） ----
    const jisPath = path.join(process.cwd(), "scripts", "jis_city_codes.json");
    const volatility: MunicipalityVolatility[] = [];
    if (fs.existsSync(jisPath)) {
      const jis = JSON.parse(fs.readFileSync(jisPath, "utf-8")) as Record<
        string,
        Array<{ code: string; name: string }>
      >;
      const { PREF_JP } = await import("../src/lib/scrapeTargets");
      for (const [slug, cities] of Object.entries(jis)) {
        const pref = PREF_JP[slug];
        if (!pref) continue;
        for (const c of cities) {
          if (c.code.endsWith("00")) continue;
          // 「ケ / ヶ」の表記ゆれぶんも数える。lib/jisCityAlias を見ること。
          const city = addressPrefixClause(pref + c.name);
          const nextArg = city.params.length + 1;
          const { rows } = await pool.query<{ sqm: string }>(
            `SELECT ((rent + coalesce(management_fee,0)) / size_sqm)::float8 AS sqm
               FROM rental_properties
              WHERE ${city.sql}
                AND rent BETWEEN $${nextArg} AND $${nextArg + 1}
                AND size_sqm > 8 AND size_sqm < 300
                AND last_seen_at > now() - interval '30 days'
                AND (expire_date IS NULL OR expire_date >= now())`,
            [...city.params, RENT_MIN, RENT_MAX],
          );
          if (rows.length < MIN_MUNI_ROWS) continue;
          const s = summarizeDistribution(rows.map((r) => Number(r.sqm)));
          if (!s) continue;
          volatility.push({
            municipality: c.name,
            prefecture: pref,
            n: s.n,
            medianSqmRent: Math.round(s.median),
            cv: Number(s.cv.toFixed(4)),
            iqrPct: Number((((s.p75 - s.p25) / s.median) * 100).toFixed(1)),
          });
        }
      }
    }
    volatility.sort((a, b) => b.cv - a.cv);

    // ---- 家賃指数の蓄積（MarketDailySummary へ 1 県 1 行 upsert） ----
    //
    // marketStats.json は毎晩上書きなので、水準の推移はテーブルに積まない
    // 限り失われる。テーブルがまだ無い環境（run-seed 前）でも夜間バッチを
    // 止めないよう、この節だけは失敗しても続行する。
    let rentIndexSeries: {
      date: string;
      n: number;
      medianRent: number;
      medianSqmRent: number;
    }[] = [];
    const weeklyMoves: PrefectureWeeklyMove[] = [];
    try {
      const natRentSummary = summarizeDistribution(nationalRents);
      const natSqmSummary = summarizeDistribution(nationalSqm);
      const upsert = async (
        prefecture: string,
        n: number,
        rent: { median: number; p25: number; p75: number },
        sqmMedian: number,
      ) => {
        await pool.query(
          `INSERT INTO "MarketDailySummary"
             (date, prefecture, n, "medianRent", "medianSqmRent", "p25Rent", "p75Rent")
           VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, prefecture) DO UPDATE SET
             n = EXCLUDED.n,
             "medianRent" = EXCLUDED."medianRent",
             "medianSqmRent" = EXCLUDED."medianSqmRent",
             "p25Rent" = EXCLUDED."p25Rent",
             "p75Rent" = EXCLUDED."p75Rent"`,
          [
            prefecture,
            n,
            Math.round(rent.median),
            Math.round(sqmMedian),
            Math.round(rent.p25),
            Math.round(rent.p75),
          ],
        );
      };
      if (natRentSummary && natSqmSummary) {
        await upsert(
          "全国",
          totalListings,
          natRentSummary,
          natSqmSummary.median,
        );
      }
      for (const p of prefStats) {
        await upsert(p.prefecture, p.n, p.rent, p.sqmRent.median);
      }
      const series = await pool.query<{
        date: string;
        n: string;
        mr: string;
        msr: string;
      }>(
        `SELECT date::text AS date, n, "medianRent" AS mr, "medianSqmRent" AS msr
           FROM "MarketDailySummary"
          WHERE prefecture = '全国' AND date > CURRENT_DATE - 180
          ORDER BY date`,
      );
      rentIndexSeries = series.rows.map((r) => ({
        date: r.date,
        n: Number(r.n),
        medianRent: Number(r.mr),
        medianSqmRent: Number(r.msr),
      }));
      console.log(`家賃指数: ${rentIndexSeries.length} 日ぶん蓄積済み`);

      // ---- 県ごとの「この 1 週間の動き」 ----
      //
      // 上で upsert したばかりの今日の行を含めて、県ごとに直近 30 日を
      // 読み、7 日以上前の集計日と比べる。差の計算は marketStats.ts の
      // 純関数（テストがある）。ここは行を出して流すだけ。
      //
      // 値下げ・値上げの件数は rental_price_history から。あの表は
      // DB の仕掛け（トリガ）が当たっていないと空のままなので、
      // 読めなければ null にして「数えられない」と区別する。
      const summaryRows = await pool.query<{
        prefecture: string;
        date: string;
        n: string;
        mr: string;
        msr: string;
      }>(
        `SELECT prefecture, date::text AS date, n,
                "medianRent" AS mr, "medianSqmRent" AS msr
           FROM "MarketDailySummary"
          WHERE prefecture <> '全国' AND date > CURRENT_DATE - 30
          ORDER BY prefecture, date`,
      );
      const byPref = new Map<string, DailySummaryRow[]>();
      for (const r of summaryRows.rows) {
        if (!byPref.has(r.prefecture)) byPref.set(r.prefecture, []);
        byPref.get(r.prefecture)!.push({
          date: r.date,
          n: Number(r.n),
          medianRent: Number(r.mr),
          medianSqmRent: Number(r.msr),
        });
      }
      let historyReadable = true;
      for (const [pref, rows] of byPref) {
        const pair = weeklyBaseRow(rows);
        if (!pair) continue;
        const where = addressPrefixClause(pref);
        const fresh = await pool.query<{ n: string }>(
          `SELECT count(*)::int AS n
             FROM rental_properties
            WHERE ${where.sql}
              AND first_seen_at > now() - interval '7 days'`,
          where.params,
        );
        let cuts: number | null = null;
        let rises: number | null = null;
        if (historyReadable) {
          try {
            const h = await pool.query<{ cuts: string; rises: string }>(
              `SELECT count(*) FILTER (WHERE h.rent < h.prev_rent)::int AS cuts,
                      count(*) FILTER (WHERE h.rent > h.prev_rent)::int AS rises
                 FROM rental_price_history h
                 JOIN rental_properties p ON p.id = h.property_id
                WHERE h.observed_at > now() - interval '7 days'
                  AND ${where.sql.replace(/address/g, "p.address")}`,
              where.params,
            );
            cuts = Number(h.rows[0]?.cuts ?? 0);
            rises = Number(h.rows[0]?.rises ?? 0);
          } catch (e) {
            // 1 県で読めなければ全県で読めない（表そのものが無い）。
            // 以後は問い合わせず null のまま
            historyReadable = false;
            console.warn(
              `::warning::rental_price_history が読めないので値下げ件数は出さない: ${toLogMessage(e)}`,
            );
          }
        }
        weeklyMoves.push(
          weeklyMoveFromRows(pref, pair.latest, pair.base, {
            newListings7d: Number(fresh.rows[0]?.n ?? 0),
            priceCuts7d: cuts,
            priceRises7d: rises,
          }),
        );
      }
      console.log(`今週の動き: ${weeklyMoves.length} 県ぶん`);
    } catch (e) {
      /*
        GitHub Actions の注釈として出す。ただの console.warn だと 25 本の
        ジョブのログに埋もれ、**誰にも見えない。**実際、表が本番に無い
        まま（relation "MarketDailySummary" does not exist）毎晩ここを
        通っていたのに、ジョブは緑で、marketStats.json の rentIndexSeries
        は導入日からずっと空だった（2026-09-07 にログを読んで判明）。
        画面は「蓄積中（0 日ぶん）」を出し続けていた。

        続行はそのまま（ここで止めると県別の集計まで道連れになる）。
        落ちたことだけを、Summary に残る形で出す。
      */
      const reason = toLogMessage(e);
      console.warn(
        `::warning::MarketDailySummary への蓄積をスキップ。家賃指数は今夜ぶんが積まれない（表が無いなら prisma/sql/20260907_add_market_daily_summary.sql を db-apply-sql で当てる）: ${reason}`,
      );
    }

    const out: MarketStats = {
      generatedAt: new Date().toISOString(),
      totalListings,
      rentIndexSeries,
      national: {
        rentHist: histogram(nationalRents, 0, 300_000, 30),
        rent: summarizeDistribution(nationalRents),
        sqmRent: summarizeDistribution(nationalSqm),
        hedonic: buildHedonicModel(nationalAcc),
        residualHist: nationalResidualHist,
      },
      dailyNewListings: daily.rows.map((r) => ({
        date: r.d,
        count: Number(r.n),
      })),
      survival: { curve, medianDays: km.medianDays, n: observations.length },
      prefectures: prefStats.sort((a, b) => b.n - a.n),
      volatilityRanking: volatility.slice(0, 20),
      weeklyMoves,
    };

    const outPath = path.join(process.cwd(), "src", "data", "marketStats.json");
    fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
    const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
    console.log(
      `書き出し: ${outPath}（${kb} KB / ${prefStats.length} 県 / 掲載 ${totalListings} 件）`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

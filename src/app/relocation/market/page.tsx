"use client";

/**
 * 家賃市場の計量分析。株式の定量分析の道具を家賃市場に当てるページ。
 *
 *   ヘドニック回帰   … ファクターモデル。家賃を広さ・築年・駅徒歩に分解
 *   残差の分布       … 理論家賃との乖離＝割安・割高。スキャナーの
 *                      「掘り出し物件」はこの左裾を拾っている
 *   新規掲載の日次   … 出来高。市場の活性
 *   生存分析         … 掲載がどれだけ速く消えるか＝流動性
 *   変動係数         … 市区町村ごとのボラティリティ
 *
 * データは毎晩 scripts/build_market_stats.ts が集計して静的に焼き込む。
 * 訪問時に DB は叩かない。
 */

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import marketStats from "@/data/marketStats.json";
import type { MarketStats } from "@/utils/marketStats";
import { trailingAverage } from "@/utils/marketStats";

const stats = marketStats as unknown as MarketStats;

const yen = (v: number) => `${Math.round(v / 1000).toLocaleString()}千円`;
const man = (v: number) => `${(v / 10000).toFixed(1)}万`;

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs"
      title={hint}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-stone-800">{value}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-stone-800">{title}</h2>
      <p className="mt-0.5 mb-4 text-[11px] leading-relaxed text-stone-500">
        {subtitle}
      </p>
      {children}
    </section>
  );
}

export default function MarketAnalyticsPage() {
  const generated = stats.generatedAt;

  if (!generated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-6 font-sans">
        <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
          <h1 className="text-lg font-bold text-amber-900">
            家賃市場の計量分析（準備中）
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            毎晩のデータ集計がまだ一度も走っていません。次回の夜間バッチが
            完了すると、ここにヘドニック回帰・分布分析・生存分析が並びます。
          </p>
        </div>
      </div>
    );
  }

  const nat = stats.national;
  const dailySeries = (() => {
    const ma = trailingAverage(
      stats.dailyNewListings.map((d) => d.count),
      7,
    );
    return stats.dailyNewListings.map((d, i) => ({
      date: d.date.slice(5),
      count: d.count,
      ma7: Math.round(ma[i]),
    }));
  })();

  const rentHist = nat.rentHist.map((b) => ({
    label: man(b.x0),
    count: b.count,
  }));
  const residualHist = nat.residualHist.map((b) => ({
    label: `${b.x0 >= 0 ? "+" : ""}${Math.round(b.x0)}%`,
    count: b.count,
    isCheap: b.x1 <= 0,
  }));
  const survivalSeries = stats.survival.curve.map((p) => ({
    day: p.day,
    pct: Math.round(p.survival * 1000) / 10,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="text-xl font-bold">家賃市場の計量分析</h1>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            株式の定量分析で使う道具（ファクターモデル・分布分析・生存分析）を
            賃貸市場に当てています。毎晩の巡回データから自動更新。最終更新:{" "}
            {new Date(generated).toLocaleString("ja-JP")}
          </p>
        </header>

        {/* KPI 行 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="分析対象の掲載"
            value={`${stats.totalListings.toLocaleString()}件`}
            hint="直近30日に確認できた掲載のうち、家賃・面積が正常な範囲のもの"
          />
          {nat.rent && (
            <KpiCard
              label="家賃の中央値"
              value={`${(nat.rent.median / 10000).toFixed(1)}万円`}
              hint={`平均 ${(nat.rent.mean / 10000).toFixed(1)}万円。右裾の分布なので中央値を見る`}
            />
          )}
          {nat.hedonic && (
            <KpiCard
              label="モデルの説明力 R²"
              value={nat.hedonic.r2.toFixed(2)}
              hint="広さ・築年・駅徒歩だけで家賃の分散をどれだけ説明できるか"
            />
          )}
          <KpiCard
            label="掲載の中央存続期間"
            value={
              stats.survival.medianDays !== null
                ? `${stats.survival.medianDays}日`
                : "計測中"
            }
            hint="Kaplan-Meier 推定。半分の掲載がこの日数で消える＝市場の消化速度"
          />
        </div>

        {/* 出来高: 新規掲載 */}
        <Section
          title="新規掲載の推移（出来高）"
          subtitle="1日に市場へ出てきた新しい掲載の数。太線は7日移動平均。供給の勢いが読める。巡回対象の県を増やした日は段差になる。"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} width={44} />
                <Tooltip />
                <Line
                  dataKey="count"
                  name="新規掲載"
                  stroke="#a8a29e"
                  dot={false}
                  strokeWidth={1}
                />
                <Line
                  dataKey="ma7"
                  name="7日平均"
                  stroke="#4f46e5"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* 分布 */}
        <div className="grid gap-5 md:grid-cols-2">
          <Section
            title="家賃の分布"
            subtitle={
              nat.rent
                ? `右に裾を引く対数正規型（歪度 ${nat.rent.skewness.toFixed(1)}）。中央値 ${(nat.rent.median / 10000).toFixed(1)}万・P10 ${(nat.rent.p10 / 10000).toFixed(1)}万・P90 ${(nat.rent.p90 / 10000).toFixed(1)}万。平均は高額側に引っ張られるため、相場は中央値で読む。`
                : "データ待ち"
            }
          >
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rentHist}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9 }}
                    minTickGap={16}
                  />
                  <YAxis tick={{ fontSize: 9 }} width={44} />
                  <Tooltip />
                  <Bar dataKey="count" name="件数" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section
            title="割安・割高の分布（モデル残差）"
            subtitle="ヘドニック回帰の理論家賃に対する乖離率。0%が「条件相応の家賃」。左裾（マイナス側）が割安で、スキャナーの掘り出し物件はここを拾っている。県ごとのモデルへの残差を合算しており、地域間の水準差は含まない。"
          >
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={residualHist}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9 }}
                    minTickGap={16}
                  />
                  <YAxis tick={{ fontSize: 9 }} width={44} />
                  <Tooltip />
                  <Bar dataKey="count" name="件数" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        {/* 生存分析 */}
        <Section
          title="掲載の生存曲線（流動性）"
          subtitle={`掲載されてから t 日後も市場に残っている確率。急落するほど回転が速い＝人気の市場。巡回で7日以上見かけなくなった掲載を「終了」、掲載中のものは打ち切りとして Kaplan-Meier で推定（n=${stats.survival.n.toLocaleString()}）。パージ運用のため長期側は近似。`}
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={survivalSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "掲載からの日数",
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 10,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={40}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip formatter={(v) => [`${v}%`, "残存率"]} />
                <Line
                  dataKey="pct"
                  name="残存率"
                  stroke="#e11d48"
                  dot={false}
                  strokeWidth={2}
                  type="stepAfter"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* ヘドニック係数表 */}
        <Section
          title="県別ファクターモデル（ヘドニック回帰）"
          subtitle="log(総家賃) を 広さ・築年数・駅徒歩 に回帰した係数。株式のマルチファクターモデルと同じ発想で、家賃を要因に分解する。効果はすべて「家賃が何%変わるか」に換算済み。"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-stone-400">
                  <th className="py-1.5 pr-2">県</th>
                  <th className="py-1.5 pr-2 text-right">掲載数</th>
                  <th className="py-1.5 pr-2 text-right">家賃中央値</th>
                  <th
                    className="py-1.5 pr-2 text-right"
                    title="面積を10%広くしたとき家賃が何%上がるか"
                  >
                    広さ+10%
                  </th>
                  <th
                    className="py-1.5 pr-2 text-right"
                    title="築1年ごとの下落率"
                  >
                    築1年
                  </th>
                  <th
                    className="py-1.5 pr-2 text-right"
                    title="駅から徒歩1分遠いごとの下落率"
                  >
                    徒歩1分
                  </th>
                  <th className="py-1.5 text-right" title="モデルの説明力">
                    R²
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.prefectures.map((p) => (
                  <tr
                    key={p.prefecture}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-1.5 pr-2 font-semibold">
                      {p.prefecture}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {p.n.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {yen(p.rent.median)}
                    </td>
                    {p.hedonic ? (
                      <>
                        <td className="py-1.5 pr-2 text-right font-mono text-emerald-700">
                          +{p.hedonic.effects.sizeElasticityPct.toFixed(1)}%
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-rose-700">
                          {p.hedonic.effects.agePctPerYear.toFixed(2)}%
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-rose-700">
                          {p.hedonic.effects.stationPctPerMin.toFixed(2)}%
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {p.hedonic.r2.toFixed(2)}
                        </td>
                      </>
                    ) : (
                      <td
                        colSpan={4}
                        className="py-1.5 text-right text-stone-400"
                      >
                        標本不足
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ボラティリティ */}
        <Section
          title="市区町村ボラティリティ（㎡単価の変動係数）"
          subtitle="同じ市区町村の中での価格のばらつき。高いほど「同じ町なのに高い部屋と安い部屋が混在」しており、掘り出し物件が出やすい市場。株式のボラティリティが機会でありリスクであるのと同じ。"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-stone-400">
                  <th className="py-1.5 pr-2">市区町村</th>
                  <th className="py-1.5 pr-2 text-right">掲載数</th>
                  <th className="py-1.5 pr-2 text-right">㎡単価中央値</th>
                  <th
                    className="py-1.5 pr-2 text-right"
                    title="四分位範囲÷中央値"
                  >
                    IQR
                  </th>
                  <th className="py-1.5 text-right" title="標準偏差÷平均">
                    CV
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.volatilityRanking.map((m) => (
                  <tr
                    key={m.prefecture + m.municipality}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-1.5 pr-2 font-semibold">
                      {m.prefecture}
                      {m.municipality}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {m.n.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {m.medianSqmRent.toLocaleString()}円
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {m.iqrPct.toFixed(1)}%
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {m.cv.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats.volatilityRanking.length === 0 && (
            <p className="text-[11px] text-stone-400">データ待ち</p>
          )}
        </Section>

        {/* 方法論 */}
        <Section
          title="方法論と限界"
          subtitle="何を計算していて、何は言えないか。"
        >
          <ul className="list-disc space-y-1.5 pl-4 text-[11px] leading-relaxed text-stone-600">
            <li>
              <b>ヘドニック回帰</b>: log(家賃+管理費) を log(面積)・築年数・
              駅徒歩分に最小二乗で回帰。県ごとに別モデル。間取り・階数・
              構造は未投入なので、残差にはそれらの効果も混ざる。
              「割安」に見える物件には理由があることも多い。
            </li>
            <li>
              <b>生存分析</b>: パージ運用で消えた掲載は完全には観測できない。
              「7日以上巡回で見ない＝終了」という近似を使っており、
              長期側の推定は保守的でない可能性がある。
            </li>
            <li>
              これは観測データの記述であって、因果関係でも将来の予測でもない。
              個別の物件判断は
              <Link
                href="/relocation/arbitrage"
                className="mx-0.5 font-semibold text-indigo-600 underline"
              >
                物件スキャナー
              </Link>
              で、方位・時期と合わせて行うこと。
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

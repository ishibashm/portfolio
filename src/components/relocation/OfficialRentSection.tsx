"use client";

/**
 * 家賃市場の頁（/relocation/market）の、公的な家賃の統計の札。
 *
 * 頁の「家賃指数の推移」は掲載（賃貸の巡回）の㎡単価の中央値で、巡回を
 * 規約に従って止めた 2026-09-13 で止まっていた（利用者の指摘、2026-09-30
 * 「このデータは最新？」）。毎月出る公的な統計に置き換える。
 *
 * - 推移 … 消費者物価指数の品目「民営家賃」（2025 年＝100）。全国と
 *   東京都区部の 2 本（系列の色は 2 本まで。chartPalette の決めごと）
 * - 地域別の前年同月比 … 同じ指数の最新月
 * - 都市別の水準 … 小売物価統計調査の銘柄「民営家賃」（3.3㎡あたり月額）
 *
 * 写しは scripts/fetch_estat_rent.ts が毎月作る（src/data/estatRent.json）。
 * ここは受け取って描くだけ。e-Stat の API で取ったデータなので、規約の
 * クレジットと出典・加工の明記をこの札に置く（estatApiCredit が見張る）。
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GRID_STROKE, SERIES } from "@/lib/chartPalette";
import { ESTAT_API_CREDIT } from "@/lib/estatCredit";
import type { EstatRentSnapshot } from "@/utils/estatRent";

/** "2026-08" → "2026年8月" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/* JSX の中で日本語を改行すると半角スペースが入る（jsxJapaneseLinebreak）ので、
   長い文は文字列にしておく */
const RETAIL_NOTE =
  "小売物価統計調査の「民営家賃」。借家 1 か月・3.3㎡（1 坪）あたりの額で、㎡あたりは 3.3 で割った目安。都道府県庁所在市と人口 15 万以上の市。";
const SOURCE_NOTE =
  "「消費者物価指数」「小売物価統計調査」（総務省）を加工して作成。出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）。";

/** 1 坪（3.3㎡）あたりの額を㎡あたりにする。表の単位が 3.3㎡ なので 3.3 で割る */
const perSqm = (yen: number) => Math.round(yen / 3.3);

export function OfficialRentSection({
  snapshot,
}: {
  snapshot: EstatRentSnapshot;
}) {
  const { cpi, retail } = snapshot;
  const [first, second] = cpi.series;
  const byMonth = new Map<string, { month: string; a?: number; b?: number }>();
  for (const p of first?.points ?? []) {
    byMonth.set(p.month, { month: p.month, a: p.value });
  }
  for (const p of second?.points ?? []) {
    const row = byMonth.get(p.month) ?? { month: p.month };
    row.b = p.value;
    byMonth.set(p.month, row);
  }
  const chart = [...byMonth.values()].sort((x, y) =>
    x.month.localeCompare(y.month),
  );

  const areaOf = (name: string) => cpi.areas.find((a) => a.areaName === name);
  const summary = cpi.series
    .map((s) => {
      const a = areaOf(s.areaName);
      return a
        ? `${s.areaName} ${a.index.toFixed(1)}（前年同月比 ${pct(a.yoyPct)}）`
        : null;
    })
    .filter(Boolean)
    .join("、");

  const areas = [...cpi.areas].sort(
    (x, y) => (y.yoyPct ?? -Infinity) - (x.yoyPct ?? -Infinity),
  );
  /* 月次の地域別は、表によっては全国・東京都区部しか無い（2025年基準の
     消費者物価指数は 2 地域だった。2026-09-30 の取得）。本文の要約と同じ
     2 行を表にしても意味が無いので、推移に無い地域があるときだけ出す */
  const showAreas = cpi.areas.length > cpi.series.length;
  const cities = [...retail.cities].sort((x, y) => y.yen - x.yen);

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-stone-800">
        民営家賃の推移（消費者物価指数・2025年＝100）—{" "}
        {monthLabel(cpi.latestMonth)}まで
      </h2>
      <p className="mt-0.5 mb-4 text-xs leading-relaxed text-stone-500">
        {`総務省が毎月出す消費者物価指数の品目「民営家賃」。同じ質の借家の家賃が、2025年の平均を 100 としてどれだけ動いたかを表す。広さや築年の違う物件が混ざっても動かないので、掲載の中央値より相場の向きを読みやすい。${monthLabel(cpi.latestMonth)}は${summary}。毎月、前月分が出たあとに取り直す。`}
      </p>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} minTickGap={24} />
            <YAxis
              tick={{ fontSize: 10 }}
              width={44}
              domain={["auto", "auto"]}
            />
            <Tooltip
              labelFormatter={(m) => monthLabel(String(m))}
              formatter={(v) => (typeof v === "number" ? v.toFixed(1) : v)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {first && (
              <Line
                dataKey="a"
                name={first.areaName}
                stroke={SERIES.primary}
                dot={false}
                strokeWidth={2}
              />
            )}
            {second && (
              <Line
                dataKey="b"
                name={second.areaName}
                stroke={SERIES.secondary}
                dot={false}
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={`mt-4 grid gap-3 ${showAreas ? "md:grid-cols-2" : ""}`}>
        {showAreas && (
          <details className="rounded-xl border border-stone-200 p-3">
            <summary className="cursor-pointer text-xs font-bold text-stone-700">
              地域別の前年同月比（{areas.length} 地域・
              {monthLabel(cpi.latestMonth)}）
            </summary>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 font-semibold">地域</th>
                  <th className="whitespace-nowrap py-1 pl-3 text-right font-semibold">
                    指数
                  </th>
                  <th className="whitespace-nowrap py-1 pl-3 text-right font-semibold">
                    前年同月比
                  </th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.areaName} className="border-t border-stone-100">
                    <td className="py-1">{a.areaName}</td>
                    <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums">
                      {a.index.toFixed(1)}
                    </td>
                    <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums">
                      {pct(a.yoyPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        <details className="rounded-xl border border-stone-200 p-3">
          <summary className="cursor-pointer text-xs font-bold text-stone-700">
            都市別の家賃の水準（{cities.length} 都市・
            {monthLabel(retail.latestMonth)}）
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            {RETAIL_NOTE}
          </p>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="py-1 font-semibold">都市</th>
                <th className="whitespace-nowrap py-1 pl-3 text-right font-semibold">
                  3.3㎡あたり
                </th>
                <th className="whitespace-nowrap py-1 pl-3 text-right font-semibold">
                  ㎡あたり
                </th>
                <th className="whitespace-nowrap py-1 pl-3 text-right font-semibold">
                  前年同月
                </th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.areaCode} className="border-t border-stone-100">
                  <td className="py-1">{c.areaName}</td>
                  <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums">
                    {c.yen.toLocaleString()}円
                  </td>
                  <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums">
                    {perSqm(c.yen).toLocaleString()}円
                  </td>
                  <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums">
                    {c.yenYearAgo === null
                      ? "—"
                      : pct(Math.round((c.yen / c.yenYearAgo - 1) * 1000) / 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        {`${SOURCE_NOTE}${ESTAT_API_CREDIT}`}
      </p>
    </section>
  );
}

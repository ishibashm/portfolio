"use client";

/**
 * 家賃市場の頁（/relocation/market）の県別ファクターモデル（ヘドニック
 * 回帰）を、**暮らしの単位**で見せる部品。
 *
 * ## なぜ作り直したか（利用者の指摘、2026-09-30）
 *
 * 「数値だけだと分かりにくい」。以前の表は係数の読み下し（広さ +10%・
 * 築 1 年・徒歩 1 分・R²）を 47 行ぶん並べただけで、-1.16% と -2.26% の
 * どちらが大きいのか、それが家賃にしていくらなのかを読む人が自分で
 * 換算するしかなかった。
 *
 * - **場面に直す** … 「駅から 10 分遠い」「築 10 年古い」「広さ 1.5 倍
 *   （20→30㎡）」。係数（log 家賃への効き）から正確に換算する
 *   （exp(10·β) − 1、1.5^β − 1）。1 分・1 年の値を 10 倍するのではない
 * - **円に直す** … その県の家賃中央値の部屋に当てた目安
 * - **棒で比べる** … 列ごとに最大の効きを満幅にした棒
 * - **要点を先に** … 3 つの条件それぞれで、最も効く県と最も効かない県
 * - R² は「当てはまり」と言い換える
 *
 * 数字（係数）は marketStats.json のまま。計算は変えていない。
 */

import { useState } from "react";
import type { HedonicModel, PrefectureStats } from "@/utils/marketStats";

export interface Scenario {
  /** 駅から徒歩 10 分遠いとき、家賃が何 % 変わるか */
  station10: number;
  /** 築 10 年古いとき */
  age10: number;
  /** 広さ 1.5 倍のとき */
  size15: number;
}

/**
 * 係数（beta = [定数項, log(面積), 築年, 駅徒歩]、目的変数は log 家賃）を
 * 場面ごとの変化率（%）にする。
 */
export function scenarioOf(h: HedonicModel): Scenario {
  const [, bSize, bAge, bStation] = h.beta;
  return {
    station10: (Math.exp(10 * bStation) - 1) * 100,
    age10: (Math.exp(10 * bAge) - 1) * 100,
    size15: (Math.pow(1.5, bSize) - 1) * 100,
  };
}

const KEYS = ["station10", "age10", "size15"] as const;
type Key = (typeof KEYS)[number];

const LABEL: Record<Key, { head: string; sub: string }> = {
  station10: { head: "駅から10分遠い", sub: "徒歩5分→15分" },
  age10: { head: "築10年古い", sub: "築5年→15年" },
  size15: { head: "広さ1.5倍", sub: "20㎡→30㎡" },
};

type SortKey = "n" | Key;
const SORTS: { key: SortKey; label: string }[] = [
  { key: "n", label: "掲載の多い順" },
  { key: "station10", label: "駅の近さが効く順" },
  { key: "age10", label: "築年が効く順" },
  { key: "size15", label: "広さが効く順" },
];

/** 変化率。四捨五入で 0 になるものは符号を付けず「±0%」（「+0%」と読ませない） */
export function pct(v: number): string {
  const r = Math.round(Math.abs(v));
  if (r === 0) return "±0%";
  return `${v > 0 ? "+" : "−"}${r}%`;
}

/** 円の変化を「2.6 万円」「4 千円」「900 円」の形に。100 円未満は ±0 円 */
export function yenDelta(v: number): string {
  const a = Math.abs(v);
  const sign = v > 0 ? "+" : "−";
  if (a >= 10000) return `${sign}${(a / 10000).toFixed(1)}万円`;
  if (a >= 1000) return `${sign}${Math.round(a / 1000)}千円`;
  const h = Math.round(a / 100) * 100;
  return h === 0 ? "±0円" : `${sign}${h}円`;
}

/* JSX の中で日本語を改行すると半角スペースが入る（jsxJapaneseLinebreak）ので、
   長い注記は文字列にしておく */
const NOTE =
  "ほかの条件が同じ部屋どうしを比べたときの差です。円はその県の家賃中央値の部屋に当てた目安。" +
  "「当てはまり」は広さ・築年・駅徒歩の 3 つだけで家賃のばらつきをどれだけ言い当てられるか（決定係数 R²）。" +
  "間取り・階数・構造は入れていないので、その分は外れます。";

const man = (v: number) => `${(v / 10000).toFixed(1)}万円`;
const count = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)}万件` : `${n.toLocaleString()}件`;

interface Row {
  p: PrefectureStats;
  s: Scenario | null;
}

/** 効きの大きさで並べる（符号ではなく絶対値。広さは上がる側、ほかは下がる側） */
function magnitude(s: Scenario | null, key: Key): number {
  return s ? Math.abs(s[key]) : -1;
}

function EffectCell({
  value,
  median,
  max,
}: {
  value: number;
  median: number;
  max: number;
}) {
  const width = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const up = value > 0;
  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-xs font-bold ${up ? "text-emerald-700" : "text-rose-700"}`}
        >
          {pct(value)}
        </span>
        <span className="text-[10px] text-stone-500">
          {yenDelta((median * value) / 100)}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-stone-100">
        <div
          className={`h-full rounded-full ${up ? "bg-emerald-500" : "bg-rose-400"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function HedonicFactorTable({
  prefectures,
}: {
  prefectures: PrefectureStats[];
}) {
  const [sort, setSort] = useState<SortKey>("n");

  const rows: Row[] = prefectures.map((p) => ({
    p,
    s: p.hedonic ? scenarioOf(p.hedonic) : null,
  }));
  const modeled = rows.filter(
    (r): r is { p: PrefectureStats; s: Scenario } => r.s !== null,
  );
  const max = Object.fromEntries(
    KEYS.map((k) => [k, Math.max(0, ...modeled.map((r) => Math.abs(r.s[k])))]),
  ) as Record<Key, number>;

  const sorted = [...rows].sort((a, b) =>
    sort === "n" ? b.p.n - a.p.n : magnitude(b.s, sort) - magnitude(a.s, sort),
  );

  /* 要点: 各条件で最も効く県と最も効かない県（掲載の多い県だけを候補に
     すると偏るので、モデルのある全県から選ぶ） */
  const extremes = KEYS.map((k) => {
    const byMag = [...modeled].sort(
      (a, b) => Math.abs(b.s[k]) - Math.abs(a.s[k]),
    );
    return { key: k, most: byMag[0], least: byMag.at(-1) };
  });

  return (
    <div className="space-y-4">
      {modeled.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {extremes.map(({ key, most, least }) =>
            most && least ? (
              <div
                key={key}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-3"
              >
                <p className="text-xs font-bold text-stone-700">
                  {LABEL[key].head}と、家賃は
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-800">
                  いちばん効く<b>{most.p.prefecture}</b>で{" "}
                  <b
                    className={
                      most.s[key] > 0 ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {pct(most.s[key])}
                  </b>
                  <span className="text-xs text-stone-500">
                    （中央値 {man(most.p.rent.median)} の部屋で{" "}
                    {yenDelta((most.p.rent.median * most.s[key]) / 100)}）
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-stone-600">
                  いちばん効かない{least.p.prefecture}は {pct(least.s[key])}
                </p>
              </div>
            ) : null,
          )}
        </div>
      )}

      <div
        role="group"
        aria-label="並べ替え"
        className="flex flex-wrap gap-1.5"
      >
        {SORTS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={sort === o.key}
            onClick={() => setSort(o.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              sort === o.key
                ? "border-stone-800 bg-stone-800 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-stone-600">
              <th className="sticky left-0 bg-white py-1.5 pr-3 font-semibold">
                県
              </th>
              <th className="whitespace-nowrap py-1.5 pr-3 text-right font-semibold">
                家賃中央値
              </th>
              {KEYS.map((k) => (
                <th key={k} className="py-1.5 pr-3 font-semibold">
                  {LABEL[k].head}
                  <span className="block text-[10px] font-normal text-stone-500">
                    （{LABEL[k].sub}）
                  </span>
                </th>
              ))}
              <th
                className="py-1.5 text-right font-semibold"
                title="広さ・築年・駅徒歩の 3 つだけで、家賃のばらつきをどれだけ言い当てられるか（決定係数 R²）"
              >
                当てはまり
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ p, s }) => (
              <tr
                key={p.prefecture}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="sticky left-0 whitespace-nowrap bg-white py-2 pr-3">
                  <span className="font-semibold">{p.prefecture}</span>
                  <span className="block text-[10px] text-stone-500">
                    {count(p.n)}
                  </span>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right font-mono">
                  {man(p.rent.median)}
                </td>
                {s ? (
                  <>
                    {KEYS.map((k) => (
                      <td key={k} className="py-2 pr-3">
                        <EffectCell
                          value={s[k]}
                          median={p.rent.median}
                          max={max[k]}
                        />
                      </td>
                    ))}
                    <td className="py-2 text-right font-mono">
                      {Math.round((p.hedonic?.r2 ?? 0) * 100)}%
                    </td>
                  </>
                ) : (
                  <td colSpan={4} className="py-2 text-right text-stone-600">
                    標本不足
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-stone-500">{NOTE}</p>
    </div>
  );
}

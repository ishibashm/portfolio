"use client";

import { useMemo } from "react";
import type { DayTier } from "@/utils/auspiciousDays";
import { TIER_LABELS } from "@/utils/auspiciousDays";
import { TIER_FILL, BLOCKED_FILL } from "@/utils/tierDisplay";
import {
  bestOutlookMonth,
  monthlyOutlook,
  OPEN_TIERS,
} from "@/utils/monthlyOutlook";
import type { FilterableDay } from "@/lib/timingFilter";

/**
 * 月ごとの見通し。
 *
 * ## Q 値をやめた
 *
 * ここには nbaEngine の Q 値（`actionResult.expectedReward`）が出ていた。
 * 利用者の指摘——「1 月の根拠が他の分析や評価では確認できなかった。
 * サイトでの一貫性のある評価基準がなくどれを信じていいのか分からない」
 * ——を追ったところ、指標の意味と説明文がずれていた。
 *
 * Q 値は「その月の質」ではなく**「その月に取るべき最善手の期待値」**で、
 * 最善手が「撤退」「待機」でも高く出る。実際 3 月は Q=62 で「撤退」、
 * 8 月は Q=41 で「浄化移住」と出ていて、「濃いほど条件が良い月です」
 * という説明と噛み合っていなかった。しかも方位を見ておらず、根拠を
 * 追える画面がサイトのどこにも無かった。
 *
 * **利用者の判断で、サイト共通の段階評価に置き換えた。**
 *
 * ## 数えるだけ。判定しない
 *
 * 段階は親から渡される `days` に入っているものをそのまま読む。数え方は
 * `utils/monthlyOutlook` が持ち、その中身は**カレンダーヒートマップが
 * 1 マスを塗るのに使うのと同じ `dayCategory`**。だから「動ける日が n 日」
 * と「下のカレンダーで緑のマスが n 個」は必ず一致する。
 *
 * API も呼ばない。同じページが既に持っている走査結果を使うので、
 * 上の表・下のカレンダーと数字がずれようがない。
 */

interface Props {
  /** 走査結果。timing ページが持っているものをそのまま受け取る。 */
  days: (FilterableDay & { date: string })[] | null;
  /** いま選んでいる方位。未選択なら null（平として数える）。 */
  direction: string | null;
  /** 見出しに出す方位の名前。 */
  directionLabel: string;
  /** この日以降を見通しとして数える。YYYY-MM-DD。 */
  fromIso: string;
}

/** 「2026-11」→「2026年11月」。年をまたぐので年も出す。 */
function monthLabel(year: number, monthOfYear: number): string {
  return `${year}年${monthOfYear}月`;
}

export function YearlyForecast({
  days,
  direction,
  directionLabel,
  fromIso,
}: Props) {
  const months = useMemo(
    () => monthlyOutlook(days ?? [], direction, fromIso),
    [days, direction, fromIso],
  );
  const best = useMemo(() => bestOutlookMonth(months), [months]);

  if (!days || months.length === 0) return null;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-stone-800">
          月ごとの見通し（{directionLabel}）
        </h2>
        <p className="text-[11px] text-stone-500">
          走査した日を月ごとに数えたものです。下のカレンダーと同じ判定です。
        </p>
      </div>

      {/* 結論を先に置く。数字はすべて下のカレンダーで数え直せる */}
      <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-stone-700">
        {best ? (
          <>
            この範囲で{directionLabel}へ動ける日がいちばん多いのは
            <strong className="mx-1 font-bold">
              {monthLabel(best.year, best.monthOfYear)}
            </strong>
            です（{best.total} 日のうち <strong>{best.open} 日</strong>
            {"。いちばん良い段階は"}
            {best.bestTier ? TIER_LABELS[best.bestTier] : "—"}）。
          </>
        ) : (
          <>
            この範囲に{directionLabel}
            へ動ける日はありません（三盤吉・吉2盤・吉1盤のいずれも 0
            日）。方位を変えるか、走査する期間を延ばしてください。
          </>
        )}
      </p>

      {/* 根拠：月ごとの内訳 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {months.map((m) => {
          const isBest = best?.month === m.month;
          return (
            <div
              key={m.month}
              className={`rounded-xl border p-2.5 ${
                isBest
                  ? "border-emerald-400 bg-emerald-50/40"
                  : "border-stone-200"
              }`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[11px] font-bold text-stone-700">
                  {monthLabel(m.year, m.monthOfYear)}
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-stone-900">
                  {m.open}
                </span>
              </div>

              {/* 段階の内訳。塗りはサイト共通の TIER_FILL */}
              <span
                className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-stone-100"
                aria-hidden
              >
                {(["S", "A", "B", "C", "D", "X"] as DayTier[]).map((t) =>
                  m.counts[t] > 0 ? (
                    <span
                      key={t}
                      style={{
                        backgroundColor: TIER_FILL[t],
                        width: `${(m.counts[t] / m.total) * 100}%`,
                      }}
                    />
                  ) : null,
                )}
                {m.counts.BLOCKED > 0 ? (
                  <span
                    style={{
                      backgroundColor: BLOCKED_FILL,
                      width: `${(m.counts.BLOCKED / m.total) * 100}%`,
                    }}
                  />
                ) : null}
              </span>

              <span className="mt-1.5 block text-[10px] leading-snug text-stone-600">
                {m.total} 日のうち動ける日 {m.open} 日
              </span>
              {m.counts.BLOCKED > 0 && (
                <span className="mt-0.5 block text-[10px] font-bold text-amber-800">
                  天中殺 {m.counts.BLOCKED} 日
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-stone-200 pt-3">
        <li className="max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
          ・「動ける日」は
          {OPEN_TIERS.map((t) => TIER_LABELS[t]).join("・")}
          {
            "の日です。数字は下のカレンダーのマスを数えたものと同じで、月を見てから日を選べます。"
          }
        </li>
        <li className="max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
          ・<strong>天中殺の日は動ける日に入れていません。</strong>
          段階が良くても、日そのものが塞がっているものとして数えています。
        </li>
        <li className="max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
          {
            "・方位ごとに変わります。上の表で方位を選び直すと、この見通しも切り替わります。"
          }
        </li>
      </ul>
    </section>
  );
}

export default YearlyForecast;

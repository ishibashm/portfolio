"use client";

import { useState } from "react";
import type { TodayStarDirections, TodayTimeSlot } from "@/lib/todayDirections";

/**
 * /houi/today の本命星タブ。計算はサーバーで済んでおり、ここは
 * 渡された結果を切り替えて見せるだけ（暦エンジンを import しない）。
 */
export function TodayStarTabs({
  stars,
  slots,
}: {
  stars: TodayStarDirections[];
  slots: TodayTimeSlot[];
}) {
  const [active, setActive] = useState(stars[0]?.star ?? 1);
  const cur = stars.find((s) => s.star === active) ?? stars[0];
  return (
    <div>
      <div role="tablist" aria-label="本命星" className="flex flex-wrap gap-2">
        {stars.map((s) => (
          <button
            key={s.star}
            role="tab"
            type="button"
            aria-selected={s.star === active}
            onClick={() => setActive(s.star)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              s.star === active
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-rose-400"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold text-emerald-900">今日の吉方位</p>
          <p className="mt-1 font-serif text-xl font-bold text-emerald-900">
            {cur.good.length ? cur.good.map((g) => g.jp).join("・") : "なし"}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-bold text-rose-900">今日の凶方位</p>
          <ul className="mt-1 space-y-0.5 text-sm text-rose-900">
            {cur.bad.map((b) => (
              <li key={b.dir}>
                <b className="font-serif">{b.jp}</b>（{b.label}）
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="mt-8 font-serif text-base font-bold">
        {cur.name}の時間帯（2時間ごと）
      </h3>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {slots.map((t) => {
          const ok = t.favorable[cur.star];
          return (
            <li
              key={t.branch + t.start}
              className={`rounded-xl border p-3 text-xs ${
                ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-stone-200 bg-stone-50 text-stone-700"
              }`}
            >
              <span className="font-mono font-bold">
                {t.start}〜{t.end}
              </span>
              <span className="ml-1">{t.branch}</span>
              <span className="mt-1 block">
                {ok ? "◎ 動いてよい" : "ふつう"}（{t.hourStar}）
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

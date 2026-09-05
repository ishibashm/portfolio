"use client";

import { CheckCircle2, Circle } from "lucide-react";
import type { ProfileCompletion } from "@/lib/profileCompletion";

/**
 * 「あとどれが入っていないか」を頁の頭に出す。
 *
 * これまでの入力欄は、埋めた項目と空の項目が同じ見た目で並んでいた。
 * 3 つの囲みを上から読むまで、どこまで済んだのか分からない。よくある
 * 新規登録の頁が最初に出すのはここなので、同じ形にする。
 *
 * 入力の途中でも動く（保存を待たない）。埋めた手応えがその場で返らないと、
 * 何が足りないのかを確かめるために保存を押すことになる。
 *
 * **判定はしない。**値が入っているかを `profileCompletion` に聞いて
 * 並べるだけ。
 */
export function ProfileProgress({
  completion,
}: {
  completion: ProfileCompletion;
}) {
  const { steps, done, total, ready } = completion;

  return (
    <section
      aria-label="登録の進み具合"
      className="rounded-2xl border border-stone-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-stone-800">登録の進み具合</h2>
        <p className="text-[11px] text-stone-500">
          {total} つのうち {done} つが入っています
        </p>
      </div>

      {/* 棒は「あと少し」を伝えるためだけのもの。数字は上に出してある */}
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100"
        aria-hidden
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            ready ? "bg-emerald-500" : "bg-indigo-500"
          }`}
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2.5">
            {step.done ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden
              />
            ) : (
              <Circle
                className="mt-0.5 h-4 w-4 shrink-0 text-stone-300"
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-stone-800">
                {step.label}
                {step.required ? (
                  <span className="ml-2 text-[10px] font-normal text-rose-600">
                    必須
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] font-normal text-stone-400">
                    任意
                  </span>
                )}
                <span className="sr-only">
                  {step.done ? "（入力済み）" : "（未入力）"}
                </span>
              </p>
              {/* 埋まっているものに「無いと何ができないか」を出しても
                  読む理由が無い。空のものにだけ添える */}
              {!step.done && (
                <p className="mt-0.5 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
                  {step.need}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p
        className={`mt-4 rounded-xl border p-3 text-[11px] leading-relaxed ${
          ready
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {ready
          ? "方位の判定・引越しの試算・物件検索が使えます。下の「保存する」を押すと、この内容で残ります。"
          : "生年月日といま住んでいる場所がそろうと、方位の判定が動きます。"}
      </p>
    </section>
  );
}

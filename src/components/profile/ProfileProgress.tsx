"use client";

import { CheckCircle2, Circle } from "lucide-react";
import type { ProfileCompletion } from "@/lib/profileCompletion";
import { usePlaceName } from "@/lib/placeLabel";
import type { ProfileStep } from "@/lib/profileCompletion";

/**
 * 場所の段は座標ではなく地名で出す（利用者の指摘、2026-09-12）。端末の
 * 地名 → 最寄りの市区町村「付近」→ 座標 の順（lib/placeLabel）。
 */
function PlaceValue({ place }: { place: NonNullable<ProfileStep["place"]> }) {
  return <>{usePlaceName(place.lat, place.lon, place.label)}</>;
}

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
      className="rounded-2xl border border-theme-border bg-theme-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">登録の進み具合</h2>
        <p className="text-xs text-ink-muted">
          {total} つのうち {done} つが入っています
        </p>
      </div>

      {/* 棒は「あと少し」を伝えるためだけのもの。数字は上に出してある */}
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-theme-subtle"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2.5">
            {step.done ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                aria-hidden
              />
            ) : (
              <Circle
                className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted"
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">
                {step.label}
                {step.required ? (
                  <span className="ml-2 text-[10px] font-normal text-theme-gold">
                    必須
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] font-normal text-ink-muted">
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
                <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-ink-muted">
                  {step.need}
                </p>
              )}
              {/* 埋まっているものには**入っている値**を出す。✓ だけだと
                  「何を登録したか」は入力欄を開くまで分からない。座標は
                  桁が多いので等幅で出す（数字の位が縦にそろう） */}
              {step.done && step.value && (
                <p className="mt-0.5 font-mono text-xs leading-relaxed break-all text-ink-muted">
                  {step.place ? <PlaceValue place={step.place} /> : step.value}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p
        className={`mt-4 rounded-xl border p-3 text-[11px] leading-relaxed ${
          ready
            ? "border-theme-border bg-theme-accent-soft text-ink"
            : "border-theme-border bg-theme-gold-soft text-theme-gold"
        }`}
      >
        {ready
          ? "方位の判定・引越しの試算・街探しが使えます。下の「保存する」を押すと、この内容で残ります。"
          : "生年月日といま住んでいる場所がそろうと、方位の判定が動きます。"}
      </p>
    </section>
  );
}

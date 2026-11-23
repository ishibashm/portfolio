"use client";

/**
 * お気に入りの日取りの一覧（/calendar）。
 *
 * 置き場は端末の localStorage だけ（lib/favoriteDays の註）。React の外に
 * あるので useSyncExternalStore で読む。サーバーでは空として描き、
 * 水和のあとに端末の値に替わる（ずれは React が面倒を見る）。
 */

import React, { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Star, X } from "lucide-react";
import {
  favoriteDayKey,
  favoriteDaysSnapshot,
  parseFavoriteDays,
  removeFavoriteDay,
  subscribeFavoriteDays,
  syncFavoriteDays,
} from "@/lib/favoriteDays";
import { saveWorkingDate } from "@/lib/workingDate";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** YYYY-MM-DD の曜日。暦日そのものなので時差を挟まずに UTC で数える */
function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "";
}

export function FavoriteDaysPanel() {
  const raw = useSyncExternalStore(
    subscribeFavoriteDays,
    favoriteDaysSnapshot,
    () => "",
  );
  const favorites = parseFavoriteDays(raw);
  /* ログイン中ならアカウントと揃える。結果は localStorage に書かれ、
     上の購読で描き直される（ここで setState はしない） */
  useEffect(() => {
    void syncFavoriteDays();
  }, []);

  return (
    <section
      aria-labelledby="favorite-days-heading"
      className="mb-10 rounded-3xl border border-theme-border bg-theme-surface p-6 md:p-8 shadow-lg shadow-[color:var(--wg-shadow)]"
    >
      <h2
        id="favorite-days-heading"
        className="flex items-center gap-2 text-lg font-bold font-serif"
      >
        <Star className="h-5 w-5 text-theme-gold" aria-hidden="true" />
        お気に入りの日取り
        {favorites.length > 0 && (
          <span className="text-sm font-normal text-ink-muted">
            （{favorites.length} 件）
          </span>
        )}
      </h2>
      {favorites.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted leading-relaxed">
          上の日取りの表で日付の横の ☆ を押すと、ここに残ります。
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-[70ch] text-xs text-ink-muted leading-relaxed">
            保存したときの判定です。生年月日や出発地を変えた場合は、上で出し直して確かめてください。この端末に保存し、ログインしていればアカウントにも保存します（ほかの端末でも見られます。「登録した内容をすべて消す」で両方から消えます）。
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {favorites.map((f) => (
              <li
                key={favoriteDayKey(f.date, f.direction)}
                className={`rounded-2xl border p-4 text-sm ${
                  f.blockedByTenchusatsu
                    ? "border-theme-border bg-theme-gold-soft"
                    : "border-theme-border bg-theme-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold text-ink">
                      {f.date}
                      <span className="text-ink-muted">
                        （{weekdayOf(f.date)}）
                      </span>
                    </div>
                    <div className="mt-0.5 font-bold text-accent">
                      {f.directionLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFavoriteDay(f.date, f.direction)}
                    aria-label={`${f.date} ${f.directionLabel} をお気に入りから外す`}
                    className="rounded-lg p-1.5 text-ink-muted hover:bg-theme-accent-soft hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  年盤 {f.yearLabel} ／ 月盤 {f.monthLabel} ／ 日盤 {f.dayLabel}
                </p>
                {f.tags.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {f.tags.map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded bg-theme-gold-soft text-theme-gold text-[11px] font-semibold"
                      >
                        {t}
                      </span>
                    ))}
                  </p>
                )}
                {f.blockedByTenchusatsu && (
                  <p className="mt-1 text-xs font-semibold text-theme-gold">
                    天中殺で移動を避ける日
                  </p>
                )}
                <Link
                  href={`/relocation/arbitrage?${new URLSearchParams({
                    targetDate: f.date,
                    direction: f.direction,
                  }).toString()}`}
                  prefetch={false}
                  onClick={() => saveWorkingDate(f.date)}
                  className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-theme-border bg-theme-accent-soft text-xs text-accent font-semibold hover:border-accent"
                >
                  この条件で探す
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

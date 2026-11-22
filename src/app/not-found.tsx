import Link from "next/link";
import type { Metadata } from "next";
import GuideCharacter from "@/components/guide/GuideCharacter";

/**
 * 見つからない頁。
 *
 * ルートの layout は canonical: "/" と index を持つ。何も書かないと
 * 404 がホームを正典と名乗り、Next が付ける noindex と index が混ざる。
 * canonical は出さず、noindex だけにする。
 */
export const metadata: Metadata = {
  title: "ページが見つかりません",
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-theme-accent-soft via-stone-50 dark:via-theme-subtle to-amber-50 dark:to-theme-gold-soft px-4 py-16 text-stone-800 dark:text-ink">
      <section className="w-full max-w-xl rounded-3xl border border-white/80 dark:border-theme-border bg-white/80 dark:bg-theme-surface p-8 text-center shadow-xl shadow-accent/12 dark:shadow-black/20 backdrop-blur-xl sm:p-12">
        <p className="font-mono text-sm font-bold tracking-[0.35em] text-accent">
          404
        </p>
        <h1 className="mt-4 font-serif text-3xl font-bold text-stone-900 dark:text-ink">
          ページが見つかりません
        </h1>
        <p className="mt-3 text-sm leading-7 text-stone-600 dark:text-ink-muted">
          URLが変更されたか、ページが削除された可能性があります。
        </p>
        {/* 行き止まりに案内役を置き、次の行き先を示す（docs/guide-character.md）。 */}
        <GuideCharacter pose="magnifier" size="md" float className="mt-6">
          おや、この方角には道がないようです。ホームか使い方ガイドへご案内します。
        </GuideCharacter>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="rounded-full bg-stone-900 dark:bg-slate-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-stone-700 dark:hover:bg-slate-700"
          >
            ホームへ戻る
          </Link>
          <Link
            href="/guide"
            className="rounded-full border border-stone-300 dark:border-theme-border bg-white dark:bg-theme-surface px-6 py-3 text-sm font-bold text-stone-700 dark:text-ink transition hover:bg-stone-50 dark:hover:bg-theme-subtle"
          >
            使い方を見る
          </Link>
        </div>
      </section>
    </main>
  );
}

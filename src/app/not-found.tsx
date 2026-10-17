import Link from "next/link";
import GuideCharacter from "@/components/guide/GuideCharacter";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 via-stone-50 to-amber-50 px-4 py-16 text-stone-800">
      <section className="w-full max-w-xl rounded-3xl border border-white/80 bg-white/80 p-8 text-center shadow-xl shadow-rose-100/50 backdrop-blur-xl sm:p-12">
        <p className="font-mono text-sm font-bold tracking-[0.35em] text-rose-500">
          404
        </p>
        <h1 className="mt-4 font-serif text-3xl font-bold text-stone-900">
          ページが見つかりません
        </h1>
        <p className="mt-3 text-sm leading-7 text-stone-600">
          URLが変更されたか、ページが削除された可能性があります。
        </p>
        {/* 行き止まりに案内役を置き、次の行き先を示す（docs/guide-character.md）。 */}
        <GuideCharacter pose="magnifier" size="md" float className="mt-6">
          おや、この方角には道がないようです。ホームか使い方ガイドへご案内します。
        </GuideCharacter>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="rounded-full bg-stone-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-stone-700"
          >
            ホームへ戻る
          </Link>
          <Link
            href="/guide"
            className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
          >
            使い方を見る
          </Link>
        </div>
      </section>
    </main>
  );
}

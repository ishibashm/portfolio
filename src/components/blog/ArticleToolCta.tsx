import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { toolsForArticle } from "@/lib/articleTools";

/**
 * 記事の末尾に置く、道具への導線。
 *
 * 記事は一般論までしか言えない。「自分の場合はどうか」は生年月日と
 * 出発地を入れた道具でしか出ないので、読み終えた場所に入口を置く
 * （どの道具を出すかは lib/articleTools）。
 *
 * 生年月日と出発地は「使用中のプロフィール」1 つに決まっていて、
 * どの道具も同じ値を読む（/about）。記事から飛んだ先で改めて入力し
 * 直す必要は無いので、「同じ条件で」と言える。
 */
export function ArticleToolCta({ tags }: { tags: readonly string[] }) {
  const tools = toolsForArticle(tags);

  return (
    <section
      aria-labelledby="article-tool-cta"
      className="mt-12 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 md:p-6"
    >
      <h2
        id="article-tool-cta"
        className="font-serif text-base font-bold text-slate-900"
      >
        自分の場合はどうかを、同じ基準で確かめる
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-700 max-w-[70ch]">
        この記事で説明している判定は、サイト内の道具と同じ計算で出しています。生年月日と今住んでいる場所を一度入れれば、どの道具も同じ設定を読みます。
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="group block h-full rounded-xl border border-slate-300 bg-white p-4 transition-colors hover:border-rose-400"
            >
              <span className="flex items-center gap-2 font-serif text-sm font-bold text-slate-900">
                {t.label}
                <ArrowRight className="h-4 w-4 text-rose-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-slate-600">
                {t.summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        判定の考え方と出典、何を保証していないかは
        <Link href="/about" className="underline hover:text-rose-600">
          このサイトについて
        </Link>
        に書いています。
      </p>
    </section>
  );
}

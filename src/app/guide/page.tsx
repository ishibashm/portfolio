import Link from "next/link";
import type { Metadata } from "next";
import { ArticleJsonLd } from "@/components/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import { GUIDE_INDEX, GUIDE_PAGES } from "@/lib/guideContent";
import { SITE_NAME } from "@/lib/siteStructure";

/**
 * 使い方ガイドの入口。
 *
 * 5つの道具がどういう順で効いてくるのかが分からないまま物件検索に来ると、
 * 出発地も生年月日も入っていない状態で「何も出ない」で終わる。
 * 決める順序を最初に見せて、各章へ振り分ける。
 */

export const metadata: Metadata = {
  title: GUIDE_INDEX.title,
  description: GUIDE_INDEX.description,
  alternates: { canonical: "/guide" },
  openGraph: {
      images: ["/ogp.png"],
    title: `${GUIDE_INDEX.title} | ${SITE_NAME}`,
    description: GUIDE_INDEX.description,
    url: "https://cloud-palette.com/guide",
    type: "article",
  },
};

/** 決める順序。ガイドの章と、実際に触る画面を並べて出す。 */
const FLOW = [
  {
    slug: "honmei",
    step: "自分を知る",
    body: "生まれ年から本命星を引き、その年に良い方位・避ける方位を確認します。",
    target: { href: "/houi", label: "本命星と吉方位を調べる" },
  },
  {
    slug: "choose-date",
    step: "時期を決める",
    body: "年・月・日のすべてが吉になる日を出します。動ける日が先に決まると、探す範囲が絞れます。",
    target: { href: "/calendar", label: "引越しの日取りを選ぶ" },
  },
  {
    slug: "compare-areas",
    step: "地域を絞る",
    body: "方位が良い地域のなかから、所得や地価も見て住む場所の候補を選びます。",
    target: { href: "/relocation/wealth", label: "移住先の地域を比べる" },
  },
  {
    slug: "simulate",
    step: "移動を検証する",
    body: "候補地への移動が、方位とタイミングの面で成り立つかを試算します。",
    target: { href: "/relocation/simulator", label: "引越し先を試算する" },
  },
  {
    slug: "find-property",
    step: "物件を探す",
    body: "決まった日付と方位で、相場より割安な賃貸物件を絞り込みます。",
    target: { href: "/relocation/arbitrage", label: "物件を方位で探す" },
  },
] as const;

const SIDE_PAGES = ["basics", "glossary"] as const;

export default function Page() {
  const byslug = new Map(GUIDE_PAGES.map((p) => [p.slug, p]));

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <ArticleJsonLd
        headline={GUIDE_INDEX.title}
        description={GUIDE_INDEX.description}
        path="/guide"
        keywords={["使い方", "マニュアル", "引越し", "吉方位", "九星気学"]}
      />

      <article className="max-w-[820px] mx-auto px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {GUIDE_INDEX.title}
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          {GUIDE_INDEX.lead}
        </p>

        {/* 決める順序。番号は「この順に決めると手戻りが少ない」という
            実体があるので付けている。 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            決めていく順番
          </h2>

          <ol className="mt-6 relative">
            {/* 縦の導線。番号の丸の中心（left-4）に合わせる */}
            <span
              aria-hidden="true"
              className="absolute left-4 top-3 bottom-3 w-px bg-slate-300"
            />
            {FLOW.map((f, i) => {
              const page = byslug.get(f.slug);
              return (
                <li key={f.slug} className="relative pl-14 pb-7 last:pb-0">
                  <span className="absolute left-0 top-0 w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-bold font-mono flex items-center justify-center ring-4 ring-[#f7f2ec]">
                    {i + 1}
                  </span>
                  <div className="rounded-2xl border border-slate-300 bg-white/90 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[11px] font-bold text-rose-600 tracking-wide">
                        {f.step}
                      </span>
                      <h3 className="text-base font-bold font-serif">
                        {page?.nav}
                      </h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      {f.body}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/guide/${f.slug}`}
                        className="px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold transition-colors"
                      >
                        使い方を読む
                      </Link>
                      <Link
                        href={f.target.href}
                        className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-[11px] font-semibold hover:border-rose-400 transition-colors"
                      >
                        {f.target.label}を開く
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            そのほかのページ
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SIDE_PAGES.map((slug) => {
              const page = byslug.get(slug);
              if (!page) return null;
              return (
                <Link
                  key={slug}
                  href={`/guide/${slug}`}
                  className="group rounded-2xl border border-slate-300 bg-white/90 p-4 hover:border-rose-300 transition-colors"
                >
                  <h3 className="text-sm font-bold font-serif group-hover:text-rose-600 transition-colors">
                    {page.nav}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {page.lead}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-300 bg-amber-50/80 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            はじめてお使いの方へ
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">
            ログインは不要です。ただし、
            <b>今住んでいる場所</b>と<b>生年月日</b>
            を入れないと方位が決まりません。
            どの画面から始める場合も、まずこの2つを入力してください。
          </p>
          <Link
            href="/guide/basics"
            className="mt-4 inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            画面共通の使い方を読む →
          </Link>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-slate-500">
          九星気学や六曜は暦の考え方であり、科学的に効果が確認されたものではありません。
          住まい選びの判断材料のひとつとしてお使いください。
        </p>
      </article>
    </div>
  );
}

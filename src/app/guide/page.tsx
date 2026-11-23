import Link from "next/link";
import type { Metadata } from "next";
import { ArticleJsonLd } from "@/components/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import { GUIDE_INDEX, GUIDE_PAGES } from "@/lib/guideContent";
import { coreRouteLabel } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";

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
  openGraph: pageOpenGraph(
    "/guide",
    GUIDE_INDEX.title,
    GUIDE_INDEX.description,
    {
      type: "article",
    },
  ),
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
    step: "街を探す",
    body: "決まった日付に開いている方位の街を、家賃の水準と空き家率つきで並べます。",
    target: {
      href: "/relocation/arbitrage",
      label: coreRouteLabel("/relocation/arbitrage") ?? "",
    },
  },
] as const;

const SIDE_PAGES = ["basics", "glossary"] as const;

export default function Page() {
  const byslug = new Map(GUIDE_PAGES.map((p) => [p.slug, p]));

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      <ArticleJsonLd
        headline={GUIDE_INDEX.title}
        description={GUIDE_INDEX.description}
        path="/guide"
        keywords={["使い方", "マニュアル", "引越し", "吉方位", "九星気学"]}
      />

      {/* ここは読み物ではなく**札の索引**。本文が長いのはリード文だけで、
          あとは手順の札とリンクなので、記事と同じ 820px で止める理由が無い。
          道具の頁と同じ 1700px にして、下の <ol> を広い画面で 2 列にする。
          記事側（/guide/[slug]）は本文が長いので 820px のまま。
          行長はこの器ではなく、下のリード文の max-w-[70ch] で守る。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {GUIDE_INDEX.title}
        </h1>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-ink">
          {GUIDE_INDEX.lead}
        </p>

        {/* 決める順序。番号は「この順に決めると手戻りが少ない」という
            実体があるので付けている。 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold font-serif border-b border-theme-border pb-2">
            決めていく順番
          </h2>

          {/* 広い画面では 2 列にする。1 列のまま器だけ広げると、説明が
              1 行しかない札が 1600px に伸びるだけで、幅が何にもならない。
              2 列なら 1 枚の幅は今までとほぼ同じまま、5 手順が一度に見える。 */}
          <ol className="mt-6 relative xl:grid xl:grid-cols-2 xl:gap-x-8">
            {/* 縦の導線。番号の丸の中心（left-4）に合わせる。
                2 列に折り返すと札の並びと導線がつながらないので、そこでは消す。 */}
            <span
              aria-hidden="true"
              className="absolute left-4 top-3 bottom-3 w-px bg-theme-border xl:hidden"
            />
            {FLOW.map((f, i) => {
              const page = byslug.get(f.slug);
              return (
                <li
                  key={f.slug}
                  className="motion-reveal relative pl-14 pb-7 last:pb-0"
                  style={{ ["--i" as string]: i % 2 }}
                >
                  <span className="absolute left-0 top-0 w-8 h-8 rounded-full bg-accent text-on-accent text-xs font-bold font-mono flex items-center justify-center ring-4 ring-background">
                    {i + 1}
                  </span>
                  <div className="rounded-2xl border border-theme-border bg-theme-surface p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[11px] font-bold text-accent tracking-wide">
                        {f.step}
                      </span>
                      <h3 className="text-base font-bold font-serif">
                        {page?.nav}
                      </h3>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                      {f.body}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/guide/${f.slug}`}
                        className="px-3 py-1.5 rounded-full bg-accent hover:brightness-110 text-on-accent text-[11px] font-bold"
                      >
                        使い方を読む
                      </Link>
                      <Link
                        href={f.target.href}
                        className="px-3 py-1.5 rounded-full border border-theme-border bg-theme-surface text-[11px] font-semibold hover:border-accent"
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
          <h2 className="text-xl font-bold font-serif border-b border-theme-border pb-2">
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
                  className="group rounded-2xl border border-theme-border bg-theme-surface p-4 hover:border-accent"
                >
                  <h3 className="text-sm font-bold font-serif group-hover:text-accent">
                    {page.nav}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    {page.lead}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-theme-border bg-theme-gold-soft p-5">
          <h2 className="text-sm font-bold text-theme-gold">
            はじめてお使いの方へ
          </h2>
          <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-ink">
            ログインは不要です。ただし、
            <b>今住んでいる場所</b>と<b>生年月日</b>
            を入れないと方位が決まりません。どの画面から始める場合も、まずこの2つを入力してください。
          </p>
          <Link
            href="/guide/basics"
            className="mt-4 inline-flex px-5 py-2.5 rounded-full bg-accent hover:brightness-110 text-on-accent font-bold text-xs"
          >
            画面共通の使い方を読む →
          </Link>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold font-serif border-b border-theme-border pb-2">
            地域の解説と記事
          </h2>
          <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-ink">
            道具の使い方とは別に、出発地の街や県の解説、用語の背景を読む頁があります。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link
              href="/houi/area"
              className="group rounded-2xl border border-theme-border bg-theme-surface p-4 hover:border-accent"
            >
              <h3 className="text-sm font-bold font-serif group-hover:text-accent">
                エリア別の方位と家賃相場
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                いま住んでいる市区町村から、八方位の街と公表統計の家賃水準を見ます。
              </p>
            </Link>
            <Link
              href="/houi/pref"
              className="group rounded-2xl border border-theme-border bg-theme-surface p-4 hover:border-accent"
            >
              <h3 className="text-sm font-bold font-serif group-hover:text-accent">
                都道府県のまとめ
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                47都道府県の頁へ進み、県の重心から見た方位と相場の傾きを比べます。
              </p>
            </Link>
            <Link
              href="/blog"
              className="group rounded-2xl border border-theme-border bg-theme-surface p-4 hover:border-accent"
            >
              <h3 className="text-sm font-bold font-serif group-hover:text-accent">
                記事
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                九星気学・方位・天中殺・日取りの考え方を、操作せずに読めます。
              </p>
            </Link>
            <Link
              href="/editorial"
              className="group rounded-2xl border border-theme-border bg-theme-surface p-4 hover:border-accent"
            >
              <h3 className="text-sm font-bold font-serif group-hover:text-accent">
                編集方針
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                出典、索引に載せる範囲、広告の扱い、訂正の窓口をまとめています。
              </p>
            </Link>
          </div>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <p className="mt-8 max-w-[70ch] text-xs leading-relaxed text-ink-muted">
          九星気学や六曜は暦の考え方であり、科学的に効果が確認されたものではありません。住まい選びの判断材料のひとつとしてお使いください。
        </p>
      </article>
    </div>
  );
}

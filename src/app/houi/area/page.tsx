import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import type { Metadata } from "next";
import { areasByPref } from "@/lib/areaContent";
import { PREF_REGION, prefCodeByName } from "@/lib/prefContent";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { AdBanner } from "@/components/ads/AdBanner";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import {
  AreaQuickFind,
  type QuickFindArea,
} from "@/components/houi/AreaQuickFind";
import { pageOpenGraph } from "@/lib/siteUrl";

const TITLE = "エリア別の方位と家賃相場";
const DESCRIPTION =
  "出発地の市区町村を選ぶと、八方位それぞれにどの市区町村があり、家賃相場がいくらかを確認できます。吉方位が分かっても、その方位に何があるか分からないと引越し先は決められません。";

export const metadata: Metadata = {
  alternates: { canonical: "/houi/area" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/houi/area", TITLE, DESCRIPTION),
};

export default function Page() {
  // 県ごとにまとめる。掲載数の多い順だと県が入り混じって探しにくい。
  /*
    県の並びは JIS の県番号順（北から南）にする（2026-09-30）。以前は
    データの並び（掲載の多い市区町村を持つ県から）のままで、静岡県が
    先頭、北海道がずっと下にあった。自分の県を探すにはスクロールする
    しかない（利用者の指摘「自分の居住都道府県を探すの大変」）。
  */
  const prefs = [...areasByPref().entries()]
    .map(([pref, list]) => ({ pref, code: prefCodeByName(pref) ?? "99", list }))
    .sort((a, b) => a.code.localeCompare(b.code));
  /* 地方ごとの目次。地方の並びも県番号の順に最初に出た順 */
  const regions = new Map<string, typeof prefs>();
  for (const p of prefs) {
    const region = PREF_REGION[p.code] ?? "その他";
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region)!.push(p);
  }
  /* 検索と近道の部品に渡す最小の形（コード・県・表示名・代表点）。
     代表点は近道の「いちばん近い」を選ぶだけなので小数 3 桁（約 100m）に
     丸めて HTML を軽くする */
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const quick: QuickFindArea[] = prefs.flatMap((p) =>
    p.list.map(
      (a): QuickFindArea => [
        a.code,
        p.code,
        `${p.pref}${a.city}`,
        r3(a.lat),
        r3(a.lon),
      ],
    ),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      {/* 市区町村ページ・県ページの両方にパンくずがあるのに、その親の
          この頁だけ構造化データが無かった（画面のパンくずはあった）。 */}
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: "エリア別", path: "/houi/area" },
        ]}
      />
      {/* 都道府県ごとのリンク一覧。読み物ではないので /houi と揃える。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <span>エリア別</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          エリア別の方位と家賃相場
        </h1>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          吉方位が分かっても、その方位に実際どんな街があっていくらなのかが分からないと引越し先は決められません。
          <b>いま住んでいる市区町村</b>を選ぶと、そこから見た八方位それぞれのエリアと家賃相場を確認できます。
        </p>
        {/* 固有の文章を書いた頁だけ索引に載せている（#750〜）。一覧では
            どれがそれか分からず、全部同じ札に見えていた。読み手にとっては
            「その方位に街が無い」まで書いてある頁のほうが役に立つ。 */}
        <p className="mt-3 text-xs text-slate-500">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />
          が付いている市区町村には、方位ごとの街の並びを書いた解説があります（
          {Object.keys(AREA_EDITORIAL).length}
          エリア）。
        </p>

        <AreaQuickFind areas={quick} />

        {/* 県の目次。JS が無くても効くよう、頁内の飛び先へのリンクにする */}
        <nav
          aria-label="都道府県の目次"
          className="mt-6 rounded-2xl border border-slate-300 bg-white/80 p-4"
        >
          <p className="text-xs font-bold text-slate-600">都道府県から探す</p>
          <dl className="mt-2 space-y-1.5">
            {[...regions.entries()].map(([region, list]) => (
              <div
                key={region}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              >
                <dt className="w-24 shrink-0 text-xs text-slate-500">
                  {region}
                </dt>
                <dd className="flex flex-wrap gap-x-3 gap-y-1">
                  {list.map((p) => (
                    <a
                      key={p.code}
                      href={`#pref-${p.code}`}
                      className="text-sm font-semibold text-slate-800 underline decoration-slate-300 hover:text-rose-600"
                    >
                      {p.pref}
                    </a>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </nav>

        <div className="mt-8 space-y-6">
          {prefs.map(({ pref, code, list }) => {
            /* 県のまとめ頁（/houi/pref）は固有文章を書いた県だけ公開
               している。公開済みの県は見出しから直接入れるようにする。 */
            const hasPrefPage = code in PREF_EDITORIAL;
            return (
              <section key={pref} id={`pref-${code}`} className="scroll-mt-20">
                <h2 className="text-base font-bold font-serif border-b border-slate-300 pb-2">
                  {pref}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {list.length}エリア
                  </span>
                  {hasPrefPage && (
                    <Link
                      prefetch={false}
                      href={`/houi/pref/${code}`}
                      className="ml-3 text-xs font-bold text-rose-600 hover:underline"
                    >
                      {pref}の相場と方位のまとめ →
                    </Link>
                  )}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {list.map((a) => (
                    <Link
                      prefetch={false}
                      key={a.code}
                      href={`/houi/area/${a.code}`}
                      className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                    >
                      {a.code in AREA_EDITORIAL && (
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />
                      )}
                      {a.city}
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-10">
          <AdBanner />
        </div>

        <ContentDisclaimer />
      </article>
    </div>
  );
}

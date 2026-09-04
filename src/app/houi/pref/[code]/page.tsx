import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { LocalNewsPanel } from "@/components/news/LocalNewsPanel";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  DatasetJsonLd,
} from "@/components/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import {
  getPrefStats,
  prefNameByCode,
  PREF_REGION,
  regionSiblings,
} from "@/lib/prefContent";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";
import { metaDescriptionFromIntro } from "@/lib/editorialMeta";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";

/**
 * 市区町村への 1 行。**解説を書いた頁に印を付ける。**
 *
 * この頁からは県内の全市区町村へ同じ札で並べていたが、そのうち
 * 固有の文章を書いて索引に戻したのは一部（src/lib/areaEditorial.ts）で、
 * 残りは雛形のままの noindex。読み手には「方位ごとに何があるか」まで
 * 書いてある頁のほうが役に立つのに、どれがそれか見分けが付かなかった。
 *
 * 一覧ページ（/houi/area）は同じ印を先に付けてある。**同じ意味の印を
 * 2 通りの見た目にしない**ため、丸の大きさと色をそちらに合わせる。
 */
function AreaLink({
  code,
  city,
  medianRent,
}: {
  code: string;
  city: string;
  medianRent: number;
}) {
  return (
    <li className="flex justify-between gap-2">
      <Link
        prefetch={false}
        href={`/houi/area/${code}`}
        className="text-slate-700 hover:text-rose-600 hover:underline"
      >
        {code in AREA_EDITORIAL && (
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />
        )}
        {city}
      </Link>
      <span className="font-mono text-slate-600">
        {medianRent.toLocaleString()}円
      </span>
    </li>
  );
}

/**
 * 都道府県の家賃相場×方位ページ。
 *
 * 市区町村ページ（/houi/area/[code]）は 1,022 頁の同一雛形で索引から
 * 外した（noindex。#379）。こちらはその上位階層で、**固有の文章を書いた
 * 県だけを公開する**（generateStaticParams が prefEditorial の表から
 * 生成する。全県の機械生成はしない）。
 *
 * Search Console の実測（2026-08-27）で、表示の付くクエリのほぼ全部が
 * 「地名 家賃相場」で、クリックが付いた頁の半分が noindex にした
 * 市区町村頁だった。需要の受け皿を 1 ページ 1 記事の品質でこちらに作る。
 *
 * 数値は areaDirections.json（毎晩再生成）からその場で集計する。
 * 文章（prefEditorial）には変わりうる数字を書かない決め事。
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  return Object.keys(PREF_EDITORIAL).map((code) => ({ code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const pref = prefNameByCode(code);
  if (!pref || !PREF_EDITORIAL[code]) return {};
  const title = `${pref}の家賃相場と方位別の市区町村`;
  const description = metaDescriptionFromIntro(
    PREF_EDITORIAL[code]?.intro,
    `${pref}の市区町村ごとの家賃相場（実際の掲載から毎晩集計）と、県の中心から見た八方位ごとの市区町村を一覧にしました。吉方位から引越し先を選ぶときの比較に。`,
  );
  return {
    title,
    description,
    alternates: { canonical: `/houi/pref/${code}` },
    openGraph: { images: ["/ogp.png"], title, description, type: "article" },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const pref = prefNameByCode(code);
  const editorial = PREF_EDITORIAL[code];
  if (!pref || !editorial) notFound();
  const stats = getPrefStats(pref);
  if (!stats) notFound();
  /* 同じ地方で、固有文章を書いて公開している県だけ並べる */
  const siblings = regionSiblings(code).filter((s) => PREF_EDITORIAL[s.code]);

  const cheapest = stats.municipalities.slice(0, 5);
  const priciest = stats.municipalities.slice(-5).reverse();
  const path = `/houi/pref/${code}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <ArticleJsonLd
        headline={`${pref}の家賃相場と方位別の市区町村`}
        description={`${pref}の市区町村ごとの家賃相場と、県の中心から見た八方位ごとの市区町村の一覧。`}
        path={path}
        keywords={[pref, "家賃相場", "方位", "引越し"]}
      />
      <DatasetJsonLd
        name={`${pref}の市区町村別家賃相場`}
        description={`${pref}の市区町村ごとに、掲載中の賃貸物件から集計した家賃（管理費込み）の中央値と専有面積あたりの単価をまとめたデータ。県の面積重心から見た八方位の区分つき。`}
        path={path}
        dateModified={stats.asOf ?? new Date().toISOString().slice(0, 10)}
      />
      {/* 市区町村ページ（/houi/area/[code]）と同じ並びにする。
          方位の早見表 → エリア別 → 県 → 市区町村 で 1 本に繋がる。 */}
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: "エリア別", path: "/houi/area" },
          { name: pref, path },
        ]}
      />
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <Link href="/houi/area" className="hover:text-rose-600">
            エリア別
          </Link>
          <span className="mx-2">/</span>
          <span>{pref}</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {pref}の家賃相場と方位別の市区町村
        </h1>

        {editorial.intro.map((p, i) => (
          <p
            key={i}
            className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700"
          >
            {p}
          </p>
        ))}

        <section className="mt-8 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-sm font-bold">
            {pref}の相場のいま（掲載 {stats.totalCount.toLocaleString()}{" "}
            件から集計）
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-slate-700">
            データのある市区町村は {stats.municipalities.length}{" "}
            。家賃（管理費込み）の中央値は市区町村ごとに{" "}
            <b>
              {stats.municipalities[0].medianRent.toLocaleString()}円〜
              {stats.municipalities[
                stats.municipalities.length - 1
              ].medianRent.toLocaleString()}
              円
            </b>
            の幅があり、県全体の真ん中は{" "}
            <b>{stats.medianOfMedians.toLocaleString()}円</b>です。
            {stats.asOf ? `（${stats.asOf} 時点）` : null}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold text-slate-600">
                安い側の 5 市区町村
              </h3>
              <ul className="mt-2 space-y-1 text-xs">
                {cheapest.map((a) => (
                  <AreaLink
                    key={a.code}
                    code={a.code}
                    city={a.city}
                    medianRent={a.medianRent}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-600">
                高い側の 5 市区町村
              </h3>
              <ul className="mt-2 space-y-1 text-xs">
                {priciest.map((a) => (
                  <AreaLink
                    key={a.code}
                    code={a.code}
                    city={a.city}
                    medianRent={a.medianRent}
                  />
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            八方位ごとの市区町村と相場
          </h2>
          <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-slate-600">
            方位は{pref}の<b>面積重心</b>
            を基準にした真北基準・伝統区分（東西南北 30 度・四隅 60
            度）です。広い県では県内でも方位が変わるため、実際の引越しでは
            <b>いま住んでいる場所</b>
            から見た方位で判定してください（各市区町村のページと方位スキャナーがその計算をします）。
          </p>
          {/* 印の意味。印だけ付けて説明が無いと、色の違いが相場の
              高低や吉凶と読まれかねない。/houi/area の説明と同じ文言。 */}
          <p className="mt-2 text-xs text-slate-500">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />
            が付いている市区町村には、方位ごとの街の並びを書いた解説があります。
          </p>
          {stats.emptyDirections.length > 0 && (
            <p className="mt-4 max-w-[70ch] rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-900">
              <b>
                掲載のある市区町村が入らない方位:{" "}
                {stats.emptyDirections
                  .map((d) => DIRECTION_LABELS[d])
                  .join("・")}
              </b>
              。この一覧は<b>掲載を集計できている市区町村だけ</b>
              を並べています。県がその方位に伸びていない場合もあれば、巡回がまだ届いていないだけの場合もあります。
              <b>「その方位に街が無い」とは限りません。</b>
              吉方位がこの方位に出た年は、隣の県も含めて探してください。
            </p>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.byDirection.map((g) => (
              <div
                key={g.dir}
                className="rounded-2xl border border-slate-300 bg-white/90 p-4"
              >
                <h3 className="font-serif text-base font-bold">{g.jp}</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {g.areas.slice(0, 8).map((a) => (
                    <AreaLink
                      key={a.code}
                      code={a.code}
                      city={a.city}
                      medianRent={a.medianRent}
                    />
                  ))}
                </ul>
                {g.areas.length > 8 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-[11px] font-bold text-slate-500">
                      残り {g.areas.length - 8} 市区町村を開く
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {g.areas.slice(8).map((a) => (
                        <AreaLink
                          key={a.code}
                          code={a.code}
                          city={a.city}
                          medianRent={a.medianRent}
                        />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-base font-bold font-serif">
            自分の吉方位と突き合わせる
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-slate-700">
            どの方位が吉かは、本命星（生まれ年）とその年の年盤で決まります。上の一覧と突き合わせるには、まず自分の本命星を確かめてください。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/houi"
              className="inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
            >
              本命星と吉方位を調べる
            </Link>
            <Link
              href="/relocation/arbitrage"
              className="inline-flex px-5 py-2.5 rounded-full border border-slate-400 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs transition-colors"
            >
              物件を方位で探す
            </Link>
          </div>
        </section>

        {/* 県ページ同士の導線。ここが無く、複数県を見比べるには
            一度 /houi へ戻るしかなかった */}
        {siblings.length > 0 && (
          <nav className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5">
            <h2 className="text-base font-bold font-serif">
              {PREF_REGION[code]}のほかの県
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">
              {
                "引越し先の候補が複数の県にまたがるときは、同じ見方で並べたこちらも合わせてどうぞ。"
              }
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {siblings.map((s) => (
                <li key={s.code}>
                  <Link
                    href={`/houi/pref/${s.code}`}
                    className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <p className="mt-8 max-w-[70ch] text-[11px] leading-relaxed text-slate-500">
          相場は当サイトが収集している賃貸掲載から集計した参考値で、毎晩更新されます。市区町村によって収集の網羅度に差があり、掲載件数の少ない街の数字は振れやすい点に注意してください。
        </p>

        {/* 県内のニュース。市区町村ページと同じ仕組みで、県名で拾う */}
        <LocalNewsPanel prefCode={code} placeName={pref} />

        <ContentDisclaimer />
      </article>
    </div>
  );
}

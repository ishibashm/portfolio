import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { FengShuiLookup } from "@/components/houi/FengShuiLookup";
import { HonmeiLookup } from "@/components/houi/HonmeiLookup";
import type { Metadata } from "next";
import {
  STAR_NAMES,
  STARS,
  birthYearsThrough,
  contentYears,
  currentYearInJapan,
  starForBirthYear,
} from "@/lib/kigakuContent";
import { AdBanner } from "@/components/ads/AdBanner";
import { prefNameByCode } from "@/lib/prefContent";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";

/**
 * 方位コンテンツの入口。
 *
 * 「自分の本命星が分からない」で止まる人が多いので、
 * 生まれ年から引ける表を最初に置く。値は ephemerisEngine の計算結果。
 */

/*
  title に年を入れる。Search Console の実測（2026-08-14〜31）で、この頁は
  90 表示・11.6 位・クリック 1（CTR 1.1%）だった。1 ページ目の縁で、
  検索語の大半は「◯年 吉方位」のように年を含む。年の無い title は
  並んだ結果の中で「今年のことか分からない」ので、押されにくい。
  ISR（revalidate 60）なので年越しで自動的に更新される。h1 は変えない
  （docs/qa/05-houi.md が見出しの文言を固定している）。
*/
export function generateMetadata(): Metadata {
  const year = currentYearInJapan();
  return {
    alternates: { canonical: "/houi" },
    title: `${year}年の吉方位と本命星の早見表（九星気学）`,
    description: `生まれ年から本命星を調べ、${year}年の吉方位・五黄殺・暗剣殺・歳破・本命殺がどの方位に当たるかを一覧で確認できます。引越しの方位を決める前の確認に。`,
  };
}

export const revalidate = 60;

export default function Page() {
  const years = contentYears();
  // このページはISRで再生成されるため、年越し後のリクエストで自動更新される。
  const birthYears = birthYearsThrough(currentYearInJapan());

  // 生まれ年の表は本命星ごとにまとめたほうが引きやすい
  const byStar = new Map<number, number[]>();
  for (const y of birthYears) {
    const s = starForBirthYear(y, "classical");
    if (!byStar.has(s)) byStar.set(s, []);
    byStar.get(s)!.push(y);
  }

  // 独自モデルでは本命星そのものが変わる年がある。ツールで切り替えたときに
  // 表と食い違って見えるので、違いが出る年をここで示しておく。
  const differing = birthYears.filter(
    (y) => starForBirthYear(y, "classical") !== starForBirthYear(y, "physical"),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      {/* 早見表であって読み物ではない。長い本文はリード文だけで、あとは
          9 つの星の札と年ごとの一覧なので、記事の読み幅で止める理由が無い。
          /guide の索引と同じ 1700px。記事側（/houi/[year]/[star]）は本文が
          長いので 820px のまま。行長は段落の max-w-[70ch] で守る。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          九星気学の本命星と吉方位の早見表
        </h1>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          引越しの方位は、自分の<b>本命星</b>と、その年の<b>年盤</b>で決まります。まず生まれ年から本命星を確認し、その年の方位一覧に進んでください。
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            生まれ年から本命星を調べる
          </h2>
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            九星気学の一年は<b>立春</b>で切り替わります（2月3日〜4日ごろ）。切り替わるのは<b>その日の 0 時ではなく、立春の瞬間</b>です。時刻は年ごとに違います（2026年は2月4日 5時1分ごろ、2027年は2月4日 10時46分ごろ）。
            1月1日から立春前までに生まれた方は、<b>前年</b>の本命星になります。<b>立春の日に生まれた方は、生まれた時刻で分かれます。</b>
          </p>
          {/* 生年月日で引く早見。立春前の生まれの繰り下げを自動で行うので、
              上の断りを読み飛ばしても 1 年ずれない。星の名前と行き先の年は
              props で渡す（client 側に kigakuContent → ephemerisEngine を
              値として乗せないため）。 */}
          <HonmeiLookup starNames={STAR_NAMES} linkYear={years[0]} />
          <p className="mt-8 text-xs font-bold text-slate-700">
            生まれ年から表で引く場合
          </p>
          {/* 9 枚。1 列のままだと器を広げても札が伸びるだけなので、
              広い画面では折り返す。 */}
          <div className="mt-5 space-y-3 xl:space-y-0 xl:grid xl:grid-cols-3 xl:gap-3">
            {STARS.map((s) => (
              <div
                key={s}
                className="rounded-2xl border border-slate-300 bg-white/90 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-base font-bold font-serif">
                    {STAR_NAMES[s]}
                  </span>
                  <Link
                    prefetch={false}
                    href={`/houi/${years[0]}/${s}`}
                    className="text-xs font-bold text-rose-600 hover:underline"
                  >
                    {years[0]}年の吉方位を見る →
                  </Link>
                </div>
                <p className="mt-2 text-xs text-slate-600 font-mono leading-relaxed">
                  {(byStar.get(s) ?? []).join(" / ")}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 本命星の表のすぐ後ろに置く。**以前は算出方法の註と広告の
            後ろにあり、261 行の頁の中ほどでスクロールしないと見えなかった。**
            市区町村ページ（1,022 頁）へのサイト内の入口が実質ここだけ
            だったので、読む順序（吉方位を引く → その方位に何があるか）
            どおりの位置に上げる。註は読み終えた人が見ればよい。 */}
        <section className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-base font-bold font-serif">
            吉方位が分かったら、その方位に何があるか
          </h2>
          <p className="mt-3 text-xs text-slate-700 leading-relaxed">
            方位の吉凶だけでは引越し先は決まりません。いま住んでいる市区町村を選ぶと、そこから見た八方位それぞれのエリアと家賃相場を確認できます。県単位のまとめ（相場の傾きと方位の対応）も、県ごとに順次公開しています。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/houi/area"
              className="inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
            >
              エリア別の方位と相場を見る
            </Link>
            {/* 県のまとめは固有文章を書いた県だけ公開（prefEditorial）。
                公開済みの県をここに直接並べる。 */}
            {Object.keys(PREF_EDITORIAL).map((code) => {
              const name = prefNameByCode(code);
              if (!name) return null;
              return (
                <Link
                  prefetch={false}
                  key={code}
                  href={`/houi/pref/${code}`}
                  className="inline-flex px-4 py-2.5 rounded-full border border-slate-400 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs transition-colors"
                >
                  {name}
                </Link>
              );
            })}
          </div>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-8 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-sm font-bold">算出方法が2種類あります</h2>
          <p className="mt-3 text-xs text-slate-700 leading-relaxed">
            上の表は<b>一般的な九星気学</b>（9年周期）によるものです。このサイトのスキャナーには、木星の黄経から星を求める
            <b>独自モデル</b>も用意しており、設定で切り替えられます。独自モデルでは木星の公転周期（約11.86年）にもとづくため
            9年周期にならず、{differing.length}件の生まれ年で本命星が変わります。一般的な資料と照らし合わせる場合は上の表を使ってください。
          </p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
            例: 1980年生まれは一般的な九星気学で
            {STAR_NAMES[starForBirthYear(1980, "classical")]}、独自モデルでは{STAR_NAMES[starForBirthYear(1980, "physical")]}
            になります。
          </p>
        </section>

        {/* 九星気学の次に置く。引き方がそろっている（自分が何かを引いて、
            その人にとっての 8 方位を読む）ので、続けて読める。
            **点にして足さない。**別の段として並べる。 */}
        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            風水（八宅）で見る 8 方位
          </h2>
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            九星気学とは<b>別の流派</b>
            です。既定では判定に使っていません。方位の良し悪しは流派によって違うので、
            <b>両方が吉の方位もあれば、片方だけの方位もあります</b>。
          </p>
          <div className="mt-5">
            <FengShuiLookup />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            年ごとの方位一覧
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {years.map((y) => (
              <div
                key={y}
                className="rounded-2xl border border-slate-300 bg-white/90 p-4"
              >
                <h3 className="font-bold font-serif text-sm mb-2">{y}年</h3>
                <ul className="space-y-1">
                  {STARS.map((s) => (
                    <li key={s}>
                      <Link prefetch={false}
                        href={`/houi/${y}/${s}`}
                        className="text-xs text-slate-700 hover:text-rose-600"
                      >
                        {STAR_NAMES[s]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-300 bg-white/90 p-5">
          <h2 className="text-sm font-bold">用語について</h2>
          <dl className="mt-3 text-xs text-slate-700 leading-relaxed space-y-2">
            <div>
              <dt className="font-bold inline">五黄殺　</dt>
              <dd className="inline">
                五黄土星が回座する方位。最も避けるべき方位とされます。
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">暗剣殺　</dt>
              <dd className="inline">五黄殺の正反対にあたる方位です。</dd>
            </div>
            <div>
              <dt className="font-bold inline">歳破　</dt>
              <dd className="inline">
                その年の十二支の正反対にあたる方位です。
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">本命殺　</dt>
              <dd className="inline">
                自分の本命星そのものが回座する方位です。
              </dd>
            </div>
            <div>
              <dt className="font-bold inline">本命的殺　</dt>
              <dd className="inline">本命殺の正反対にあたる方位です。</dd>
            </div>
            <div>
              <dt className="font-bold inline">天中殺　</dt>
              <dd className="inline">
                生年月日ごとに決まる期間。本命星では決まらないため、この早見表には含まれません。
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs text-amber-900 leading-relaxed">
            方位は<b>今住んでいる場所から見た向き</b>で決まります。実際の物件で確認する場合は、出発地と生年月日を入れてスキャンしてください。
          </p>
          <Link
            href="/relocation/arbitrage"
            className="mt-4 inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            物件を方位で探す
          </Link>
        </div>

        <ContentDisclaimer />
      </article>
    </div>
  );
}

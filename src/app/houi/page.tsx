import { HonmeiStarLinks } from "@/components/houi/HonmeiStarLinks";
import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { HonmeiLookup } from "@/components/houi/HonmeiLookup";
import { CompassDial } from "@/components/motion/CompassDial";
import { MagneticCompass } from "@/components/houi/MagneticCompass";
import type { Metadata } from "next";
import {
  HOUI_BREADCRUMB_LABEL,
  STAR_NAMES,
  STARS,
  birthYearsThrough,
  contentYears,
  currentYearInJapan,
  getYearDirections,
  starForBirthYear,
} from "@/lib/kigakuContent";
import { AdBanner } from "@/components/ads/AdBanner";
import { prefNameByCode } from "@/lib/prefContent";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
import { coreRouteLabel } from "@/lib/siteStructure";
import { pageOpenGraph } from "@/lib/siteUrl";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/JsonLd";

// 頁に出ている文言（リード文・用語について）だけで組む。
const SHARED_BAD_LABELS = ["五黄殺", "暗剣殺", "歳破"];

const HOUI_FAQ = [
  {
    question: "本命星はどうやって調べますか？",
    answer:
      "引越しの方位は、自分の本命星と、その年の年盤で決まります。まず生まれ年から本命星を確認し、その年の方位一覧に進んでください。",
  },
  {
    question: "五黄殺とは何ですか？",
    answer: "五黄土星が回座する方位。最も避けるべき方位とされます。",
  },
  {
    question: "暗剣殺とは何ですか？",
    answer: "五黄殺の正反対にあたる方位です。",
  },
] as const;

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
  ISR（revalidate 60）なので年越しで自動的に更新される。2026-10-29 に
  トップとの検索語の役割を分け、h1 にも年と「引越し」を入れた。
  docs/qa/05-houi.md の見出しの記載も合わせる。
*/
export function generateMetadata(): Metadata {
  const year = currentYearInJapan();
  const title = `${year}年 吉方位早見表｜本命星別に引越しの方位と時期を確認`;
  const description = `${year}年の吉方位と引越しで避けたい方位を、九星気学の本命星別に確認できます。生まれ年から本命星を調べ、年盤の五黄殺・暗剣殺・歳破・本命殺と月別の方位を早見表で比較し、引越しの時期を検討できます。`;
  return {
    alternates: { canonical: "/houi" },
    title,
    description,
    openGraph: pageOpenGraph("/houi", title, description),
  };
}

export const revalidate = 60;

export default function Page() {
  const years = contentYears();
  // このページはISRで再生成されるため、年越し後のリクエストで自動更新される。
  const year = currentYearInJapan();
  const birthYears = birthYearsThrough(year);

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

  // 年盤の表示ラベルに出る共通の凶（五黄殺・暗剣殺・歳破）を組み立てる。
  const sharedBadMap = new Map<string, { jp: string; label: string }>();
  for (const star of STARS) {
    const { verdicts } = getYearDirections(year, star, "classical");
    for (const v of verdicts) {
      if (!SHARED_BAD_LABELS.includes(v.label)) continue;
      sharedBadMap.set(`${v.label}:${v.jp}`, { jp: v.jp, label: v.label });
    }
  }
  const sharedBad = [...sharedBadMap.values()].sort(
    (a, b) =>
      SHARED_BAD_LABELS.indexOf(a.label) - SHARED_BAD_LABELS.indexOf(b.label),
  );
  const sharedBadText = sharedBad
    .map((b) => `${b.jp}が「${b.label}」`)
    .join("、");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      {/* 早見表であって読み物ではない。長い本文はリード文だけで、あとは
          9 つの星の札と年ごとの一覧なので、記事の読み幅で止める理由が無い。
          /guide の索引と同じ 1700px。記事側（/houi/[year]/[star]）は本文が
          長いので 820px のまま。行長は段落の max-w-[70ch] で守る。 */}
      <BreadcrumbJsonLd
        items={[{ name: HOUI_BREADCRUMB_LABEL, path: "/houi" }]}
      />
      <FaqJsonLd items={HOUI_FAQ} />
      <article className="relative max-w-[1700px] mx-auto px-5 py-12">
        {/* 金の羅盤の線画（飾り）。広い画面だけ、見出しと重ならない右上に。 */}
        <CompassDial
          labels
          className="pointer-events-none absolute right-5 top-6 hidden h-40 w-40 opacity-70 lg:block"
        />
        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {year}年 引越しの方位と吉方位早見表
        </h1>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          引越しの方位は、自分の<b>本命星</b>と、その年の<b>年盤</b>
          で決まります。まず生まれ年から本命星を確認し、その年の方位一覧に進んでください。
        </p>

        <section
          aria-labelledby="houi-intro-heading"
          className="mt-6 rounded-2xl border border-slate-300 bg-white/90 p-5"
        >
          <h2
            id="houi-intro-heading"
            className="text-lg font-bold font-serif border-b border-slate-300 pb-2"
          >
            吉方位の調べ方（先に結論）
          </h2>
          <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-slate-700">
            吉方位の調べ方は、生まれ年から<b>本命星</b>を出し、その年の
            <b>年盤</b>（引越しでは動く月の<b>月盤</b>
            も）で相性のよい星がいる方位を候補にし、五黄殺・暗剣殺・歳破や本命殺などの凶方位を除く順です。九星気学の一年は1月1日ではなく
            <b>立春</b>
            で切り替わるため、立春前の生まれは前年の星で見ます。ここに書いた吉凶は
            <b>占い上の目安であり、科学的な効果を保証するものではない</b>
            ため、引越しの費用や契約、通勤といった事実とは分けて考えます。
          </p>
          {sharedBadText && (
            <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-slate-600">
              {year}年の年盤では、本命星に関係なく{sharedBadText}
              と表示されます。
            </p>
          )}

          <h3 className="mt-5 text-sm font-bold font-serif text-slate-800">
            このサイトでの調べ方の手順（入力なしで確認できます）
          </h3>
          <ol className="mt-2 max-w-[70ch] list-decimal pl-5 space-y-2 text-xs leading-relaxed text-slate-700">
            <li>
              <b>下の早見表で生まれ年の本命星を出す：</b>
              九星気学の一年は立春（2月3日から4日ごろ）で切り替わります。1月1日から立春の前日までの生まれは前年の星となり、立春当日は出生時刻で分かれます。
            </li>
            <li>
              <b>その年の8方位の判定を見る：</b>星の名前の横にある「{years[0]}
              年の吉方位を見る」（または本命星のリンク）から年別のページへ進み、8方位それぞれの判定（吉方位・平・五黄殺など）を確認します。
            </li>
            <li>
              <b>実際に動く月の月盤も見る：</b>
              長く住む移動では、年ページで年盤を見たあと、同じページの「月ごとの吉方位」の一覧で実際に動く月の月盤も確認します。月の区切りは暦の1日ではなく節入りです。年で吉でも月で避けるべき方位になることがあります。
            </li>
            <li>
              <b>凶方位を候補から外す：</b>
              だれにも共通の凶方位（五黄殺・暗剣殺・歳破。月盤では歳破の代わりに月破）と、自分の本命殺・本命的殺に当たる方位は、占い上は候補から外します。
            </li>
            <li>
              <b>今住んでいる場所から真北で向きを見る：</b>
              方位は今住んでいる場所（出発地）から見ます。このサイトの判定は地図と同じ真北が基準です。方位磁針（磁北）で測ると境目の近くでは隣の方位に見えることがあります。
            </li>
            <li>
              <b>その方位の街や動ける日を既存の道具で確かめる：</b>
              費用や契約の事実は方位の判定とは別に見ます。候補の方位にある街と家賃相場は{" "}
              <Link
                href="/houi/area"
                className="font-bold text-rose-600 underline hover:text-rose-700"
              >
                エリア別の方位と相場
              </Link>{" "}
              や{" "}
              <Link
                href="/relocation/arbitrage"
                className="font-bold text-rose-600 underline hover:text-rose-700"
              >
                {coreRouteLabel("/relocation/arbitrage")}
              </Link>
              、動く時期の絞り込み（一般的な繁忙期や料金の傾向の案内を含む）は{" "}
              <Link
                href="/relocation/timing"
                className="font-bold text-rose-600 underline hover:text-rose-700"
              >
                {coreRouteLabel("/relocation/timing")}
              </Link>
              、六曜・天赦日・一粒万倍日・土用などの日取りは{" "}
              <Link
                href="/calendar"
                className="font-bold text-rose-600 underline hover:text-rose-700"
              >
                {coreRouteLabel("/calendar")}
              </Link>{" "}
              で確認できます。詳しい見方は{" "}
              <Link
                href="/guide/honmei"
                className="underline hover:text-rose-600"
              >
                使い方ガイド（本命星と吉方位）
              </Link>{" "}
              にまとめています。
            </li>
          </ol>
        </section>

        <p className="mt-4">
          <Link href="/houi/today" className="text-rose-600 underline">
            今の時間・今日の吉方位を見る
          </Link>
        </p>
        <HonmeiStarLinks year={year} />

        <section id="honmei-lookup" className="mt-6 scroll-mt-6">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            生まれ年から本命星を調べる
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            ※年の切り替わりは立春の瞬間（2月3〜4日ごろ）です。1月1日から立春の前日までに生まれた方は前年の本命星となり、立春当日生まれは出生時刻で分かれます。
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

          <p className="mt-8 text-xs font-bold text-slate-700">
            生年月日から立春の境目を自動で見たいとき（任意・送信しません）
          </p>
          {/* 生年月日で引く早見。立春前の生まれの繰り下げを自動で行うので、
              注釈を読み飛ばしても 1 年ずれない。星の名前と行き先の年は
              props で渡す（client 側に kigakuContent → ephemerisEngine を
              値として乗せないため）。 */}
          {/* どのプロフィールで引くかを先に 1 行（利用者の指摘、2026-09-12） */}
          <ActiveProfileBadge purpose="本命星と吉方位" className="mt-3 mb-3" />
          <HonmeiLookup starNames={STAR_NAMES} linkYear={years[0]} />
          <p className="mt-5 text-sm">
            <Link href="/ask" className="underline text-slate-600">
              エージェントに案内してもらう
            </Link>
          </p>

          <p className="mt-3 text-sm">
            <Link href="/houi/3d" className="underline text-slate-600">
              住所から街の立体と方位を見る
            </Link>
          </p>
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
            方位の吉凶だけでは引越し先は決まりません。いま住んでいる市区町村を選ぶと、そこから見た八方位それぞれのエリアと家賃相場を確認できます。県単位のまとめでは、相場の傾きと方位の対応を確認できます。たとえば
            <Link
              href="/houi/area/12203"
              className="underline hover:text-rose-600"
            >
              市川市
            </Link>
            や
            <Link
              href="/houi/area/23101"
              className="underline hover:text-rose-600"
            >
              名古屋市千種区
            </Link>
            には、出発地から見た街の並びを解説しています。
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
            上の表は<b>一般的な九星気学</b>
            （9年周期）によるものです。このサイトのスキャナーには、木星の黄経から星を求める
            <b>独自モデル</b>
            も用意しており、設定で切り替えられます。独自モデルでは木星の公転周期（約11.86年）にもとづくため
            9年周期にならず、{differing.length}
            件の生まれ年で本命星が変わります。一般的な資料と照らし合わせる場合は上の表を使ってください。
          </p>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            例: 1980年生まれは一般的な九星気学で
            {STAR_NAMES[starForBirthYear(1980, "classical")]}、独自モデルでは
            {STAR_NAMES[starForBirthYear(1980, "physical")]}
            になります。
          </p>
        </section>

        {/*
          八宅の道具そのものは /houi/fengshui へ移した。ここに埋めたままだと
          専用の URL が無く、ナビにも「風水」の語が出ないので、**サイトの中
          から辿れなかった**（利用者の指摘、2026-09-04）。この頁からは行き先
          として案内する。引き方がそろっているので、続けて読める並びは残す。
        */}
        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            風水（八宅）で見る 8 方位
          </h2>
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            九星気学とは<b>別の流派</b>
            です。既定では判定に使っていません。方位の良し悪しは流派によって違うので、
            <b>両方が吉の方位もあれば、片方だけの方位もあります</b>。
          </p>
          <Link
            href="/houi/fengshui"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-5 py-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50"
          >
            風水（八宅）で自分の吉方位を調べる →
          </Link>
        </section>

        {/*
          判定は真北、磁北は注意としてだけ（CLAUDE.md 3 節）。この頁は
          全国向けで偏角を持てないので、測り方のずれは羅盤で見せる。
        */}
        <section className="mt-10">
          <h2 className="border-b border-slate-300 pb-2 font-serif text-xl font-bold">
            方位は真北で測ります（方位磁針とのずれ）
          </h2>
          <MagneticCompass />
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
                <h3 className="font-bold font-serif text-sm mb-2">
                  <Link
                    prefetch={false}
                    href={`/houi/${y}`}
                    className="hover:text-rose-600"
                  >
                    {y}年
                  </Link>
                </h3>
                <ul className="space-y-1">
                  {STARS.map((s) => (
                    <li key={s}>
                      <Link
                        prefetch={false}
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
          <p className="mt-3 text-xs text-slate-700">
            方位と日取りを確認する順序は、
            <Link href="/guide" className="underline hover:text-rose-600">
              使い方ガイド
            </Link>
            にまとめています。
          </p>
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
                <Link
                  href="/blog/moving-during-tenchusatsu"
                  className="ml-1 underline hover:text-rose-600"
                >
                  天中殺に引っ越ししても大丈夫か、影響と対処を読む
                </Link>
                <Link
                  href="/blog/houi-and-tenchusatsu"
                  className="ml-1 underline hover:text-rose-600"
                >
                  天中殺も気になる人はこちら（吉方位と天中殺の関係）
                </Link>
              </dd>
            </div>
          </dl>
        </section>

        <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs text-amber-900 leading-relaxed">
            方位は<b>今住んでいる場所から見た向き</b>
            で決まります。方位ごとにどの街があるかを見るには、出発地と生年月日を入れてください。
          </p>
          <Link
            href="/relocation/arbitrage"
            className="mt-4 inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            {coreRouteLabel("/relocation/arbitrage")}
          </Link>
        </div>

        <ContentDisclaimer />
      </article>
    </div>
  );
}

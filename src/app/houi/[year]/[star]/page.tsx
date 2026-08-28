import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { PractitionerStrip } from "@/components/practitioners/PractitionerStrip";
import { DirectionEffects } from "@/components/houi/DirectionEffects";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  STAR_NAMES,
  STARS,
  contentYears,
  getYearDirections,
  monthContentYears,
  MONTHS,
} from "@/lib/kigakuContent";
import { AdBanner } from "@/components/ads/AdBanner";
import { AreaEntryLinks } from "@/components/houi/AreaEntryLinks";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";

/**
 * 「2026年 一白水星 吉方位」のような検索に直接応える静的ページ。
 *
 * ツールはどれも操作しないと結果が出ないため、検索エンジンには
 * 初期状態しか見えず、流入の入口が無かった。判定は既存エンジンから
 * そのまま引いているので、ここの記載とスキャナーの判定はずれない。
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return contentYears().flatMap((year) =>
    STARS.map((star) => ({ year: String(year), star: String(star) })),
  );
}

function parse(params: { year: string; star: string }) {
  const year = parseInt(params.year, 10);
  const star = parseInt(params.star, 10);
  if (!contentYears().includes(year) || !STARS.includes(star)) return null;
  return { year, star };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; star: string }>;
}): Promise<Metadata> {
  const parsed = parse(await params);
  if (!parsed) return {};
  const { year, star } = parsed;
  const name = STAR_NAMES[star];
  const { verdicts } = getYearDirections(year, star);
  const good = verdicts.filter((v) => v.kind === "good").map((v) => v.jp);

  const title = `${year}年 ${name}の吉方位と凶方位`;
  const description =
    good.length > 0
      ? `${year}年、${name}の年盤での吉方位は${good.join("・")}です。五黄殺・暗剣殺・歳破・本命殺がどの方位に当たるかも一覧で確認できます。`
      : `${year}年、${name}の年盤には吉方位に当たる方位がありません。五黄殺・暗剣殺・歳破・本命殺の位置を一覧で確認できます。`;

  return {
    title,
    description,
    alternates: { canonical: `/houi/${year}/${star}` },
    openGraph: {
      images: ["/ogp.png"], title, description, type: "article" },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ year: string; star: string }>;
}) {
  const parsed = parse(await params);
  if (!parsed) notFound();
  const { year, star } = parsed;
  const name = STAR_NAMES[star];
  const { centerStar, verdicts } = getYearDirections(year, star, "classical");
  // このサイトのスキャナーは独自モデルにも切り替えられる。片方だけ載せると
  // 記事を読んでツールを触った人が別の答えを見ることになるので併記する。
  const physical = getYearDirections(year, star, "physical");

  const good = verdicts.filter((v) => v.kind === "good");
  const bad = verdicts.filter((v) => v.kind === "bad");
  const physGood = physical.verdicts.filter((v) => v.kind === "good");
  const physBad = physical.verdicts.filter((v) => v.kind === "bad");
  const systemsAgree =
    verdicts.map((v) => v.status).join() ===
    physical.verdicts.map((v) => v.status).join();

  const tone = {
    good: "bg-emerald-50 border-emerald-200 text-emerald-900",
    neutral: "bg-stone-50 border-stone-200 text-stone-700",
    bad: "bg-rose-50 border-rose-200 text-rose-900",
  } as const;

  const path = `/houi/${year}/${star}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <ArticleJsonLd
        headline={`${year}年 ${name}の吉方位と凶方位`}
        description={`${year}年の年盤における${name}の吉方位、五黄殺・暗剣殺・歳破・本命殺の位置。`}
        path={path}
        keywords={[`${year}年`, name, "吉方位", "凶方位", "九星気学", "引越し"]}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: `${year}年 ${name}`, path },
        ]}
      />
      {/* 幅は全画面で 1700px に揃える（1/3 と同じ理由）。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <span>
            {year}年 {name}
          </span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {year}年 {name}の吉方位と凶方位
        </h1>

        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          {year}年の年盤は中宮が{STAR_NAMES[centerStar]}です。
          {name}の方にとって、この年の各方位の扱いは次のとおりです。
          {good.length > 0 ? (
            <>
              吉方位は<b>{good.map((v) => v.jp).join("・")}</b>、
            </>
          ) : (
            <>この年は吉方位に当たる方位がありません。</>
          )}
          避けるべき方位は<b>{bad.map((v) => `${v.jp}（${v.label}）`).join("、")}</b>
          です。
        </p>
        <DirectionEffects
          verdicts={verdicts}
          periodLabel={`${year}年`}
          personalStar={star}
        />


        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            方位ごとの判定
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {verdicts.map((v) => (
              <div
                key={v.direction}
                className={`rounded-2xl border p-4 ${tone[v.kind]}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold font-serif">{v.jp}</span>
                  <span className="text-xs font-bold">{v.label}</span>
                </div>
                <p className="text-xs mt-2 leading-relaxed opacity-90">
                  {v.note}
                </p>
                {v.star !== null && (
                  <p className="text-[11px] mt-2 opacity-70">
                    回座している星: {STAR_NAMES[v.star]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {monthContentYears().includes(year) && (
          <section className="mt-10">
            <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
              月ごとの吉方位
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-700">
              引越しの方位は、年盤と月盤の両方が吉であることを条件にする考え方が一般的です。月ごとの判定は次から確認できます。
            </p>
            {/* 12 か月 × 9 星 × 2 年 = 216 頁は同じ雛形の展開（noindex）。
                開いたまま並べると、回遊するほどテンプレ頁に当たり続ける。
                導線としては残し、初期表示では畳む（AdSense の導線指摘への
                対応。2026-08-28）。 */}
            <details className="mt-4">
              <summary className="cursor-pointer select-none text-xs font-bold text-slate-600 hover:text-slate-900">
                月を選んで開く（1月〜12月）
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {MONTHS.map((m) => (
                  <Link prefetch={false}
                    key={m}
                    href={`/houi/${year}/${star}/${m}`}
                    className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                  >
                    {m}月
                  </Link>
                ))}
              </div>
            </details>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            算出方法による違い
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            上の表は一般的な九星気学（{STAR_NAMES[centerStar]}中宮）による判定です。このサイトのスキャナーには、木星の黄経から星を求める独自モデルも用意しており、設定で切り替えられます。同じ{year}年でも中宮が
            {STAR_NAMES[physical.centerStar]}になるため、判定が変わります。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100">
                  <th className="border border-slate-300 p-2 text-left font-bold">
                    算出方法
                  </th>
                  <th className="border border-slate-300 p-2 text-left font-bold">
                    中宮
                  </th>
                  <th className="border border-slate-300 p-2 text-left font-bold">
                    吉方位
                  </th>
                  <th className="border border-slate-300 p-2 text-left font-bold">
                    避けるべき方位
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 p-2 font-semibold">
                    一般的な九星気学
                  </td>
                  <td className="border border-slate-300 p-2">
                    {STAR_NAMES[centerStar]}
                  </td>
                  <td className="border border-slate-300 p-2">
                    {good.length ? good.map((v) => v.jp).join("・") : "なし"}
                  </td>
                  <td className="border border-slate-300 p-2">
                    {bad.map((v) => `${v.jp}（${v.label}）`).join("、")}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 p-2 font-semibold">
                    本サイト独自モデル
                  </td>
                  <td className="border border-slate-300 p-2">
                    {STAR_NAMES[physical.centerStar]}
                  </td>
                  <td className="border border-slate-300 p-2">
                    {physGood.length
                      ? physGood.map((v) => v.jp).join("・")
                      : "なし"}
                  </td>
                  <td className="border border-slate-300 p-2">
                    {physBad.map((v) => `${v.jp}（${v.label}）`).join("、")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-600 leading-relaxed">
            {systemsAgree
              ? "この年・この本命星では、どちらの算出方法でも同じ判定になります。"
              : "この年・この本命星では判定が一致しません。"}
            独自モデルは木星の公転周期（約11.86年）にもとづくため、
            9年周期の一般的な九星気学とは星の巡り方が異なります。一般的な資料と照らし合わせる場合は上段を、スキャナーで独自モデルを選ぶ場合は下段をご覧ください。
          </p>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            この表だけで引越し先を決められない理由
          </h2>
          <ul className="mt-3 text-xs text-amber-900 leading-relaxed list-disc pl-5 space-y-1.5">
            <li>
              ここに載せているのは<b>年盤</b>だけです。実際の移転では月盤も見ます。年盤で吉でも、月によっては凶方位になります。
            </li>
            <li>
              <b>天中殺</b>は生年月日ごとに異なり、本命星では決まりません。その期間は方位に関係なく移転を避けるという考え方があります。
            </li>
            <li>
              方位は<b>今住んでいる場所から見た向き</b>で決まります。同じ物件でも出発地が違えば方位が変わります。
            </li>
            <li>
              九星気学の一年は<b>立春の瞬間</b>で切り替わります（2月3日〜4日ごろ。時刻は年ごとに違います）。1月生まれ・2月上旬生まれの方は前年の星になることがあります。<b>立春の日に生まれた方は、生まれた時刻で分かれます。</b>
            </li>
          </ul>
          <Link
            href="/relocation/arbitrage"
            className="mt-4 inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            出発地と生年月日を入れて実際の物件で確認する
          </Link>
        </section>

        <AreaEntryLinks heading="吉方位に何があるかを見る" />

        <PractitionerStrip />


        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            ほかの本命星
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {STARS.filter((s) => s !== star).map((s) => (
              <Link prefetch={false}
                key={s}
                href={`/houi/${year}/${s}`}
                className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
              >
                {STAR_NAMES[s]}
              </Link>
            ))}
          </div>

          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2 mt-8">
            ほかの年
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {contentYears()
              .filter((y) => y !== year)
              .map((y) => (
                <Link prefetch={false}
                  key={y}
                  href={`/houi/${y}/${star}`}
                  className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                >
                  {y}年の{name}
                </Link>
              ))}
          </div>
        </section>

        <ContentDisclaimer />
      </article>
    </div>
  );
}

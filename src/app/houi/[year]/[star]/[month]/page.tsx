import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { DirectionEffects } from "@/components/houi/DirectionEffects";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  MONTHS,
  STAR_NAMES,
  STARS,
  formatDate,
  getMonthDirections,
  monthContentYears,
} from "@/lib/kigakuContent";
import { AdBanner } from "@/components/ads/AdBanner";
import { AreaEntryLinks } from "@/components/houi/AreaEntryLinks";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";

/**
 * 「2026年3月 一白水星 吉方位」のような、月単位の検索に応えるページ。
 *
 * 引越しは月単位で決めるものなので、年盤だけでは足りない。
 * 九星気学の月は暦月ではなく節入りで切り替わるため、
 * 対象期間を実際の切替日で明示する。
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return monthContentYears().flatMap((year) =>
    STARS.flatMap((star) =>
      MONTHS.map((month) => ({
        year: String(year),
        star: String(star),
        month: String(month),
      })),
    ),
  );
}

function parse(params: { year: string; star: string; month: string }) {
  const year = parseInt(params.year, 10);
  const star = parseInt(params.star, 10);
  const month = parseInt(params.month, 10);
  if (!monthContentYears().includes(year)) return null;
  if (!STARS.includes(star) || !MONTHS.includes(month)) return null;
  return { year, star, month };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; star: string; month: string }>;
}): Promise<Metadata> {
  const parsed = parse(await params);
  if (!parsed) return {};
  const { year, star, month } = parsed;
  const name = STAR_NAMES[star];
  const { verdicts, start, end } = getMonthDirections(year, month, star);
  const good = verdicts.filter((v) => v.kind === "good").map((v) => v.jp);

  const title = `${year}年${month}月 ${name}の吉方位`;
  const description =
    good.length > 0
      ? `${year}年${month}月（${formatDate(start)}〜${formatDate(end)}）、${name}の月盤での吉方位は${good.join("・")}です。五黄殺・暗剣殺・月破の位置も確認できます。`
      : `${year}年${month}月（${formatDate(start)}〜${formatDate(end)}）、${name}の月盤には吉方位がありません。五黄殺・暗剣殺・月破の位置を確認できます。`;

  return {
    title,
    description,
    alternates: { canonical: `/houi/${year}/${star}/${month}` },
    openGraph: {
      images: ["/ogp.png"], title, description, type: "article" },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ year: string; star: string; month: string }>;
}) {
  const parsed = parse(await params);
  if (!parsed) notFound();
  const { year, star, month } = parsed;
  const name = STAR_NAMES[star];
  const { centerStar, start, end, verdicts } = getMonthDirections(
    year,
    month,
    star,
  );

  const good = verdicts.filter((v) => v.kind === "good");
  const bad = verdicts.filter((v) => v.kind === "bad");

  const tone = {
    good: "bg-emerald-50 border-emerald-200 text-emerald-900",
    neutral: "bg-stone-50 border-stone-200 text-stone-700",
    bad: "bg-rose-50 border-rose-200 text-rose-900",
  } as const;

  const path = `/houi/${year}/${star}/${month}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <ArticleJsonLd
        headline={`${year}年${month}月 ${name}の吉方位`}
        description={`${formatDate(start)}から${formatDate(end)}までの月盤における${name}の吉方位、五黄殺・暗剣殺・月破の位置。`}
        path={path}
        keywords={[`${year}年${month}月`, name, "吉方位", "月盤", "引越し"]}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: `${year}年 ${name}`, path: `/houi/${year}/${star}` },
          { name: `${month}月`, path },
        ]}
      />
      <article className="max-w-[820px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/houi/${year}/${star}`} className="hover:text-rose-600">
            {year}年 {name}
          </Link>
          <span className="mx-2">/</span>
          <span>{month}月</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {year}年{month}月 {name}の吉方位
        </h1>

        <p className="mt-4 text-xs font-semibold text-slate-500">
          対象期間: {formatDate(start)} 〜 {formatDate(end)}
        </p>

        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          この期間の月盤は中宮が{STAR_NAMES[centerStar]}です。
          {name}の方にとっての各方位は次のとおりです。
          {good.length > 0 ? (
            <>
              吉方位は<b>{good.map((v) => v.jp).join("・")}</b>、
            </>
          ) : (
            <>この月は吉方位に当たる方位がありません。</>
          )}
          避けるべき方位は
          <b>{bad.map((v) => `${v.jp}（${v.label}）`).join("、")}</b>です。
        </p>

        <div className="mt-5 rounded-2xl border border-slate-300 bg-white/90 p-4">
          <p className="text-xs text-slate-700 leading-relaxed">
            九星気学の月は暦の1日ではなく<b>節入り</b>で切り替わります。
            {month}月といっても実際には<b>{formatDate(start)}から{formatDate(end)}まで</b>
            が対象です。月の前半に動く場合は前の月の盤になることがあるのでご注意ください。
          </p>
        </div>

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

        <DirectionEffects
          verdicts={verdicts}
          periodLabel={`${year}年${month}月`}
          personalStar={star}
        />

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            年盤と合わせて見てください
          </h2>
          <p className="mt-3 text-xs text-amber-900 leading-relaxed">
            引越しの方位は、年盤と月盤の両方が吉であることを条件にする考え方が一般的です。
            月盤で吉でも年盤で凶なら避ける、という判断になります。
            また天中殺は生年月日ごとに決まるため、本命星だけでは分かりません。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/houi/${year}/${star}`}
              className="px-5 py-2.5 rounded-full border border-amber-300 bg-white text-amber-900 font-bold text-xs hover:border-amber-500 transition-colors"
            >
              {year}年の年盤を見る
            </Link>
            <Link
              href="/relocation/arbitrage"
              className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
            >
              出発地と生年月日を入れて物件で確認する
            </Link>
          </div>
        </section>

        <AreaEntryLinks heading={`${month}月の吉方位に何があるかを見る`} />

        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            {year}年のほかの月
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {MONTHS.filter((m) => m !== month).map((m) => (
              <Link prefetch={false}
                key={m}
                href={`/houi/${year}/${star}/${m}`}
                className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
              >
                {m}月
              </Link>
            ))}
          </div>

          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2 mt-8">
            ほかの本命星（{year}年{month}月）
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {STARS.filter((s) => s !== star).map((s) => (
              <Link prefetch={false}
                key={s}
                href={`/houi/${year}/${s}/${month}`}
                className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
              >
                {STAR_NAMES[s]}
              </Link>
            ))}
          </div>
        </section>

        <ContentDisclaimer />
      </article>
    </div>
  );
}

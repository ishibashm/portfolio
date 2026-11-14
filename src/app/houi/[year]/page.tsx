import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import {
  HOUI_BREADCRUMB_LABEL,
  contentYears,
  getYearDirections,
  monthContentYears,
  MONTHS,
  STARS,
  STAR_NAMES,
} from "@/lib/kigakuContent";
import { pageOpenGraph } from "@/lib/siteUrl";

export const dynamicParams = true;

export function generateStaticParams() {
  return contentYears().map((year) => ({ year: String(year) }));
}

function parse(params: { year: string }) {
  if (!/^\d{4}$/.test(params.year)) return null;
  const year = Number(params.year);
  return contentYears().includes(year) ? { year } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const parsed = parse(await params);
  if (!parsed) return {};
  const { year } = parsed;
  const title = `${year}年の吉方位・凶方位｜九星気学の本命星別一覧`;
  const description = `${year}年の年盤の中宮星と、本命星9つそれぞれの吉方位・凶方位を確認できます。本命星別の詳しい判定や月ごとの方位を調べる入口です。`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/houi/${year}` },
    openGraph: pageOpenGraph(`/houi/${year}`, title, description, {
      type: "article",
      omitImages: true,
    }),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const parsed = parse(await params);
  if (!parsed) notFound();
  const { year } = parsed;
  const summaries = STARS.map((star) => ({
    star,
    ...getYearDirections(year, star, "classical"),
  }));
  const hasMonths = monthContentYears().includes(year);
  const adjacentYears = [year - 1, year + 1].filter((y) =>
    contentYears().includes(y),
  );

  return (
    <div className="min-h-screen bg-[#faf7f5] text-slate-900 font-sans">
      <BreadcrumbJsonLd
        items={[
          { name: HOUI_BREADCRUMB_LABEL, path: "/houi" },
          { name: `${year}年`, path: `/houi/${year}` },
        ]}
      />
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav aria-label="パンくず" className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="underline hover:text-slate-900">
            {HOUI_BREADCRUMB_LABEL}
          </Link>
          <span className="mx-2">/</span>
          <span>{year}年</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold font-serif leading-snug">
          {year}年の吉方位・凶方位
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          {year}年の年盤は、中宮が{STAR_NAMES[summaries[0].centerStar]}
          です。一般的な九星気学にもとづく、本命星別の早見表です。年盤は立春の瞬間に切り替わります。1月から立春までは前年の年盤を使います。
        </p>
        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            本命星別の方位
          </h2>
          <p className="mt-4 text-sm text-slate-700">
            ご自身の本命星を選ぶと、詳しい判定と月ごとの要約を確認できます。算出方法による違いも各ページに載せています。
          </p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaries.map(({ star, verdicts }) => {
              const good = verdicts.filter((v) => v.kind === "good");
              const bad = verdicts.filter((v) => v.kind === "bad");
              return (
                <li key={star} className="wg-card p-5">
                  <h3 className="font-bold font-serif">
                    <Link
                      href={`/houi/${year}/${star}`}
                      className="underline hover:text-slate-600"
                    >
                      {STAR_NAMES[star]}の詳しい方位
                    </Link>
                  </h3>
                  <p className="mt-3 text-sm text-emerald-900">
                    吉方位：
                    {good.length ? good.map((v) => v.jp).join("・") : "なし"}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-rose-900">
                    凶方位：
                    {bad.length
                      ? bad.map((v) => `${v.jp}（${v.label}）`).join("、")
                      : "なし"}
                  </p>
                  {hasMonths && (
                    <details className="mt-4 text-xs text-slate-600">
                      <summary className="cursor-pointer">
                        月別ページを開く
                      </summary>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {MONTHS.map((month) => (
                          <Link
                            prefetch={false}
                            key={month}
                            href={`/houi/${year}/${star}/${month}`}
                            className="underline hover:text-slate-900"
                          >
                            {month}月
                          </Link>
                        ))}
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        {hasMonths && (
          <p className="mt-5 text-sm leading-relaxed text-slate-700">
            月別ページは各本命星の「月別ページを開く」から選べます。月盤は節入りで切り替わります。引越しなどを検討するときは、年盤と月盤の両方をご確認ください。
          </p>
        )}
        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            この一覧の使い方
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">
            本命星の求め方と、年盤の見方は
            <Link
              href="/guide/honmei"
              className="underline hover:text-slate-600"
            >
              使い方ガイド（本命星と吉方位）
            </Link>
            にあります。全星を並べた早見表は
            <Link href="/houi" className="underline hover:text-slate-600">
              引越しの方位
            </Link>
            、日取りの候補は
            <Link href="/calendar" className="underline hover:text-slate-600">
              引越しの日取り
            </Link>
            、この年の天赦日・一粒万倍日・土用は
            <Link
              href={`/calendar/${year}`}
              className="underline hover:text-slate-600"
            >
              {year}年の年間一覧
            </Link>
            、天中殺の期間は
            <Link
              href="/houi/tenchusatsu"
              className="underline hover:text-slate-600"
            >
              天中殺の早見
            </Link>
            で確認できます。
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            出発地から見た街と家賃の水準は、
            <Link href="/houi/area" className="underline hover:text-slate-600">
              エリア別の一覧
            </Link>
            と
            <Link href="/houi/pref" className="underline hover:text-slate-600">
              都道府県のまとめ
            </Link>
            にあります。判定の考え方の背景は
            <Link
              href="/blog/where-kigaku-and-houi-came-from"
              className="underline hover:text-slate-600"
            >
              九星気学と方位はどこから来たのか
            </Link>
            に、この道具が決めないことは
            <Link
              href="/blog/what-this-tool-can-and-cannot-decide"
              className="underline hover:text-slate-600"
            >
              何を決められて、何を決められないか
            </Link>
            と
            <Link href="/about" className="underline hover:text-slate-600">
              このサイトについて
            </Link>
            に書いています。
          </p>
        </section>
        <nav
          aria-label="前後の年"
          className="mt-10 flex flex-wrap gap-5 text-sm"
        >
          {adjacentYears.map((y) => (
            <Link
              key={y}
              href={`/houi/${y}`}
              className="underline hover:text-slate-600"
            >
              {y}年の方位
            </Link>
          ))}
          <Link href="/houi" className="underline hover:text-slate-600">
            {HOUI_BREADCRUMB_LABEL}に戻る
          </Link>
        </nav>
        <ContentDisclaimer />
      </article>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdBanner } from "@/components/ads/AdBanner";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import {
  buildMonthlyCalendar,
  calendarMonths,
  weekdayLabel,
  directionListLabel,
} from "@/lib/monthlyCalendar";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { STAR_MEANINGS } from "@/lib/kigakuMeanings";
import { BreadcrumbJsonLd } from "@/components/JsonLd";

/**
 * 「その月に引越すなら何日か」を月ごとにまとめた記事ページ。
 *
 * 日取りの検索は月が変わるたびに繰り返し起きるのに、これまで入口が
 * /calendar のツールしか無かった。操作しないと何も出ないので、検索から
 * 来た人がそのまま読める形が要る。暦だけで決まる情報を静的に置く。
 */

function parseMonth(slug: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(slug);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (!calendarMonths().some((c) => c.year === year && c.month === month)) {
    return null;
  }
  return { year, month };
}

export function generateStaticParams() {
  return calendarMonths().map((c) => ({
    month: `${c.year}-${String(c.month).padStart(2, "0")}`,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ month: string }>;
}): Promise<Metadata> {
  const parsed = parseMonth((await params).month);
  if (!parsed) return {};
  const { year, month } = parsed;
  const cal = buildMonthlyCalendar(year, month);
  const days = cal.recommended.map((d) => `${d.day}日`).join("・");

  const title = `${year}年${month}月の引越しに向く日`;
  const description =
    cal.recommended.length > 0
      ? `${year}年${month}月で引越しに向くのは${days}。大安・天赦日・一粒万倍日と土用を突き合わせた一覧です。本命星ごとの吉方位も併記しています。`
      : `${year}年${month}月は、六曜と土用を突き合わせると引越しに向く日がありません。理由と、前後の月の候補を載せています。`;

  return {
    title,
    description,
    alternates: { canonical: `/calendar/${year}-${String(month).padStart(2, "0")}` },
    openGraph: {
      images: ["/ogp.png"],
      title,
      description,
      type: "article",
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const parsed = parseMonth((await params).month);
  if (!parsed) notFound();
  const { year, month } = parsed;
  const cal = buildMonthlyCalendar(year, month);
  const slug = `${year}-${String(month).padStart(2, "0")}`;

  const all = calendarMonths();
  const idx = all.findIndex((c) => c.year === year && c.month === month);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const slugOf = (c: { year: number; month: number }) =>
    `${c.year}-${String(c.month).padStart(2, "0")}`;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "引越しの日取りを選ぶ", path: "/calendar" },
          { name: `${year}年${month}月`, path: `/calendar/${slug}` },
        ]}
      />
      <article className="max-w-[820px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/calendar" className="hover:text-rose-600">
            引越しの日取りを選ぶ
          </Link>
          <span className="mx-2">/</span>
          <span>
            {year}年{month}月
          </span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {year}年{month}月の引越しに向く日
        </h1>

        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          {cal.recommended.length > 0 ? (
            <>
              {year}年{month}月で引越しに向くのは
              <b>{cal.recommended.map((d) => `${d.day}日`).join("・")}</b>
              です。六曜で避けられる仏滅・赤口を外し、大安あるいは天赦日・
              一粒万倍日が重なる日を挙げています。
            </>
          ) : (
            <>
              {year}年{month}月は、六曜と土用を突き合わせると、条件を満たす日が
              ありませんでした。前後の月もあわせてご検討ください。
            </>
          )}
          {cal.doyou && (
            <>
              {" "}
              なお<b>
                {cal.doyou.start}から{cal.doyou.end}まで
              </b>
              は土用にあたります。土いじりや基礎に関わることは避けるとされ、
              間日を除いて候補から外しています。
            </>
          )}
        </p>

        {/* 中宮の星でその月の色合いが決まる。月ごとに必ず変わる情報なので、
            どの月を見ているのかが文章からも分かるようにする。 */}
        <p className="mt-4 text-sm leading-relaxed text-slate-700">
          この期間の中宮は<b>{STAR_NAMES[cal.centerStar]}</b>（
          {STAR_MEANINGS[cal.centerStar]?.keywords}）です。中宮の星は、その月
          全体に乗る色合いを表すとされます。
          {STAR_MEANINGS[cal.centerStar]?.good}
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            引越しに向く日
          </h2>
          {cal.recommended.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {cal.recommended.map((d) => (
                <div
                  key={d.date}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold font-serif">
                      {month}月{d.day}日（{weekdayLabel(d.weekday)}）
                    </span>
                    <span className="text-xs font-bold text-emerald-800">
                      {d.rokuyo}
                    </span>
                  </div>
                  {d.luckyLabels.length > 0 && (
                    <p className="mt-2 text-xs text-emerald-900">
                      {d.luckyLabels.join("・")}
                    </p>
                  )}
                  {d.inDoyou && d.isMabi && (
                    <p className="mt-1 text-[11px] text-emerald-800">
                      土用の期間ですが間日にあたるため、障りは無いとされます。
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              この月に条件を満たす日はありません。
            </p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            本命星ごとの吉方位（{cal.termStart}〜{cal.termEnd}）
          </h2>
          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            日取りが決まっても、向きが凶であれば意味がありません。
            九星気学の月は暦の1日ではなく<b>節入り</b>で替わるため、この月盤が
            効くのは<b>{cal.termStart}から{cal.termEnd}まで</b>です。中宮は
            {STAR_NAMES[cal.centerStar]}。
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-500">
                  <th className="py-2 pr-3 whitespace-nowrap">本命星</th>
                  <th className="py-2 pr-3 whitespace-nowrap">吉方位</th>
                  <th className="py-2 whitespace-nowrap">避けたい方位</th>
                </tr>
              </thead>
              <tbody>
                {cal.starDirections.map((s) => (
                  <tr key={s.star} className="border-b border-slate-200">
                    <td className="py-2 pr-3 font-bold whitespace-nowrap">
                      <Link
                        prefetch={false}
                        href={`/houi/${year}/${s.star}/${month}`}
                        className="hover:text-rose-600 hover:underline"
                      >
                        {s.starName}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-emerald-800">
                      {directionListLabel(s.good)}
                    </td>
                    <td className="py-2 text-rose-800">
                      {s.bad.map((b) => `${b.jp}（${b.label}）`).join("、") ||
                        "なし"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            本命星が分からないときは
            <Link href="/houi" className="text-rose-600 hover:underline">
              生まれ年から引ける早見表
            </Link>
            をご覧ください。天中殺は生年月日ごとに決まるため、この表には
            含めていません。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            {month}月の暦
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-500">
                  <th className="py-2 pr-3 whitespace-nowrap">日</th>
                  <th className="py-2 pr-3 whitespace-nowrap">六曜</th>
                  <th className="py-2 whitespace-nowrap">暦注</th>
                </tr>
              </thead>
              <tbody>
                {cal.days.map((d) => (
                  <tr
                    key={d.date}
                    className={`border-b border-slate-100 ${
                      d.inDoyou && !d.isMabi ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {d.day}日（{weekdayLabel(d.weekday)}）
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{d.rokuyo}</td>
                    <td className="py-1.5 text-slate-600">
                      {[
                        ...d.luckyLabels,
                        d.inDoyou ? (d.isMabi ? "土用（間日）" : "土用") : null,
                      ]
                        .filter(Boolean)
                        .join("・") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            自分の生年月日で確かめる
          </h2>
          <p className="mt-3 text-xs text-amber-900 leading-relaxed">
            このページは暦だけで決まる情報をまとめたものです。天中殺と本命殺は
            生年月日で変わり、方位は出発地から見た向きで決まります。
            日取りと方位を自分の条件で確かめるには、生年月日と現住地を入れて
            ください。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/calendar"
              className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
            >
              生年月日を入れて吉日を出す
            </Link>
            <Link
              href="/relocation/arbitrage"
              className="px-5 py-2.5 rounded-full border border-amber-300 bg-white text-amber-900 font-bold text-xs hover:border-amber-500 transition-colors"
            >
              方位から物件を探す
            </Link>
          </div>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            ほかの月
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {all.map((c) => {
              const s = slugOf(c);
              const current = c.year === year && c.month === month;
              return (
                <Link
                  prefetch={false}
                  key={s}
                  href={`/calendar/${s}`}
                  className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                    current
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-slate-300 bg-white text-slate-700 hover:border-rose-400"
                  }`}
                >
                  {c.year}年{c.month}月
                </Link>
              );
            })}
          </div>
          <div className="mt-5 flex justify-between text-xs">
            {prev ? (
              <Link
                href={`/calendar/${slugOf(prev)}`}
                className="text-rose-600 hover:underline"
              >
                ← {prev.year}年{prev.month}月
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={`/calendar/${slugOf(next)}`}
                className="text-rose-600 hover:underline"
              >
                {next.year}年{next.month}月 →
              </Link>
            )}
          </div>
        </section>

        <ContentDisclaimer />
      </article>
    </>
  );
}

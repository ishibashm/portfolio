import Link from "next/link";
import { AdBanner } from "@/components/ads/AdBanner";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { calendarMonths, calendarMonthSlug } from "@/lib/calendarMonths";
import { STAR_NAMES, contentYears } from "@/lib/kigakuContent";
import type { CalendarDay } from "@/lib/monthlyCalendar";
import { coreRouteLabel } from "@/lib/siteStructure";
import {
  eraYearLabel,
  periodLabel,
  yearDayLabel,
  yearlyCalendarFaq,
  type YearlyCalendar,
} from "@/lib/yearlyCalendar";

/**
 * 年間の日取り一覧（/calendar/2027）。
 *
 * 月別の頁（/calendar/2027-03）を 12 枚開かないと分からなかった
 * 「その年の天赦日はいつか」「いつ動けるか」を 1 枚で答える。
 * 数字はすべて `buildYearlyCalendar` の集計から出し、ここでは数えない。
 */

const SEASONS = ["冬", "春", "夏", "秋"];

function dayList(days: CalendarDay[], mark?: (d: CalendarDay) => string) {
  if (days.length === 0) return "—";
  return days.map((d) => `${d.day}日${mark ? mark(d) : ""}`).join("・");
}

export function YearCalendarView({ cal }: { cal: YearlyCalendar }) {
  const { year } = cal;
  const faq = yearlyCalendarFaq(cal);
  const usableTensha = cal.tensha.filter((t) => t.usable);
  // 月別の頁は今月から 18 か月ぶんしか無い。無い月へはリンクしない。
  const monthPages = new Set(calendarMonths().map(calendarMonthSlug));
  const monthSlug = (month: number) =>
    `${year}-${String(month).padStart(2, "0")}`;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "引越しの日取りを選ぶ", path: "/calendar" },
          { name: `${year}年`, path: `/calendar/${year}` },
        ]}
      />
      <FaqJsonLd items={faq} />
      {/* 幅は全画面で 1700px に揃える。 */}
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/calendar" className="hover:text-rose-600">
            引越しの日取りを選ぶ
          </Link>
          <span className="mx-2">/</span>
          <span>{year}年</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {eraYearLabel(year)}の天赦日・一粒万倍日と、引越しに向く日
        </h1>

        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          {year}年の天赦日は<b>{cal.tensha.length}日</b>、一粒万倍日は
          <b>{cal.totals.ichiryumanbai}日</b>、大安は<b>{cal.totals.taian}日</b>
          あります。天赦日のうち、仏滅・赤口と重ならず土用（間日を除く）にも掛からないのは
          <b>
            {usableTensha.length > 0
              ? usableTensha.map((t) => yearDayLabel(t.day)).join("、")
              : "0日"}
          </b>
          {usableTensha.length > 0
            ? `の${usableTensha.length}日です。`
            : "です。"}
          同じ条件で大安・一粒万倍日まで広げると、引越しに向く日は年間で
          <b>{cal.totals.recommended}日</b>になります。
        </p>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          このページは、月ごとの頁と同じ計算を1年ぶん並べたものです。日の吉は誰にとっても同じですが、方位は本命星と出発地で変わります。日が決まったら、向きは別に確かめてください。
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            {year}年の天赦日
          </h2>
          <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-slate-600">
            天赦日は季節（節月）と日の干支の組み合わせで決まり、年に5〜6回あります。暦の上で最上の吉日とされますが、六曜や土用とは別に決まるため、仏滅や土用と重なる年もあります。右端の列は、このサイトの「引越しに向く日」に入るかどうかです。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs text-slate-500">
                  <th className="py-2 pr-3 whitespace-nowrap">日付</th>
                  <th className="py-2 pr-3 whitespace-nowrap">六曜</th>
                  <th className="py-2 pr-3 whitespace-nowrap">重なる暦注</th>
                  <th className="py-2 whitespace-nowrap">引越しの候補</th>
                </tr>
              </thead>
              <tbody>
                {cal.tensha.map((t) => (
                  <tr key={t.day.date} className="border-b border-slate-200">
                    <td className="py-2 pr-3 font-bold whitespace-nowrap">
                      {yearDayLabel(t.day, false)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {t.day.rokuyo}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {[
                        ...t.day.luckyLabels.filter((l) => l !== "天赦日"),
                        t.day.inDoyou
                          ? t.day.isMabi
                            ? "土用（間日）"
                            : "土用"
                          : null,
                      ]
                        .filter(Boolean)
                        .join("・") || "—"}
                    </td>
                    <td
                      className={`py-2 ${t.usable ? "text-emerald-800 font-bold" : "text-rose-800"}`}
                    >
                      {t.usable ? "入る" : `入らない（${t.reason}）`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            決まり方と、方位の凶を打ち消さない理由は
            <Link
              href="/blog/tensha-and-ichiryumanbai-for-moving-day"
              className="text-rose-600 hover:underline"
            >
              天赦日・一粒万倍日は引越しの日取りにどう関係するのか
            </Link>
            に書いています。
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            月ごとの引越しに向く日・一粒万倍日・大安
          </h2>
          <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-slate-600">
            「引越しに向く日」は、仏滅・赤口を外し、土用は間日以外を外したうえで、大安か天赦日・一粒万倍日が重なる日です。月の名前から、その月の六曜と干支の一覧、本命星ごとの吉方位へ進めます。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-500">
                  <th className="py-2 pr-3 whitespace-nowrap">月</th>
                  <th className="py-2 pr-3">引越しに向く日</th>
                  <th className="py-2 pr-3">一粒万倍日</th>
                  <th className="py-2">大安</th>
                </tr>
              </thead>
              <tbody>
                {cal.months.map((m) => {
                  const slug = monthSlug(m.month);
                  return (
                    <tr
                      key={m.month}
                      className="border-b border-slate-200 align-top"
                    >
                      <td className="py-2 pr-3 font-bold whitespace-nowrap">
                        {monthPages.has(slug) ? (
                          <Link
                            prefetch={false}
                            href={`/calendar/${slug}`}
                            className="text-rose-600 hover:underline"
                          >
                            {m.month}月
                          </Link>
                        ) : (
                          `${m.month}月`
                        )}
                      </td>
                      <td className="py-2 pr-3 text-emerald-800">
                        {dayList(m.recommended, (d) =>
                          d.luckyLabels.includes("天赦日") ? "（天赦日）" : "",
                        )}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {dayList(m.ichiryumanbai)}
                      </td>
                      <td className="py-2 text-slate-700">
                        {dayList(m.taian)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            一粒万倍日と大安の列は暦のままの一覧で、仏滅・赤口や土用と重なる日も含みます。候補にするのは左の「引越しに向く日」の列です。
          </p>
        </section>

        <section className="mt-10 grid gap-8 xl:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
              {year}年の土用
            </h2>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
              {cal.doyou.map((p, i) => (
                <li key={p.start}>
                  <b>{SEASONS[i] ?? ""}の土用</b>：{periodLabel(p)}
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-slate-600">
              立春・立夏・立秋・立冬の前のおよそ18日間です。土を動かすことや移転を避けるとされ、間日を除いて候補から外しています。期間と方位の凶の違いは
              <Link
                href="/blog/doyou-and-doyousatsu"
                className="text-rose-600 hover:underline"
              >
                土用と土用殺は何が違う？
              </Link>
              にあります。
            </p>
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
              {year}年に、日を選んでも変わらない方位
            </h2>
            <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
              {year}年の年盤は<b>{STAR_NAMES[cal.centerStar]}</b>が中宮です。
              {cal.sharedBad.length > 0 ? (
                <>
                  <b>
                    {cal.sharedBad
                      .map((b) => `${b.jp}（${b.label}）`)
                      .join("・")}
                  </b>
                  は本命星に関係なく凶とされ、天赦日でも変わりません。
                </>
              ) : (
                "五黄土星が中宮にあるため、五黄殺と暗剣殺の方位はありません。"
              )}
              本命星ごとの吉方位は年の早見表にまとめています。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/houi/${year}`}
                className="px-4 py-2 rounded-full border border-slate-300 bg-white text-slate-800 font-bold text-xs hover:border-rose-400 transition-colors"
              >
                {year}年の吉方位・凶方位を本命星別に見る
              </Link>
              <Link
                href="/houi/relocation-calendar"
                className="px-4 py-2 rounded-full border border-slate-300 bg-white text-slate-800 font-bold text-xs hover:border-rose-400 transition-colors"
              >
                生年月日から引越しできる期間を出す
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            よくある質問
          </h2>
          <dl className="mt-4 grid gap-5 xl:grid-cols-2">
            {faq.map((f) => (
              <div
                key={f.question}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <dt className="text-sm font-bold text-slate-900">
                  {f.question}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-700">
                  {f.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            自分の生年月日で確かめる
          </h2>
          <p className="mt-3 max-w-[70ch] text-xs text-amber-900 leading-relaxed">
            このページは暦だけで決まる情報をまとめたものです。天中殺と本命殺は生年月日で変わり、方位は出発地から見た向きで決まります。日取りと方位を自分の条件で確かめるには、生年月日と現住地を入れてください。
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
              {coreRouteLabel("/relocation/arbitrage")}
            </Link>
          </div>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
            ほかの年
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {contentYears().map((y) => (
              <Link
                prefetch={false}
                key={y}
                href={`/calendar/${y}`}
                className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                  y === year
                    ? "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-slate-300 bg-white text-slate-700 hover:border-rose-400"
                }`}
              >
                {y}年
              </Link>
            ))}
          </div>
        </section>

        <ContentDisclaimer />
      </article>
    </>
  );
}

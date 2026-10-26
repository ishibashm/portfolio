import Link from "next/link";
import type { Metadata } from "next";
import { TenchusatsuChecker } from "@/components/houi/TenchusatsuChecker";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { PractitionerStrip } from "@/components/practitioners/PractitionerStrip";
import { AdBanner } from "@/components/ads/AdBanner";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { pageOpenGraph } from "@/lib/siteUrl";
import { currentYearInJapan } from "@/lib/kigakuContent";
import { calendarMonths, calendarMonthSlug } from "@/lib/calendarMonths";
import { monthBranches, timelineByGroup } from "@/lib/tenchusatsuTimeline";
import { TENCHUSATSU_GROUP_NAMES, nextVoidYears } from "@/lib/tenchusatsuLite";
import { todayInJapan } from "@/utils/japanDate";

/**
 * 天中殺 × 引越し の判定 LP。
 *
 * 月表（節入りで替わる月の支）はサーバーで lunar-javascript から計算し、
 * client には 6 グループぶんの真偽値だけを渡す。生年月日 → グループは
 * 日柱の算術（tenchusatsuLite）で client 側で即時に出す。
 * 月が替わるので 1 日ごとに作り直す。
 */
export const revalidate = 86400;

const TITLE = "天中殺の引越しはいつならいい？生年月日で今年・向こう3年を判定";
const DESCRIPTION =
  "生年月日を入れるだけで、あなたの天中殺（子丑・寅卯・辰巳・午未・申酉・戌亥）と、今年・今月が天中殺かを即判定。向こう3年の天中殺の月と、6つの天中殺の早見表も。";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | Cloud Palette` },
  description: DESCRIPTION,
  alternates: { canonical: "/houi/tenchusatsu" },
  openGraph: pageOpenGraph("/houi/tenchusatsu", TITLE, DESCRIPTION),
};

/** 月の支 → おおよその暦月（節入りから翌月の節入り前まで） */
const BRANCH_MONTH: Record<string, number> = {
  寅: 2,
  卯: 3,
  辰: 4,
  巳: 5,
  午: 6,
  未: 7,
  申: 8,
  酉: 9,
  戌: 10,
  亥: 11,
  子: 12,
  丑: 1,
};

const FAQ = [
  {
    question: "天中殺の期間に引越しをしてはいけませんか？",
    answer:
      "天中殺の期間は新しく始める動きを避けるとされ、自分から選ぶ引越しは時期をずらすのが無難とされます。転勤など本人の意思でない移動は影響が軽いとする考え方もあります。",
  },
  {
    question: "天中殺はどうやって決まりますか？",
    answer:
      "生まれた日の干支（日柱）で6つのグループ（子丑・寅卯・辰巳・午未・申酉・戌亥）に分かれます。グループの2つの十二支に当たる年（2年間）と月（年に2か月）が天中殺です。",
  },
  {
    question: "天中殺の月はいつからいつまでですか？",
    answer:
      "月の十二支は暦月の1日ではなく節入り（毎月4〜8日ごろ）で替わります。年の天中殺は立春（2月4日ごろ）で切り替わります。",
  },
  {
    question: "天中殺と吉方位はどちらを優先しますか？",
    answer:
      "天中殺は時期の問題、吉方位は方向の問題で別のものです。天中殺の期間は吉方位でも効果が出にくいとされるため、まず天中殺を外した時期を選び、その中で吉方位と日取りを選ぶのが一般的です。",
  },
];

export default function Page() {
  const year = currentYearInJapan();
  const today = todayInJapan();
  const startMonth = Number(today.slice(5, 7));
  const tl = monthBranches(year, startMonth, 36);
  const byGroup = timelineByGroup(tl);
  const calSlugs = new Set(calendarMonths().map(calendarMonthSlug));
  const months = tl.map((m) => {
    const slug = calendarMonthSlug(m);
    return {
      year: m.year,
      month: m.month,
      calendarHref: calSlugs.has(slug) ? `/calendar/${slug}` : null,
    };
  });

  return (
    <div className="wg-page min-h-screen font-sans text-slate-900">
      <FaqJsonLd items={FAQ} />
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: "天中殺と引越し", path: "/houi/tenchusatsu" },
        ]}
      />
      <article className="mx-auto max-w-[1700px] px-5 py-12">
        <nav className="mb-6 text-xs text-slate-500">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <span>天中殺と引越し</span>
        </nav>
        <h1 className="font-serif text-3xl font-bold leading-snug tracking-tight md:text-4xl">
          天中殺の引越し判定（{year}年〜）
        </h1>
        <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          生年月日を入れると、あなたの天中殺と、今年・今月が天中殺かがすぐ分かります。天中殺の期間は自分から選ぶ引越しを避け、時期をずらすのが無難とされます。
        </p>

        <section className="wg-card mt-6 p-5">
          <TenchusatsuChecker
            months={months}
            byGroup={byGroup}
            currentYear={year}
          />
        </section>

        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            天中殺中にどうしても引越す場合
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-amber-900">
            <li>
              <b>方位</b>
              ：吉方位を選び、五黄殺・暗剣殺は誰にとっても凶なので必ず外す（
              <Link href="/houi" className="underline hover:text-rose-700">
                本命星と吉方位
              </Link>
              ）
            </li>
            <li>
              <b>日取り</b>：契約・入居日を天中殺の月から外す（
              <Link href="/calendar" className="underline hover:text-rose-700">
                日取りカレンダー
              </Link>
              ）
            </li>
            <li>
              <b>仮住まい</b>：天中殺が明けてから本格的に移る
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/relocation/timing" className="wg-btn-primary">
              引越し時期を全期間で分析する
            </Link>
            <Link href="/ask" className="wg-btn-accent">
              契約日が決まっている方はAIに相談
            </Link>
          </div>
        </section>

        <PractitionerStrip />

        <section className="mt-10">
          <h2 className="border-b border-slate-300 pb-2 font-serif text-xl font-bold">
            6つの天中殺の早見表
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TENCHUSATSU_GROUP_NAMES.map((g) => {
              const [a, b] = nextVoidYears(g, year);
              return (
                <div key={g} id={g} className="wg-card !rounded-2xl p-4">
                  <p className="font-serif text-lg font-bold">{g}天中殺</p>
                  <dl className="mt-2 grid grid-cols-[6em_1fr] gap-y-1 text-xs text-slate-700">
                    <dt className="font-bold">天中殺の年</dt>
                    <dd className="font-mono">
                      {a}・{b}年（次は{a + 12}・{b + 12}年）
                    </dd>
                    <dt className="font-bold">天中殺の月</dt>
                    <dd>
                      {g[0]}月・{g[1]}月（{BRANCH_MONTH[g[0]]}月・
                      {BRANCH_MONTH[g[1]]}月の節入り〜）
                    </dd>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="border-b border-slate-300 pb-2 font-serif text-xl font-bold">
            よくある質問
          </h2>
          <dl className="mt-4 space-y-4">
            {FAQ.map((f) => (
              <div key={f.question}>
                <dt className="text-sm font-bold">{f.question}</dt>
                <dd className="mt-1 max-w-[70ch] text-sm leading-relaxed text-slate-700">
                  {f.answer}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm">
            詳しくは
            <Link
              href="/blog/moving-during-tenchusatsu"
              className="mx-1 text-rose-600 underline hover:text-rose-700"
            >
              天中殺中の引越し
            </Link>
            と
            <Link
              href="/blog/houi-and-tenchusatsu"
              className="mx-1 text-rose-600 underline hover:text-rose-700"
            >
              方位と天中殺
            </Link>
            の記事へ。
          </p>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>
        <ContentDisclaimer />
      </article>
    </div>
  );
}

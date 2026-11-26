import { CurrentDirections } from "@/components/houi/CurrentDirections";
import { LineFriendLink } from "@/components/LineFriendLink";
import { AiExportBox } from "@/components/AiExportBox";
import type { Metadata } from "next";
import Link from "next/link";
import { buildTodayAiExport } from "@/lib/aiExportPages";
import { buildTodayDirections } from "@/lib/todayDirections";
import {
  HOUI_BREADCRUMB_LABEL,
  STAR_NAMES,
  getMonthlySummary,
} from "@/lib/kigakuContent";
import { pageOpenGraph, SITE_URL } from "@/lib/siteUrl";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { TodayFortunePanel } from "@/components/houi/TodayFortunePanel";
import { parseBirthYearParam } from "@/lib/todayWeather/birthYear";

// 生まれ年を searchParams から読むため、訪問ごとに描画される。
/*
  「今日の方位 時間別」「今日の吉方位 時間」で探す人の主ページ。
  検索語に合わせた言い方を題と説明文に置き、「真太陽時」は本文（刻の基準）へ回す。
  出発地と目的地で確かめる画面は /relocation/dashboard が受け持つ。
*/
const title =
  "今日の吉方位 時間別一覧｜十二支の時間帯ごとの方位と本命星別の早見表";
const description =
  "今日の吉方位を時間別の一覧で確認できます。子〜亥の十二支の時間帯ごとに、全員に避けたい方位と本命星ごとの吉方位を、開いてすぐ表で表示します。生まれ年を入れると自分の本命星の方位も出ます。日本時間の日付で更新。方位の吉凶は占い上の目安です。";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/houi/today" },
  openGraph: pageOpenGraph("/houi/today", title, description),
};
const list = (items: string[]) => items.join("・") || "なし";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TodayPage({ searchParams }: Props = {}) {
  const query = (await searchParams) ?? {};
  const birthYear = parseBirthYearParam(query.birthYear);
  const rawBirthYear = query.birthYear;
  const invalidBirthYear =
    birthYear === null &&
    typeof rawBirthYear === "string" &&
    rawBirthYear.trim() !== "";
  const data = buildTodayDirections();
  const year = Number(data.date.slice(0, 4));
  const markdown = buildTodayAiExport({
    date: data.date,
    tomorrow: data.tomorrow,
    stars: data.stars,
    generatedAt: new Date(),
  });
  const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(`${SITE_URL}/houi/today`)}&text=${encodeURIComponent("今日の吉方位と時間別の方位｜本命星別の早見表")}`;
  return (
    <main className="wg-page px-4 py-10 text-ink">
      <BreadcrumbJsonLd
        items={[
          { name: HOUI_BREADCRUMB_LABEL, path: "/houi" },
          { name: "今日の吉方位", path: "/houi/today" },
        ]}
      />
      <article className="mx-auto max-w-5xl space-y-6">
        <CurrentDirections />
        <header className="space-y-3">
          <h1 className="font-serif text-3xl font-bold">
            今日の吉方位 時間別一覧
          </h1>
          <p className="text-sm leading-relaxed">
            今日の吉方位は、本命星ごとの日盤と、十二支の刻（約2時間）ごとの時盤で決まります。下の表で、十二支ごとの時間別の方位を、本命星を選ばずに一覧できます。明日の方位も掲載しています。これは占い上の目安で、効果を保証するものではありません。
          </p>
          <details className="wg-card p-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              方位の判定と時間帯の基準
            </summary>
            <p className="mt-2 leading-relaxed">
              五黄殺・暗剣殺・日破は、本命星にかかわらず凶です。時盤が吉でも日盤の凶を優先します。時間帯は東京（東経139.6917度）の真太陽時で区切り、時刻は日本標準時で表示します。月命星と個人の天中殺は含みません。
            </p>
          </details>
          <p className="text-sm">
            出発地と目的地を入れて、行き先が今使えるかを確かめるときは
            <Link
              href="/relocation/dashboard"
              className="text-rose-600 underline"
            >
              出発地と目的地で方位を確かめる画面
            </Link>
            を使ってください。
          </p>
          <p className="text-sm text-slate-600">
            表示対象：<time dateTime={data.date}>{data.date}</time>
            （日本時間）
          </p>
          <Link href="/houi" className="inline-block text-rose-600 underline">
            本命星が分からない方はこちら
          </Link>
        </header>
        <section
          aria-labelledby="hours-overview-heading"
          className="wg-card space-y-3 p-5"
        >
          <h2 id="hours-overview-heading" className="text-xl font-bold">
            今日（{data.date}）の吉方位を時間別に見る
          </h2>
          <p className="text-sm leading-relaxed">
            十二支の時間帯ごとに、全員に避けたい方位と、本命星ごとの吉方位を並べました。本命星が分からない方は
            <Link href="/houi" className="text-rose-600 underline">
              本命星の早見
            </Link>
            で確かめてください。日盤の凶は時盤の吉より優先するため、吉の欄には日盤で凶の方位を入れていません。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
              <caption className="sr-only">
                今日の時間帯別の方位（全員に避けたい方位と本命星別の吉方位）
              </caption>
              <thead>
                <tr className="border-b">
                  <th
                    scope="col"
                    className="sticky left-0 bg-theme-surface p-2"
                  >
                    刻・日本時間
                  </th>
                  <th scope="col" className="p-2">
                    時盤中宮
                  </th>
                  <th scope="col" className="min-w-[12rem] p-2">
                    全員に避けたい方位
                  </th>
                  {data.stars.map((star) => (
                    <th
                      key={star.star}
                      scope="col"
                      className="min-w-[7rem] whitespace-nowrap p-2"
                    >
                      {STAR_NAMES[star.star]}の吉
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stars[0].hours.map((hour, index) => (
                  <tr
                    key={hour.branch}
                    className="border-b border-theme-border align-top"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 whitespace-nowrap bg-theme-surface p-2"
                    >
                      {hour.branch}
                      <br />
                      {hour.time}
                    </th>
                    <td className="whitespace-nowrap p-2">{hour.center}</td>
                    <td className="p-2">{list(hour.common.unlucky)}</td>
                    {data.stars.map((star) => (
                      <td key={star.star} className="p-2">
                        {list(star.hours[index].lucky)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-slate-600">
            時間帯は東京（東経139.6917度）の真太陽時で区切り、時刻は日本標準時で表示します。子の刻は前日から始まります。吉・凶に挙げていない方位は平です。表は横にスクロールできます。
          </p>
        </section>
        <TodayFortunePanel
          birthYear={birthYear}
          invalidBirthYear={invalidBirthYear}
          stars={data.stars}
        />
        <section aria-labelledby="stars-heading" className="space-y-3">
          <h2 id="stars-heading" className="text-xl font-bold">
            本命星別の日盤・時間帯
          </h2>
          <p className="text-sm">
            星の名前を押して開いてください。一般的な九星気学の本命星で見る早見表です。
          </p>
          {data.stars.map((star) => (
            <details key={star.star} name="honmei" className="wg-card p-4">
              <summary className="cursor-pointer font-bold text-rose-700">
                {star.name}
              </summary>
              <div className="mt-4 space-y-4 text-sm">
                <p>
                  <b>今日の吉：</b>
                  {list(star.today.lucky)}
                </p>
                <p>
                  <b>今日の凶：</b>
                  {list(star.today.unlucky)}
                </p>
                <p>
                  <b>平：</b>
                  {list(star.today.neutral)}
                </p>
                <h3 className="font-bold">十二支の時間帯と方位</h3>
                <p>
                  東京（東経139.6917度）の真太陽時で区切り、時刻は日本標準時で表示。子の刻は前日から始まります。時盤の吉でも、表示対象日の日盤が凶なら凶を優先します。
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <caption className="sr-only">
                      {star.name}の時間帯別方位（東京基準）
                    </caption>
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className="p-2">
                          刻・日本時間
                        </th>
                        <th scope="col" className="p-2">
                          時盤中宮
                        </th>
                        <th scope="col" className="p-2">
                          吉
                        </th>
                        <th scope="col" className="p-2">
                          凶
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {star.hours.map((hour) => (
                        <tr
                          key={hour.branch}
                          className="border-b border-theme-border align-top"
                        >
                          <th scope="row" className="p-2">
                            {hour.branch}
                            <br />
                            {hour.time}
                          </th>
                          <td className="p-2">{hour.center}</td>
                          <td className="p-2">{list(hour.lucky)}</td>
                          <td className="p-2">{list(hour.unlucky)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600">
                  吉・凶に挙げていない方位は平です。時盤は既存の時計と同じ簡易算出です。場所に合わせた時間帯は
                  <Link
                    href="/relocation/dashboard"
                    className="text-rose-600 underline"
                  >
                    方位と時刻の画面
                  </Link>
                  で確認できます。
                </p>
                <h3 className="font-bold">{year}年の月ごとの吉方位・凶方位</h3>
                <p className="text-xs text-slate-600">
                  月盤（節入り〜翌節入り前）の早見表です。五黄殺・暗剣殺は全員の凶に含みます。
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <caption className="sr-only">
                      {star.name}の{year}年 月別の方位
                    </caption>
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className="p-2">
                          月
                        </th>
                        <th scope="col" className="p-2">
                          吉
                        </th>
                        <th scope="col" className="p-2">
                          凶
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {getMonthlySummary(year, star.star).map((row) => (
                        <tr
                          key={row.month}
                          className="border-b border-theme-border align-top"
                        >
                          <th scope="row" className="p-2">
                            <Link
                              href={`/houi/${year}/${star.star}/${row.month}`}
                              className="text-rose-600 underline"
                            >
                              {row.month}月
                            </Link>
                          </th>
                          <td className="p-2">{list(row.good)}</td>
                          <td className="p-2">{list(row.bad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="font-bold">明日（{data.tomorrow}）の予告</h3>
                <p>
                  <b>吉：</b>
                  {list(star.tomorrow.lucky)}
                </p>
                <p>
                  <b>凶：</b>
                  {list(star.tomorrow.unlucky)}
                </p>
              </div>
            </details>
          ))}
        </section>
        <p className="text-sm text-slate-600">
          引越しなど長期の移動は、年盤・月盤も合わせて確認してください。
        </p>
        <p className="text-sm">
          日盤と時間帯の表の関係、刻の境目が地域でずれる理由は
          <Link
            href="/blog/todays-lucky-direction-by-hour"
            className="text-rose-600 underline"
          >
            今日の吉方位と時間帯はどう読むか
          </Link>
          にまとめています。
        </p>
        <AiExportBox markdown={markdown} />
        <nav
          aria-label="日取りと共有"
          className="wg-card flex flex-wrap gap-4 p-5 text-sm text-rose-700 underline"
        >
          <Link href="/calendar">カレンダーで日取りを見る</Link>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
            Xで共有する
          </a>
          <Link href="/profile/mcp">AIから確認する（MCP設定）</Link>
        </nav>
        <p className="text-sm">
          <LineFriendLink />
        </p>
      </article>
    </main>
  );
}

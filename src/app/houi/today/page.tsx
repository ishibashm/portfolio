import type { Metadata } from "next";
import Link from "next/link";
import { buildTodayDirections } from "@/lib/todayDirections";
import { HOUI_BREADCRUMB_LABEL, getMonthlySummary } from "@/lib/kigakuContent";
import { pageOpenGraph, SITE_URL } from "@/lib/siteUrl";
import { BreadcrumbJsonLd } from "@/components/JsonLd";

export const revalidate = 3600;
const title = "今日の吉方位と時間｜本命星別の日盤・十二支の早見表";
const description =
  "今日と明日の吉方位・凶方位を本命星別に確認。五黄殺・暗剣殺・日破は全員に凶として表示し、十二支ごとの時間帯も一覧で見られます。日本時間の日付で更新。";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/houi/today" },
  openGraph: pageOpenGraph("/houi/today", title, description),
};
const list = (items: string[]) => items.join("・") || "なし";

export default function TodayPage() {
  const data = buildTodayDirections();
  const year = Number(data.date.slice(0, 4));
  const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(`${SITE_URL}/houi/today`)}&text=${encodeURIComponent("今日の吉方位と時間｜本命星別の早見表")}`;
  return (
    <main className="wg-page px-4 py-10 text-slate-900">
      <BreadcrumbJsonLd
        items={[
          { name: HOUI_BREADCRUMB_LABEL, path: "/houi" },
          { name: "今日の吉方位", path: "/houi/today" },
        ]}
      />
      <article className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <h1 className="font-serif text-3xl font-bold">今日の吉方位と時間</h1>
          <p className="font-bold">
            本命星を選ぶと、今日の吉方位と避けたい方位が分かります。
          </p>
          <p className="text-sm">
            五黄殺・暗剣殺・日破は、本命星にかかわらず凶です。
          </p>
          <p className="text-sm text-slate-600">
            表示対象：<time dateTime={data.date}>{data.date}</time>
            （日本時間・Asia/Tokyo）。約1時間ごとに更新され、日付変更後は前日の表示が残る場合があります。
          </p>
          <Link href="/houi" className="inline-block text-rose-600 underline">
            本命星が分からない方はこちら
          </Link>
        </header>
        <section aria-labelledby="stars-heading" className="space-y-3">
          <h2 id="stars-heading" className="text-xl font-bold">
            本命星別の日盤・時間帯
          </h2>
          <p className="text-sm">
            星の名前を押して開いてください。一般的な九星気学の本命星で見る早見表です。
          </p>
          {data.stars.map((star) => (
            <details
              key={star.star}
              name="honmei"
              open={star.star === 1}
              className="wg-card p-4"
            >
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
                          className="border-b border-slate-200 align-top"
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
                          className="border-b border-slate-200 align-top"
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
          本命星だけの早見表です。月命星・個人の天中殺は含みません。引越しは年盤・月盤も確認してください。方位の吉凶は伝統的な見方で、効果を保証するものではありません。
        </p>
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
      </article>
    </main>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { TodayStarTabs } from "@/components/houi/TodayStarTabs";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { AdBanner } from "@/components/ads/AdBanner";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageOpenGraph } from "@/lib/siteUrl";
import { todayInJapan } from "@/utils/japanDate";
import { calendarMonthSlug } from "@/lib/calendarMonths";
import {
  dayDirectionsByStar,
  formatJpDate,
  shiftJstDate,
  timeSlotsByStar,
} from "@/lib/todayDirections";

/**
 * 今日の吉方位と時間（公開・軽量版）。
 *
 * 個人の判定（生年月日・出発地・天中殺）は /relocation/dashboard が持つ。
 * ここは検索から来た人向けに、本命星ごとの日盤と刻を**サーバーで**
 * 計算して HTML で返す。暦エンジンは client に配らない。
 *
 * ISR: 1 時間ごとに作り直す。日付は JST で決めるので、0 時を過ぎて
 * 最初の再生成から翌日の内容になる（最大 1 時間の遅れ）。
 */
export const revalidate = 3600;

const TITLE = "今日の吉方位と時間【本命星別・九星気学の日盤】";
const DESCRIPTION =
  "今日の吉方位・凶方位（五黄殺・暗剣殺・日破）を本命星ごとに一覧。2時間ごとの動いてよい時間帯と、明日の予告も確認できます。毎日自動更新。";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | Cloud Palette` },
  description: DESCRIPTION,
  alternates: { canonical: "/houi/today" },
  openGraph: pageOpenGraph("/houi/today", TITLE, DESCRIPTION),
};

export default function Page() {
  const today = todayInJapan();
  const tomorrow = shiftJstDate(today, 1);
  const stars = dayDirectionsByStar(today);
  const slots = timeSlotsByStar(today);
  const next = dayDirectionsByStar(tomorrow);
  const monthSlug = calendarMonthSlug({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  });
  const shareText = encodeURIComponent(
    `${formatJpDate(today)}の吉方位（本命星別）`,
  );
  const shareUrl = encodeURIComponent("https://cloud-palette.com/houi/today");

  return (
    <div className="wg-page min-h-screen font-sans text-slate-900">
      <BreadcrumbJsonLd
        items={[
          { name: "方位の早見表", path: "/houi" },
          { name: "今日の吉方位と時間", path: "/houi/today" },
        ]}
      />
      <article className="mx-auto max-w-[1700px] px-5 py-12">
        <nav className="mb-6 text-xs text-slate-500">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <span>今日の吉方位</span>
        </nav>
        <h1 className="font-serif text-3xl font-bold leading-snug tracking-tight md:text-4xl">
          今日の吉方位と時間
        </h1>
        <p className="mt-2 font-mono text-sm text-slate-600">
          {formatJpDate(today)}（日本時間）
        </p>
        <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          本命星を選ぶと、今日の日盤での吉方位・凶方位と、2時間ごとの動いてよい時間帯が分かります。五黄殺・暗剣殺は本命星に関係なく全員の凶方位です。
        </p>

        <section className="wg-card mt-8 p-5">
          <TodayStarTabs stars={stars} slots={slots} />
          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            ※
            日盤だけの判定です。引越しは年盤・月盤も見ます。生年月日ごとの天中殺は含みません。時間帯は東京の経度で計算しています。
          </p>
        </section>

        <section className="mt-8">
          <h2 className="border-b border-slate-300 pb-2 font-serif text-xl font-bold">
            明日（{formatJpDate(tomorrow)}）の吉方位
          </h2>
          <ul className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            {next.map((s) => (
              <li key={s.star} className="wg-card !rounded-2xl p-3">
                <b className="font-serif">{s.name}</b>：
                {s.good.length ? s.good.map((g) => g.jp).join("・") : "なし"}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 flex flex-wrap gap-3">
          <Link href={`/calendar/${monthSlug}`} className="wg-btn-primary">
            今月の引越し日取りカレンダー
          </Link>
          <Link href="/relocation/dashboard" className="wg-btn-accent">
            生年月日と現在地で個人判定する
          </Link>
          <a
            href={`https://x.com/intent/post?text=${shareText}&url=${shareUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="wg-chip"
          >
            Xで共有
          </a>
          <Link href="/profile/mcp" className="wg-chip">
            AI（MCP）から毎朝チェックする
          </Link>
        </section>

        <div className="mt-10">
          <AdBanner />
        </div>
        <ContentDisclaimer />
      </article>
    </div>
  );
}

import React from "react";
import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";
import Link from "next/link";
import { CosmicCalendar } from "@/components/widgets/CosmicCalendar";
import { Calendar } from "lucide-react";
import { AuspiciousDayFinder } from "@/components/relocation/AuspiciousDayFinder";
import { FavoriteDaysPanel } from "@/components/relocation/FavoriteDaysPanel";
import { calendarMonths, calendarMonthSlug } from "@/lib/calendarMonths";
import { contentYears } from "@/lib/kigakuContent";
import { coreRouteLabel } from "@/lib/siteStructure";
import { TwinkleStars } from "@/components/motion/TwinkleStars";

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-background text-ink font-sans relative overflow-hidden flex flex-col">
      {/* 他ページと同じ淡いオーラ。暗い背景を前提にした発光をそのまま
          明るい背景に載せると色が濁るため、同じ配色に合わせている。 */}
      <div className="fixed top-[-10vw] left-[-10vw] w-[40vw] h-[40vw] bg-theme-accent-soft rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10vw] right-[-10vw] w-[40vw] h-[40vw] bg-theme-gold-soft rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* 幅は全画面で 1700px に揃える。 */}
      <main className="max-w-[1700px] w-full mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header className="relative mb-12 p-6 md:p-8 rounded-3xl border border-theme-border bg-theme-surface backdrop-blur-xl shadow-lg shadow-[color:var(--wg-shadow)] overflow-hidden">
          {/* Cyber Decorative Lines */}
          <div
            className="absolute top-0 left-0 w-full h-[1px] opacity-70"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--wg-accent) 30%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-theme-border to-transparent" />
          {/* 夜空の小さな星（飾り）。見出しの右側の余白にだけ置く。 */}
          <TwinkleStars className="right-0 top-0 h-full w-1/2 sm:w-2/5" />
          <div
            className="absolute top-0 left-8 w-[1px] h-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--wg-accent) 50%, transparent)",
            }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: "var(--wg-accent)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: "var(--wg-accent)" }}
                  />
                </span>
                <span
                  className="text-xs font-mono tracking-widest uppercase font-semibold flex items-center gap-1.5"
                  style={{ color: "var(--wg-accent)" }}
                >
                  <Calendar className="w-3.5 h-3.5" />{" "}
                  六曜・天赦日・一粒万倍日・月相
                </span>
              </div>
              {/* グラデーションを bg-clip-text + text-transparent で流し込むと、
                  Chromium が backdrop-filter 配下でラスタライズした際に
                  タイトルを横切る継ぎ目を描くことがある（/trends で実際に起きた）。
                  同じ書き方なので、ここも単色にしておく。 */}
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-ink font-serif">
                引越しの日取りを選ぶ
              </h1>
              <p className="text-ink-muted mt-3 max-w-2xl text-sm md:text-base leading-relaxed">
                契約・搬出入・入居の日を決めるためのカレンダーです。六曜、天赦日、一粒万倍日、月相を日ごとに突き合わせて表示します。
              </p>
              {/* 「時期を選ぶ」道具は 2 本ある。役割の違いを両方の冒頭に
                  書かないと、どちらを開けばいいか初見で分からない
                  （/relocation/timing 側にも対になる案内がある）。 */}
              <p className="text-ink-muted mt-2 max-w-2xl text-xs leading-relaxed">
                ここは<b>暦注で日を確かめる</b>
                画面です。方位ごとの吉凶の段階評価で先に候補日を絞るときは
                <Link
                  href="/relocation/timing"
                  className="mx-1 font-semibold text-accent underline"
                >
                  引越し時期の分析
                </Link>
                を使ってください。
              </p>
            </div>
          </div>
        </header>

        {/* 入力なしで読める結論と年・月別一覧。
            三盤ツール（生年月日・出発地が必要）より前に置き、
            検索や初見の人がすぐ暦の基準と各年・各月の一覧へ進めるようにする。 */}
        <section className="mb-10 rounded-3xl border border-theme-border bg-theme-surface p-6 md:p-8 shadow-lg shadow-[color:var(--wg-shadow)]">
          <h2 className="text-lg font-bold font-serif">
            引越しに向く日の基準と年・月別一覧
          </h2>
          <p className="mt-3 text-sm text-ink leading-relaxed">
            このサイトの「引越しに向く日」は、
            <b>
              仏滅・赤口を外し、土用は間日以外を外したうえで、大安か天赦日・一粒万倍日が重なる日
            </b>
            です。年別・月別一覧は入力なしで読めます。
          </p>
          <p className="mt-3 text-sm text-ink leading-relaxed">
            暦や方位の吉凶は<b>占い上の目安</b>
            であり、出来事や効果を保証するものではありません。五黄殺・暗剣殺・歳破などの凶方位は天赦日でも変わりません。引越しの費用や予約の都合は、暦の話とは分けて考えてください。
          </p>
          <p className="mt-3 text-xs text-ink-muted leading-relaxed">
            <Link
              href="/houi"
              className="mx-1 font-semibold text-accent underline hover:decoration-2"
            >
              本命星と吉方位の早見表
            </Link>
          </p>

          <div className="mt-6">
            <h3 className="text-sm font-bold font-serif text-ink">
              年間の引越し吉日・天赦日一覧
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {contentYears().map((year) => (
                <Link
                  prefetch={false}
                  key={year}
                  href={`/calendar/${year}`}
                  className="px-3 py-1.5 rounded-full border border-theme-border bg-theme-surface text-xs font-bold text-ink hover:border-accent"
                >
                  {year}年の年間一覧
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-bold font-serif text-ink">
              月ごとの引越しに向く日
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              候補日と本命星別の吉方位を掲載しています。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {calendarMonths().map((c) => (
                <Link
                  prefetch={false}
                  key={calendarMonthSlug(c)}
                  href={`/calendar/${calendarMonthSlug(c)}`}
                  className="px-3 py-1.5 rounded-full border border-theme-border bg-theme-surface text-xs font-bold text-ink hover:border-accent"
                >
                  {c.year}年{c.month}月
                </Link>
              ))}
            </div>
          </div>
        </section>

        <ActiveProfileBadge purpose="吉日と暦" className="mb-6" />

        {/* 手順の説明だけでは日付が決まらない。実際に三盤を重ねて
            候補日を出すところまでをこのページで完結させる。 */}
        <AuspiciousDayFinder />

        {/* 表の ☆ で残した日（端末の localStorage だけ）。出した日取りの
            すぐ下に置き、走査をやり直さなくても見返せるようにする。 */}
        <FavoriteDaysPanel />

        <details className="mb-10 rounded-3xl border border-theme-border bg-theme-surface p-6 md:p-8 shadow-lg shadow-[color:var(--wg-shadow)]">
          <summary className="cursor-pointer text-lg font-bold font-serif">
            引越しの日取りの決め方
          </summary>
          <ol className="mt-4 text-sm text-ink leading-relaxed list-decimal pl-5 space-y-2">
            <li>
              <b>自分の本命星</b>を確認する。生まれ年から引けます（
              <Link href="/houi" className="underline hover:text-accent">
                早見表
              </Link>
              ）。
            </li>
            <li>
              <b>年盤</b>
              でその年の吉方位を確認する。五黄殺・暗剣殺・歳破・本命殺に当たる方位は避けます。
            </li>
            <li>
              <b>月盤</b>
              で、動く月の吉方位を確認する。年盤で吉でも月盤で凶になることがあります。
            </li>
            <li>
              <b>天中殺</b>
              の期間に当たっていないか確認する。生年月日ごとに決まり、本命星では分かりません。この期間は方位に関係なく移転を避けるという考え方があります。
            </li>
            <li>
              そのうえで、このカレンダーで<b>日の吉凶</b>
              を見て候補日を絞ります。
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/houi"
              className="px-5 py-2.5 rounded-full border border-theme-border bg-theme-surface text-xs font-bold hover:border-accent"
            >
              本命星と吉方位を調べる
            </Link>
            <Link
              href="/relocation/arbitrage"
              className="px-5 py-2.5 rounded-full bg-accent hover:brightness-110 text-on-accent text-xs font-bold"
            >
              {coreRouteLabel("/relocation/arbitrage")}
            </Link>
          </div>
        </details>

        {/* Calendar Widget
            他のブロックと同じ余白（mt-10）を与えてカードと重ならないようにする。 */}
        <div className="mt-10">
          <CosmicCalendar />
        </div>
      </main>
    </div>
  );
}

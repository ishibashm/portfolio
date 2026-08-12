"use client";

import React from "react";
import Link from "next/link";
import { CosmicCalendar } from "@/components/widgets/CosmicCalendar";
import { Calendar } from "lucide-react";
import { AuspiciousDayFinder } from "@/components/relocation/AuspiciousDayFinder";
import { calendarMonths, calendarMonthSlug } from "@/lib/calendarMonths";

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans relative overflow-hidden flex flex-col">
      {/* 他ページと同じ淡いオーラ。暗い背景を前提にした発光をそのまま
          明るい背景に載せると色が濁るため、同じ配色に合わせている。 */}
      <div className="fixed top-[-10vw] left-[-10vw] w-[40vw] h-[40vw] bg-rose-200/25 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10vw] right-[-10vw] w-[40vw] h-[40vw] bg-amber-200/25 rounded-full blur-[100px] pointer-events-none -z-10" />

      <main className="max-w-[1400px] w-full mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header className="relative mb-12 p-6 md:p-8 rounded-3xl border border-slate-300 bg-white/95 backdrop-blur-xl shadow-lg shadow-slate-200/50 overflow-hidden">
          {/* Cyber Decorative Lines */}
          <div
            className="absolute top-0 left-0 w-full h-[1px] opacity-70"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent, #10b981) 30%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
          <div
            className="absolute top-0 left-8 w-[1px] h-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-accent, #10b981) 50%, transparent)",
            }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                </span>
                <span
                  className="text-xs font-mono tracking-widest uppercase font-semibold flex items-center gap-1.5"
                  style={{ color: "var(--color-accent, #10b981)" }}
                >
                  <Calendar className="w-3.5 h-3.5" /> 六曜・天赦日・一粒万倍日・月相
                </span>
              </div>
              {/* グラデーションを bg-clip-text + text-transparent で流し込むと、
                  Chromium が backdrop-filter 配下でラスタライズした際に
                  タイトルを横切る継ぎ目を描くことがある（/trends で実際に起きた）。
                  同じ書き方なので、ここも単色にしておく。 */}
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-stone-900 font-serif">
                引越しの日取りを選ぶ
              </h1>
              <p className="text-stone-600 mt-3 max-w-2xl text-sm md:text-base leading-relaxed">
                契約・搬出入・入居の日を決めるためのカレンダーです。六曜、天赦日、一粒万倍日、月相を日ごとに突き合わせて表示します。
              </p>
            </div>
          </div>
        </header>

        {/* 手順の説明だけでは日付が決まらない。実際に三盤を重ねて
            候補日を出すところまでをこのページで完結させる。 */}
        <AuspiciousDayFinder />

        <section className="mb-10 rounded-3xl border border-slate-300 bg-white/95 p-6 md:p-8 shadow-lg shadow-slate-200/50">
          <h2 className="text-lg font-bold font-serif">引越しの日取りの決め方</h2>
          <p className="mt-3 text-sm text-slate-700 leading-relaxed">
            日取りは、暦の吉凶だけでは決まりません。方位と組み合わせて絞り込みます。一般的には次の順で見ていきます。
          </p>
          <ol className="mt-4 text-sm text-slate-700 leading-relaxed list-decimal pl-5 space-y-2">
            <li>
              <b>自分の本命星</b>を確認する。生まれ年から引けます（
              <Link href="/houi" className="underline hover:text-rose-600">
                早見表
              </Link>
              ）。
            </li>
            <li>
              <b>年盤</b>でその年の吉方位を確認する。五黄殺・暗剣殺・歳破・本命殺に当たる方位は避けます。
            </li>
            <li>
              <b>月盤</b>で、動く月の吉方位を確認する。年盤で吉でも月盤で凶になることがあります。
            </li>
            <li>
              <b>天中殺</b>の期間に当たっていないか確認する。生年月日ごとに決まり、本命星では分かりません。この期間は方位に関係なく移転を避けるという考え方があります。
            </li>
            <li>
              そのうえで、このカレンダーで<b>日の吉凶</b>を見て候補日を絞ります。
            </li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/houi"
              className="px-5 py-2.5 rounded-full border border-slate-300 bg-white text-xs font-bold hover:border-rose-400 transition-colors"
            >
              本命星と吉方位を調べる
            </Link>
            <Link
              href="/relocation/arbitrage"
              className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
            >
              物件を方位で探す
            </Link>
          </div>
          <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
            六曜や天赦日は暦の考え方であり、科学的に効果が確認されたものではありません。引越し業者の料金は大安や土日に上がる傾向があるため、費用を優先するか暦を優先するかは分けて考えてください。
          </p>
        </section>

        {/* 月ごとのまとめ。
            上のツールは生年月日を入れないと自分の結果が出ないが、
            「9月に引越すなら何日か」を先に知りたい人もいる。
            暦だけで決まる情報を月別ページに置いてあるので、そこへ渡す。 */}
        <section className="w-full max-w-4xl mx-auto mt-10 rounded-3xl border border-slate-200 bg-white/80 p-6">
          <h2 className="text-lg font-bold font-serif">月ごとの引越しに向く日</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            生年月日を入れずに読める、月ごとのまとめです。六曜・天赦日・一粒万倍日と土用を突き合わせた候補日と、本命星9つそれぞれの吉方位を載せています。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {calendarMonths().map((c) => (
              <Link
                prefetch={false}
                key={calendarMonthSlug(c)}
                href={`/calendar/${calendarMonthSlug(c)}`}
                className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:border-rose-400 transition-colors"
              >
                {c.year}年{c.month}月
              </Link>
            ))}
          </div>
        </section>

        {/* Calendar Widget */}
        <CosmicCalendar />
      </main>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";
import { AdBanner } from "@/components/ads/AdBanner";
import { QuickProfileBar } from "@/components/home/QuickProfileBar";
import {
  CORE_ROUTES,
  ROUTE_GROUPS,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/siteStructure";

export default function Home() {
  // Prevent browser auto-scrolling to bottom on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 relative flex flex-col items-center justify-start overflow-y-auto py-8 px-4 md:px-8 gap-8 font-sans">
      
      {/* Background Soft Glow Auras */}
      <div className="fixed top-[-10vw] left-[-10vw] w-[40vw] h-[40vw] bg-rose-200/25 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10vw] right-[-10vw] w-[40vw] h-[40vw] bg-amber-200/25 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* サイトが何をするところかを最初に言い切る。
          以前は「知性と感性をかさねるポータル」で、3つのサブドメイン
          （占い・株トレンド・ナレッジベース）へのランチャーになっていた。 */}
      {/* 各ブロックの幅の上限。以前は 1000px で、4K を縦置きした画面
          （幅 1800px 前後）では左右に 400px ずつ余っていた。中身の主役は
          下のダッシュボードなので、そこが収まる幅まで広げる。
          本文の行長は段落側の max-w-[70ch] が守る。 */}
      <header className="w-full max-w-[1700px] bg-white/95 backdrop-blur-xl border border-slate-300 p-8 md:p-10 rounded-3xl shadow-lg shadow-slate-200/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-200">
            <Compass className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold tracking-widest text-slate-500 uppercase">
            {SITE_NAME}
          </span>
        </div>
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-slate-900 font-serif leading-snug">
          {SITE_TAGLINE}
        </h1>
        <p className="text-sm text-slate-700 mt-4 leading-relaxed max-w-[70ch]">
          {SITE_DESCRIPTION}
        </p>
        <Link
          href={CORE_ROUTES[0].href}
          className="mt-6 inline-flex px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm items-center gap-2 transition-all shadow-md active:scale-95"
        >
          {CORE_ROUTES[0].label}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </header>

      {/* 生年月日・現在地・生まれたところ。**このサイトの答えはこの 3 つで
          決まる**ので、頁の一番上に置く。以前は下のダッシュボードの
          「1. プロフィール」タブの中にあり、開いた人はまず未入力のままの
          結果を見ていた（利用者の指摘）。 */}
      <QuickProfileBar />

      {/* 中核ページへの導線。siteStructure の定義がそのまま並ぶので、
          ナビ・メタデータ・llms.txt と説明がずれない。

          10 枚をフラットに並べると、似た名前の道具（時期を分析する／
          日取りを選ぶ など）の区別が付かない。意思決定の 3 つの問い
          （どこへ・いつ・いくら）で群にして、見出しを立てる。群の定義は
          siteStructure（サイドバーと同じもの）。 */}
      <div className="w-full max-w-[1700px] space-y-8">
        {ROUTE_GROUPS.map((g) => (
          <section key={g.key}>
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              {g.label}
            </h2>
            <p className="text-xs text-slate-600 mt-1">{g.note}</p>
            {/* 幅を広げたぶん、2 列のままだと 1 枚が 800px を超えて説明文が
                2 行しかない札が間延びする。広い画面では列を増やして、札の
                縦横比を今までの見え方に近づける。 */}
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {CORE_ROUTES.filter((r) => r.group === g.key).map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="group bg-white/95 backdrop-blur-xl border border-slate-300 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:border-rose-300 transition-all"
                >
                  <h3 className="text-base font-bold text-slate-900 font-serif flex items-center gap-2">
                    {r.label}
                    <ArrowRight className="w-4 h-4 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {r.summary}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* 「いまの方位と時刻」（SolarTimeClock）はここに埋め込んであったが、
          /relocation/dashboard に頁として移した。CORE_ROUTES の札から辿る。
          下までスクロールした人に約 1.2MB の JS（lunar-javascript を含む）を
          必ず配っていたのと、利用者の「重いし使い勝手が良くない」の指摘による。 */}

      {/* Monetization Native Ad Banner Unit */}
      <div className="w-full max-w-[1700px]">
        <AdBanner />
      </div>

      {/* Footer with Compliance & LLMO Links */}
      <footer className="w-full max-w-[1700px] flex flex-col sm:flex-row items-center justify-between py-6 px-4 text-xs font-semibold text-slate-600 border-t border-slate-300/80 gap-4">
        <div>
          © 2026 {SITE_NAME}. {SITE_TAGLINE}ためのサービスです。
        </div>
        <div className="flex flex-wrap items-center gap-4 text-slate-500">
          <Link href="/guide" className="hover:text-rose-600 transition-colors">
            使い方ガイド
          </Link>
          <span>•</span>
          {/*
            鑑定士の掲載は登録制で、掲載が 0 件のあいだは記事側の導線
            （PractitionerStrip）が何も描かない。ここに置いておかないと、
            登録したい人がページに辿り着けない。
          */}
          <Link
            href="/practitioners"
            className="hover:text-rose-600 transition-colors"
          >
            鑑定士の掲載
          </Link>
          <span>•</span>
          {/* 物件を貸したい・売りたい人の入口。鑑定士と同じで、ここに
              置いておかないと辿り着く道が無い（記事側の導線が無い）。 */}
          <Link
            href="/owners"
            className="hover:text-rose-600 transition-colors"
          >
            オーナーの方へ
          </Link>
          <span>•</span>
          <Link href="/about" className="hover:text-rose-600 transition-colors">
            このサイトについて
          </Link>
          <span>•</span>
          <Link href="/contact" className="hover:text-rose-600 transition-colors">
            お問い合わせ
          </Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-rose-600 transition-colors">
            プライバシーポリシー
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-rose-600 transition-colors">
            利用規約
          </Link>
          <span>•</span>
          <Link href="/llms.txt" target="_blank" className="hover:text-rose-600 transition-colors font-mono text-[11px]">
            AI Agent Spec (/llms.txt)
          </Link>
        </div>
      </footer>
    </div>
  );
}

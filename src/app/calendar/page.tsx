"use client";

import React from "react";
import { CosmicCalendar } from "@/components/widgets/CosmicCalendar";
import { Calendar } from "lucide-react";

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
                  <Calendar className="w-3.5 h-3.5" /> Planetary Orbit & Luck
                  Telemetry
                </span>
              </div>
              {/* グラデーションを bg-clip-text + text-transparent で流し込むと、
                  Chromium が backdrop-filter 配下でラスタライズした際に
                  タイトルを横切る継ぎ目を描くことがある（/trends で実際に起きた）。
                  同じ書き方なので、ここも単色にしておく。 */}
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-stone-900 font-serif">
                Cosmic Calendar
              </h1>
              <p className="text-stone-500 mt-3 max-w-2xl text-sm md:text-base font-light leading-relaxed">
                天体の軌道運動（月相・太陽黄経・惑星逆行）と伝統的な暦吉凶（六曜・一粒万倍日・天赦日）をリアルタイムにシミュレートし、最適な次善行動（NBA）を導出するカレンダーインターフェース。
              </p>
            </div>
          </div>
        </header>

        {/* Calendar Widget */}
        <CosmicCalendar />
      </main>
    </div>
  );
}

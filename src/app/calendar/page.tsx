"use client";

import React from "react";
import { CosmicCalendar } from "@/components/widgets/CosmicCalendar";
import { Calendar } from "lucide-react";

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[color-mix(in_srgb,var(--color-accent,#10b981)_30%,transparent)] font-sans relative overflow-hidden flex flex-col">
      {/* Background Liquid Glass Glows */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[120px] -z-10 pointer-events-none transition-all duration-1000"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--glow-color, #10b981) 8%, transparent)",
        }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] -z-10 pointer-events-none transition-all duration-1000"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-accent, #10b981) 6%, transparent)",
        }}
      />

      <main className="flex-grow max-w-[1400px] w-full mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header
          className="relative mb-12 p-6 md:p-8 rounded-2xl border bg-white/[0.01] backdrop-blur-md overflow-hidden"
          style={{
            borderColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Cyber Decorative Lines */}
          <div
            className="absolute top-0 left-0 w-full h-[1px] opacity-70"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent, #10b981) 30%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
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
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter bg-gradient-to-r from-white via-zinc-100 to-[color-mix(in_srgb,var(--color-accent,#10b981)_60%,white)] bg-clip-text text-transparent">
                Cosmic Calendar
              </h1>
              <p className="text-zinc-400 mt-3 max-w-2xl text-sm md:text-base font-light leading-relaxed">
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

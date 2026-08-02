"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { SubdomainLauncherGrid } from "@/domains/launcher";
import Link from "next/link";
import { LayoutDashboard, Sparkles, Heart } from "lucide-react";

const SolarTimeClock = dynamic(
  () => import("@/domains/metaphysical").then((mod) => mod.SolarTimeClock),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-80 flex items-center justify-center bg-stone-50/80 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2 text-slate-500 font-sans text-sm">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <span>Solar Time & Geomancy Engine ロード中...</span>
        </div>
      </div>
    ),
  }
);


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

      {/* Launcher Hub Header Navigation */}
      <header className="w-full max-w-[1400px] flex flex-col sm:flex-row items-center justify-between bg-white/95 backdrop-blur-xl border border-slate-300 p-5 rounded-3xl shadow-lg shadow-slate-200/50 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-200">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 font-serif">
              Cloud Palette Launcher
            </h1>
            <p className="text-xs font-semibold text-slate-700">自分らしく、心地よく。知性と感性をかさねるポータル</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-100/80 border border-rose-300 text-xs font-bold text-rose-700">
            <Heart className="w-3.5 h-3.5 fill-rose-600 text-rose-600" />
            <span>パーソナルスペース</span>
          </div>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <LayoutDashboard className="w-4 h-4" />
            ダッシュボードを開く
          </Link>
        </div>
      </header>

      {/* Subdomain Category Launcher Grid */}
      <div className="w-full max-w-[1400px]">
        <SubdomainLauncherGrid />
      </div>

      {/* Featured Core Engine: Solar Time Clock */}
      <div className="w-full max-w-[1400px] bg-white/95 backdrop-blur-xl border border-slate-300 rounded-3xl p-6 md:p-8 shadow-lg shadow-slate-200/50">
        <div className="mb-6 border-b border-slate-200 pb-4">
          <h2 className="text-xl font-bold text-slate-900 font-serif">Subdomain 1 Feature: Solar Time & Geomancy Engine</h2>
          <p className="text-xs font-semibold text-slate-700 mt-1">時間軸・方位・八字・生体磁気ログのリアルタイム可視化エンジン</p>
        </div>
        <div className="p-2 rounded-2xl bg-stone-50/80 border border-slate-200 shadow-inner">
          <SolarTimeClock />
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-[1400px] text-center py-6 text-xs font-semibold text-slate-600 border-t border-slate-300/80">
        © 2026 Cloud Palette. Engineered with care for personal intelligence.
      </footer>
    </div>
  );
}

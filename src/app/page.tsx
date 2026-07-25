import { SolarTimeClock } from "@/domains/metaphysical";
import { SubdomainLauncherGrid } from "@/domains/launcher";
import Link from "next/link";
import { LayoutDashboard, Sparkles, Heart } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 relative flex flex-col items-center justify-start overflow-y-auto py-8 px-4 md:px-8 gap-8 font-sans">
      
      {/* Background Soft Glow Auras */}
      <div className="fixed top-[-10vw] left-[-10vw] w-[40vw] h-[40vw] bg-rose-200/30 rounded-full blur-[100px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10vw] right-[-10vw] w-[40vw] h-[40vw] bg-amber-200/30 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* Launcher Hub Header Navigation */}
      <header className="w-full max-w-[1400px] flex flex-col sm:flex-row items-center justify-between bg-white/80 backdrop-blur-xl border border-rose-100/80 p-5 rounded-3xl shadow-xl shadow-rose-100/40 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-md shadow-rose-200">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 font-serif">
              Cloud Palette Launcher
            </h1>
            <p className="text-xs text-stone-500">自分らしく、心地よく。知性と感性をかさねるポータル</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-rose-50 border border-rose-200/60 text-xs font-semibold text-rose-600">
            <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
            <span>パーソナルスペース</span>
          </div>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
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
      <div className="w-full max-w-[1400px] bg-white/70 backdrop-blur-xl border border-rose-100/80 rounded-3xl p-6 md:p-8 shadow-xl shadow-rose-100/30">
        <div className="mb-6 border-b border-rose-100/60 pb-4">
          <h2 className="text-xl font-bold text-stone-900 font-serif">Subdomain 1 Feature: Solar Time & Geomancy Engine</h2>
          <p className="text-xs text-stone-500 mt-1">時間軸・方位・八字・生体磁気ログのリアルタイム可視化エンジン</p>
        </div>
        <div className="p-2 rounded-2xl bg-stone-950 text-white shadow-2xl">
          <SolarTimeClock />
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-[1400px] text-center py-6 text-xs text-stone-400 border-t border-stone-200/60">
        © 2026 Cloud Palette. Engineered with care for personal intelligence.
      </footer>
    </div>
  );
}

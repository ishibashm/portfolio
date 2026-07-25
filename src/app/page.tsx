import { SolarTimeClock } from "@/domains/metaphysical";
import { SubdomainLauncherGrid } from "@/domains/launcher";
import Link from "next/link";
import { LayoutDashboard, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050505] text-white relative flex flex-col items-center justify-start overflow-y-auto py-8 px-6 gap-8">
      {/* Launcher Hub Header Navigation */}
      <header className="w-full max-w-[1400px] flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              AI Asset Builder Launcher
            </h1>
            <p className="text-xs text-gray-400">Central Hub & Subdomain Portal</p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
        >
          <LayoutDashboard className="w-4 h-4" />
          Open Full Dashboard
        </Link>
      </header>

      {/* Subdomain Category Launcher Grid */}
      <div className="w-full max-w-[1400px]">
        <SubdomainLauncherGrid />
      </div>

      {/* Featured Core Engine: Solar Time Clock */}
      <div className="w-full max-w-[1400px]">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-200">Subdomain 1 Feature: Solar Time & Geomancy Engine</h2>
          <p className="text-xs text-gray-400">時間軸・方位・八字・生体磁気ログのリアルタイム可視化</p>
        </div>
        <SolarTimeClock />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { AlertTriangle, BookOpen, BrainCircuit, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Oracle Hub render error:", error);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-emerald-600/10 rounded-full blur-[150px] -z-10 pointer-events-none" />

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-8 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.3em] text-amber-300">
                Oracle Hub Safe Mode
              </p>
              <h1 className="text-3xl font-bold tracking-tight mt-2">
                ダッシュボードの一部データ取得を保護しました
              </h1>
              <p className="text-stone-500 leading-relaxed mt-3">
                外部APIまたは保存済みデータの読み込みで例外が発生しました。画面全体を落とさず、下の主要機能へ移動できます。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
            <button
              onClick={reset}
              className="px-4 py-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-100 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              再読み込み
            </button>
            <Link
              href="https://katmer.cloud-palette.com/brain"
              className="px-4 py-3 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-100 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Second Brain
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

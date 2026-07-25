import { NBADashboard } from "@/components/nba/NBADashboard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "メタフィジカル・システム | NBA意思決定エンジン",
  description:
    "生体データとマクロ環境データを統合した意思決定（次善行動）エンジン",
};

export default function MetaphysicalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 font-sans relative overflow-hidden flex flex-col">
      {/* Background Soft Aura Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-rose-200/30 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-amber-200/30 rounded-full blur-[150px] -z-10 pointer-events-none" />

      <nav className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 relative z-10 flex items-center">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors text-sm font-semibold bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-rose-100/80 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-rose-500" />
          ハブに戻る
        </Link>
      </nav>

      <main className="flex-1 relative z-10 flex items-start justify-center pt-4 pb-12">
        <NBADashboard />
      </main>
    </div>
  );
}

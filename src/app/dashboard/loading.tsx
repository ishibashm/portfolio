import { Loader2, Sparkles } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center font-sans relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-indigo-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen" />
      
      <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
        <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          <h2 className="text-xl font-medium tracking-widest uppercase text-white/90">
            Initializing Oracle Engine...
          </h2>
        </div>
        <p className="text-sm text-gray-500 font-light max-w-sm text-center mt-2">
          バイオメトリック・環境マクロ・占星術的タイミングを同期中...
        </p>
      </div>
    </div>
  );
}

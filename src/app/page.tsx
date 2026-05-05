import { SolarTimeClock } from "@/components/SolarTimeClock";
import Link from "next/link";
import { Database, Compass, MapPin } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 relative">
      <div className="absolute top-6 right-6 z-50 flex gap-4">
        <Link 
          href="/relocation/wealth" 
          className="px-6 py-3 bg-emerald-900/30 hover:bg-emerald-800/50 text-emerald-300 hover:text-emerald-200 text-xs font-bold tracking-widest uppercase rounded-full border border-emerald-500/50 md:backdrop-blur-md transition-all flex items-center gap-2.5 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:scale-105"
        >
          <MapPin size={14} className="animate-pulse" />
          <span>Relocation</span>
        </Link>
        <Link 
          href="/dashboard" 
          className="px-6 py-3 bg-zinc-900/30 hover:bg-zinc-800/50 text-zinc-300 hover:text-zinc-200 text-xs font-bold tracking-widest uppercase rounded-full border border-zinc-500/50 md:backdrop-blur-md transition-all flex items-center gap-2.5 shadow-[0_0_20px_rgba(161,161,170,0.2)] hover:shadow-[0_0_30px_rgba(161,161,170,0.4)] hover:scale-105"
        >
          <Database size={14} className="animate-pulse" />
          <span>Hub</span>
        </Link>
        <Link 
          href="/metaphysical" 
          className="px-6 py-3 bg-blue-900/30 hover:bg-blue-800/50 text-blue-300 hover:text-blue-200 text-xs font-bold tracking-widest uppercase rounded-full border border-blue-500/50 md:backdrop-blur-md transition-all flex items-center gap-2.5 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:scale-105"
        >
          <Compass size={14} className="animate-pulse" />
          <span>Metaphysical System</span>
        </Link>
      </div>
      <SolarTimeClock />
    </main>
  );
}

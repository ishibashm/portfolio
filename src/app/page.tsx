import { SolarTimeClock } from "@/components/SolarTimeClock";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 relative">
      <div className="absolute top-6 right-6 z-50 flex gap-4">
        <Link 
          href="/kb" 
          className="px-5 py-2.5 bg-blue-900/20 hover:bg-blue-800/40 text-blue-400 hover:text-blue-300 text-xs tracking-widest uppercase rounded-full border border-blue-800/50 md:backdrop-blur-md transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.15)] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]"
        >
          <span>Knowledge Base</span>
        </Link>
        <Link 
          href="/rentals" 
          className="px-5 py-2.5 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-400 text-xs tracking-widest uppercase rounded-full border border-zinc-800 md:backdrop-blur-md transition-all flex items-center gap-2 shadow-lg"
        >
          <span>Properties (工事中)</span>
        </Link>
      </div>
      <SolarTimeClock />
    </main>
  );
}

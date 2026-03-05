import { SolarTimeClock } from "@/components/SolarTimeClock";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 relative">
      <div className="absolute top-6 right-6 z-50">
        <Link 
          href="/defuddle" 
          className="px-5 py-2.5 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs tracking-widest uppercase rounded-full border border-zinc-800 backdrop-blur-md transition-all flex items-center gap-2 shadow-lg"
        >
          <span>Defuddle UI</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
      </div>
      <SolarTimeClock />
    </main>
  );
}

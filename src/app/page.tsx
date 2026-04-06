import { SolarTimeClock } from "@/components/SolarTimeClock";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 relative">
      <div className="absolute top-6 right-6 z-50">

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

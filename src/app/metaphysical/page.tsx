import { NBADashboard } from "@/components/nba/NBADashboard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Metaphysical System | NBA Engine",
  description: "Next Best Action engine using environmental and biometric data.",
};

export default function MetaphysicalPage() {
  return (
    <div className="min-h-screen bg-black selection:bg-indigo-500/30 font-sans relative overflow-hidden flex flex-col">
      {/* Background Glow Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-blue-600/10 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-emerald-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />
      
      <nav className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 relative z-10 flex items-center">
        <Link 
          href="/dashboard" 
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Hub
        </Link>
      </nav>

      <main className="flex-1 relative z-10 flex items-start justify-center pt-4 pb-12">
        <NBADashboard />
      </main>
    </div>
  );
}

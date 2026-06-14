"use client";

import dynamic from "next/dynamic";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// Dynamic import with SSR disabled is REQUIRED for react-force-graph due to Canvas/window usage
const SystemGraphViewer = dynamic(
  () => import("@/components/SystemGraphViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center p-20 min-h-[600px] border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-zinc-500">
          <Loader2 className="animate-spin text-blue-500" size={32} />
          <p className="font-medium">Initializing System Knowledge Graph...</p>
        </div>
      </div>
    ),
  },
);

export default function SystemGraphPage() {
  const [key, setKey] = useState(0);

  return (
    <div className="w-full flex-1 flex flex-col p-4 md:p-8 h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">System Map (Graphify)</h1>
        </div>
        <button
          onClick={() => setKey((prev) => prev + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw size={16} />
          Refresh Graph
        </button>
      </div>

      <div className="flex-1 w-full relative">
        <SystemGraphViewer key={key} />
      </div>
    </div>
  );
}

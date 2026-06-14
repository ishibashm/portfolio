"use client";

import dynamic from "next/dynamic";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

// Dynamic import with SSR disabled is REQUIRED for react-force-graph due to Canvas/window usage
const GraphViewer = dynamic(() => import("@/components/GraphViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center p-20 min-h-[600px] border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4 text-zinc-500">
        <Loader2 className="animate-spin text-blue-500" size={32} />
        <p className="font-medium">Initializing Knowledge Graph...</p>
      </div>
    </div>
  ),
});

export default function GraphPage() {
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
          <h1 className="text-2xl font-bold">Network Map</h1>
        </div>
        <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-md p-1">
          <Link
            href="/"
            className="px-4 py-1.5 text-sm font-medium rounded-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            List
          </Link>
          <div className="px-4 py-1.5 text-sm font-medium rounded-sm bg-white dark:bg-zinc-800 shadow-sm text-blue-600 dark:text-blue-400">
            Map
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <GraphViewer />
      </div>
    </div>
  );
}

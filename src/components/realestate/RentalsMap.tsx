"use client";

import dynamic from "next/dynamic";
import React from "react";
import type { RentalProperty } from "@/app/rentals/page";

// Dynamic import with SSR disabled to prevent Leaflet window reference errors
const RentalsMapInner = dynamic(() => import("./RentalsMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#050505] border border-zinc-900 rounded-2xl flex flex-col items-center justify-center font-mono text-xs text-zinc-500 animate-pulse gap-3 min-h-[400px]">
      <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      <span>[ 地図システムを読み込み中... ]</span>
    </div>
  ),
});

interface RentalsMapProps {
  properties: RentalProperty[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  hoveredPropertyId: string | null;
}

export function RentalsMap(props: RentalsMapProps) {
  return <RentalsMapInner {...props} />;
}

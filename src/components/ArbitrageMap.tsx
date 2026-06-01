"use client";

import dynamic from "next/dynamic";
import React from "react";

// Dynamic import with SSR disabled to prevent Leaflet window reference errors
const ArbitrageMapInner = dynamic(() => import("./ArbitrageMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#050505] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center font-mono text-xs text-zinc-500 animate-pulse">
      [ 地図システムを読み込み中... ]
    </div>
  ),
});

interface ScoredProperty {
  id: string;
  property_name: string;
  rent: number | null;
  management_fee: number | null;
  layout: string | null;
  size_sqm: any | null;
  is_new_build: boolean | null;
  minutes_to_station: number | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  building_age: number | null;
  floor: string | null;
  url: string | null;
  totalRent: number;
  propSqmRent: number;
  distanceKm: number | null;
  direction: string | null;
  astrologyStatus: string;
  astrologyScore: number;
  yieldScore: number;
  arbitrageScore: number;
}

interface ArbitrageMapProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  mapCenter?: [number, number];
  useTrueNorth: boolean;
  layerMode: string;
  radiusKm?: string;
  prefecture?: string;
  isTransitioningDate?: boolean;
  onDateChange?: (date: string) => void;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number; zoom: number }) => void;
}

export function ArbitrageMap(props: ArbitrageMapProps) {
  return <ArbitrageMapInner {...props} />;
}

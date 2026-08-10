"use client";

import dynamic from "next/dynamic";
import React from "react";

// Dynamic import with SSR disabled to prevent Leaflet window reference errors
const ArbitrageMapInner = dynamic(() => import("./ArbitrageMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-stone-100 border border-stone-200 rounded-2xl flex items-center justify-center font-mono text-xs text-stone-500 animate-pulse">
      [ 地図システムを読み込み中... ]
    </div>
  ),
});

import type { ScoredProperty } from "./ArbitrageMapInner";

interface ArbitrageMapProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  mapCenter?: [number, number];
  useTrueNorth: boolean;
  layerMode: string;
  radiusKm?: string;
  /** 全国を俯瞰しているか。県別の色分けを出すために広域表示を保つ */
  keepWideView?: boolean;
  /** 県名 → 出発地から見た方位とその日の吉凶段階（俯瞰の塗り分け用） */
  prefKigaku?: Record<
    string,
    {
      direction: string;
      directionLabel: string;
      tier: string;
      blocked: boolean;
    }
  >;
  /** 詳細パネルで開いている物件。地図でリング強調する */
  selectedPropertyId?: string | null;
  prefecture?: string;
  isTransitioningDate?: boolean;
  showListView?: boolean;
  useClassical?: boolean;
  onDateChange?: (date: string) => void;
  onBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
  }) => void;
}

export function ArbitrageMap(props: ArbitrageMapProps) {
  return <ArbitrageMapInner {...props} />;
}

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

import type { ScoredProperty } from "@/lib/scoredProperty";

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
  /** 8方位 → 選択日の吉凶段階（扇形の塗り分け用）。prefKigaku と同じ盤から切り出す */
  dirKigaku?: Record<
    string,
    {
      direction: string;
      directionLabel: string;
      tier: string;
      blocked: boolean;
    }
  >;
  /** prefKigaku が無いときの理由。俯瞰の凡例にそのまま出す */
  kigakuUnavailableReason?: string;
  /**
   * 県名 → 掲載件数。渡さないと静的ファイル（毎晩生成）の値になる。
   * 絞り込み中はページ側が数え直した値を渡す。
   */
  prefCounts?: Record<string, number>;
  /** 上が絞り込みを反映した値か。凡例の断り書きに使う */
  prefCountsFiltered?: boolean;
  /** 地図の空きを押したとき、その地点を判定へ送る */
  onInspectSpot?: (lat: number, lon: number) => void;
  /** 扇形が「いつの」判定かを示すための選択日 YYYY-MM-DD */
  targetDate?: string;
  /** 出発地が入力済みか。フォーカスの初期値と「出発地へ」ボタンに使う */
  hasBase?: boolean;
  /** mapCenter の意味。area=検索の起点 / spot=個別の物件 */
  focusKind?: "area" | "spot";
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

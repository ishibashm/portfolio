"use client";

import React, { useMemo } from "react";
import { calculateTenchusatsu } from "../utils/tenchusatsu";

interface TenchusatsuVisualizerProps {
  birthDateStr: string;
}

export const TenchusatsuVisualizer: React.FC<TenchusatsuVisualizerProps> = ({
  birthDateStr,
}) => {
  const data = useMemo(() => {
    try {
      const bDate = new Date(birthDateStr);
      if (isNaN(bDate.getTime())) return null;
      // Calculate for a 12-year window around the current year
      const currentYear = new Date().getFullYear();
      return calculateTenchusatsu(bDate, currentYear);
    } catch (e) {
      return null;
    }
  }, [birthDateStr]);

  if (!data) return null;

  const currentYear = new Date().getFullYear();
  const baseYear = currentYear - 3;
  const years = Array.from({ length: 8 }).map((_, i) => {
    const y = baseYear + i;
    const isVoid =
      data.previousVoidYears.includes(y) ||
      (y === currentYear && data.isYearTenchusatsu);
    return {
      year: y,
      status: isVoid ? "VOID" : "CLEAR",
    };
  });

  return (
    <div className="bg-white/80 rounded-sm shadow-lg border border-stone-200 p-4 max-w-4xl mt-4 w-full">
      <h3 className="text-[10px] uppercase font-mono tracking-widest text-stone-500 mb-4 border-b border-stone-200 pb-2 flex items-center gap-2">
        <span className="text-red-500 blur-[0.5px]">◆</span> Tenchusatsu (Void)
        Cycle Diagnostics / 天中殺周期の解読
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile */}
        <div className="bg-white/70 p-3 rounded-sm border border-stone-200 flex flex-col justify-center">
          <h4 className="font-semibold text-[9px] text-stone-400 uppercase tracking-widest mb-2 border-b border-stone-200 pb-1">
            Base Imprint (日干支)
          </h4>
          <dl className="space-y-1 text-sm font-mono">
            <div className="flex justify-between items-center">
              <dt className="text-stone-400 text-[10px]">Birth Date:</dt>
              <dd className="text-stone-600">{birthDateStr}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-stone-400 text-[10px]">Day Pillar (干支):</dt>
              <dd className="font-bold text-stone-600">{data.ganZhi}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-stone-400 text-[10px]">Void Zodiac Group:</dt>
              <dd className="text-red-500 font-bold tracking-widest">
                {data.tenchusatsu.name}
              </dd>
            </div>
          </dl>
          <div className="mt-3 text-[9px] text-stone-400 leading-tight">
            *
            算出された日干支から、あなたの人生におけるエネルギー欠落周期（天中殺）を特定しました。
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col justify-center">
          <div
            className={`p-4 rounded-sm border ${data.isYearTenchusatsu ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"} text-center flex flex-col gap-2`}
          >
            <span className="text-[10px] tracking-widest uppercase font-bold text-stone-400">
              Current Year Status ({currentYear})
            </span>
            {data.isYearTenchusatsu ? (
              <>
                <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-red-500 animate-pulse">
                  VOID PHASE
                </span>
                <span className="text-[10px] text-red-400/80">
                  現在は年の天中殺期間です。能動的な行動はリセットされやすい状態です。
                </span>
              </>
            ) : (
              <>
                <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-emerald-500">
                  CLEAR PHASE
                </span>
                <span className="text-[10px] text-emerald-400/80">
                  今年は天中殺の年ではありません。空間的な年単位の制約はクリアです。
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

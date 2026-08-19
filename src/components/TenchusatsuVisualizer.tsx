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
    /*
      幅の上限はここでは持たない。以前は max-w-4xl（896px）を自分で持って
      いて、外側を広げても効かず両端に余白が残っていた。置かれる側が
      列で幅を決める。
    */
    <div className="bg-white/80 rounded-sm shadow-lg border border-stone-200 p-4 mt-4 w-full h-full">
      <h3 className="text-[10px] uppercase font-mono tracking-widest text-stone-500 mb-4 border-b border-stone-200 pb-2 flex items-center gap-2">
        <span className="text-red-500 blur-[0.5px]">◆</span> Tenchusatsu (Void)
        Cycle Diagnostics / 天中殺周期の解読
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile */}
        <div className="bg-white/70 p-3 rounded-sm border border-stone-200 flex flex-col justify-center">
          <h4 className="font-semibold text-[9px] text-stone-600 uppercase tracking-widest mb-2 border-b border-stone-200 pb-1">
            Base Imprint (日干支)
          </h4>
          {/*
              左右に振る行は、収まらないときだけ 2 段にする。以前は
              flex-nowrap のまま縮めていたので、狭い列（タブレットで
              2 列に割れたとき）に「Void Zodiac / Group:」とラベルが
              割れ、値も「午未 (Uma-/Hitsuji)」と語中で折れていた。
              ラベルと値それぞれは割らせず（whitespace-nowrap）、
              入らなければ値ごと次の行へ落とす。落ちても右寄せのまま
              にするため ml-auto を付ける。
            */}
          <dl className="space-y-1 text-sm font-mono">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-stone-600 text-[10px] whitespace-nowrap">
                Birth Date:
              </dt>
              <dd className="text-stone-600 ml-auto whitespace-nowrap">
                {birthDateStr}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-stone-600 text-[10px] whitespace-nowrap">
                Day Pillar (干支):
              </dt>
              <dd className="font-bold text-stone-600 ml-auto whitespace-nowrap">
                {data.ganZhi}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-stone-600 text-[10px] whitespace-nowrap">
                Void Zodiac Group:
              </dt>
              <dd className="text-red-700 font-bold tracking-widest ml-auto whitespace-nowrap">
                {data.tenchusatsu.name}
              </dd>
            </div>
          </dl>
          <div className="mt-3 text-[9px] text-stone-600 leading-tight">
            *
            算出された日干支から、あなたの人生におけるエネルギー欠落周期（天中殺）を特定しました。
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col justify-center">
          <div
            className={`p-4 rounded-sm border ${data.isYearTenchusatsu ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"} text-center flex flex-col justify-center gap-2 h-full`}
          >
            <span className="text-[10px] tracking-widest uppercase font-bold text-stone-600">
              Current Year Status ({currentYear})
            </span>
            {data.isYearTenchusatsu ? (
              <>
                <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-red-500 animate-pulse">
                  VOID PHASE
                </span>
                {/* 以前は red-400/80。赤地（red-50）に対して約 1.9:1 で
                    読めなかった。red-700 で 5.9:1。 */}
                <span className="text-[10px] text-red-700">
                  現在は年の天中殺期間です。能動的な行動はリセットされやすい状態です。
                </span>
              </>
            ) : (
              <>
                <span className="text-xl md:text-2xl font-bold tracking-[0.2em] text-emerald-700">
                  CLEAR PHASE
                </span>
                <span className="text-[10px] text-emerald-700">
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

"use client";

import React, { useMemo, useState } from "react";
import { getDailySolarSchedule, KimonScheduleItem } from "../utils/solarTime";
import { KigakuBoard } from "./KigakuBoard";

interface SolarTimeTableProps {
  date: Date;
  longitude: number;
}

export function SolarTimeTable({ date, longitude }: SolarTimeTableProps) {
  const schedule = useMemo(
    () => getDailySolarSchedule(date, longitude),
    [date, longitude]
  );
  
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleRow = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

  const isVoidTimeHour = (item: KimonScheduleItem) => {
    return item.etoKanji === "午" || item.etoKanji === "未"; // 11:00 - 15:00
  };

  const isOptimalTimeHour = (item: KimonScheduleItem) => {
    const isGoodGate = item.hachimon.auspicious; // 生, 休, 開
    const isWoodFire = ["三碧木星", "四緑木星", "九紫火星"].includes(item.kyusei.japanese);
    return isGoodGate && isWoodFire;
  };

  return (
    <div className="w-full max-w-4xl mt-8">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2 mb-4">
        <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-zinc-400">
          Temporal Filter Matrix
        </h2>
        <div className="h-px bg-zinc-800 flex-grow"></div>
        <div className="text-[8px] font-mono text-zinc-600 tracking-widest">{date.toLocaleDateString()}</div>
      </div>

      <div className="overflow-x-auto custom-scrollbar border border-zinc-900 bg-black/60 shadow-2xl rounded-sm">
        <table className="w-full text-left font-mono text-[10px] whitespace-nowrap">
          <thead className="bg-zinc-950 text-zinc-500 uppercase tracking-widest border-b border-zinc-800 sticky top-0">
            <tr>
              <th className="px-3 py-2 font-normal w-12 text-center">STS</th>
              <th className="px-3 py-2 font-normal">Kimon</th>
              <th className="px-3 py-2 font-normal">Star (Qi)</th>
              <th className="px-3 py-2 font-normal">Gate (Filter)</th>
              <th className="px-3 py-2 font-normal text-right">Start</th>
              <th className="px-3 py-2 font-normal text-right">End</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {schedule.map((item, index) => {
               const now = new Date();
               const isCurrent = now >= item.startStandard && now < item.endStandard;
               const isExpanded = expandedIndex === index;
               const isVoid = isVoidTimeHour(item);
               const isOptimal = isOptimalTimeHour(item);
               
               let rowClass = "text-zinc-500 hover:bg-zinc-900/50 cursor-pointer transition-colors";
               let statusIcon = "○";
               let statusColor = "text-zinc-600";

               if (isVoid) {
                 rowClass = "bg-red-950/20 text-red-900/50 hover:bg-red-950/40 cursor-pointer";
                 statusIcon = "X";
                 statusColor = "text-red-600 animate-pulse";
               } else if (isOptimal) {
                 rowClass = "bg-emerald-950/10 text-emerald-400/80 hover:bg-emerald-950/30 cursor-pointer";
                 statusIcon = "●";
                 statusColor = "text-emerald-500 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]";
               }

               if (isCurrent && !isVoid) {
                 rowClass += " border-l-2 border-emerald-500 bg-zinc-900/80";
               } else if (isCurrent && isVoid) {
                 rowClass += " border-l-2 border-red-600 bg-red-950/60";
               }

               return (
                <React.Fragment key={index}>
                  <tr onClick={() => toggleRow(index)} className={rowClass}>
                    <td className={`px-3 py-2 text-center ${statusColor}`}>{statusIcon}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isVoid ? 'text-red-700' : (isCurrent ? 'text-zinc-200' : 'text-zinc-400')}`}>{item.etoKanji}</span>
                        <span className="opacity-50 tracking-wider">[{item.reading}]</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={isVoid ? 'opacity-40' : ''}>{item.kyusei.japanese}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`${isVoid ? 'opacity-40' : (item.hachimon.auspicious ? 'text-amber-500/80' : '')}`}>
                        {item.hachimon.japanese}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right opacity-80">{formatTime(item.startStandard)}</td>
                    <td className="px-3 py-2 text-right opacity-80">{formatTime(item.endStandard)}</td>
                  </tr>
                  
                  {isExpanded && !isVoid && (
                    <tr>
                      <td colSpan={6} className="bg-zinc-950 p-4 border-b border-zinc-800 shadow-inner">
                        <div className="flex flex-col items-center">
                           <div className="mb-2 text-center space-y-1">
                             <div className="text-[9px] text-zinc-600 uppercase tracking-widest">Kigaku Compass Matrix</div>
                             <div className="text-xs text-zinc-400 font-sans">{item.etoKanji} Hour ({item.kyusei.japanese} Center)</div>
                           </div>
                           <div className="scale-90 opacity-80"><KigakuBoard centerStar={item.kyusei} /></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {isExpanded && isVoid && (
                    <tr>
                      <td colSpan={6} className="bg-red-950/10 p-4 border-b border-red-900/30 text-center">
                        <div className="text-xs font-mono text-red-500 uppercase tracking-[0.2em] animate-pulse">
                           WARNING: System Bio-Shield Offline.
                        </div>
                        <div className="text-[9px] font-sans text-red-800/80 mt-1">
                           No favorable matrices available during void phase.
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

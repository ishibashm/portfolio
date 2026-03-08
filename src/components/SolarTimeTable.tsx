"use client";

import React, { useMemo, useState } from "react";
import { getDailySolarSchedule, KimonScheduleItem } from "../utils/solarTime";
import { KigakuBoard } from "./KigakuBoard";
import { BlockMath, InlineMath } from 'react-katex';

interface SolarTimeTableProps {
  date: Date;
  longitude: number;
  latitude: number | null;
  eot: number;
  kpIndex: number | null;
  xrayFlux: string | null;
  ansLoad: number;
  shieldCapacity: number;
  vectors?: Record<string, string> | null;
}

export function SolarTimeTableComponent({ 
  date, longitude, latitude, eot, kpIndex, xrayFlux, ansLoad, shieldCapacity, vectors
}: SolarTimeTableProps) {
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
    return item.japanese === "午" || item.japanese === "未"; // 11:00 - 15:00
  };

  const isOptimalTimeHour = (item: KimonScheduleItem) => {
    const isGoodGate = item.hachimon.auspicious; // 生, 休, 開
    const isWoodFire = ["三碧木星", "四緑木星", "九紫火星"].includes(item.kyusei.japanese);
    return isGoodGate && isWoodFire;
  };

  const handleDownloadCsv = () => {
    // Telemetry Header
    const telemetryHeaders = [
      "Record Date", date.toLocaleDateString(),
      "Time", date.toLocaleTimeString(),
      "Latitude", latitude?.toFixed(4) || "N/A",
      "Longitude", longitude.toFixed(4),
      "EoT (min)", eot.toFixed(2),
      "Kp-Index", kpIndex?.toFixed(2) || "N/A",
      "X-Ray Flux", xrayFlux || "N/A",
      "ANS Load %", ansLoad.toString(),
      "Shield Cap %", shieldCapacity.toString(),
      "---", "---",
      "Vector N", vectors?.[ "N" ] || "N/A",
      "Vector NE", vectors?.[ "NE" ] || "N/A",
      "Vector E", vectors?.[ "E" ] || "N/A",
      "Vector SE", vectors?.[ "SE" ] || "N/A",
      "Vector S", vectors?.[ "S" ] || "N/A",
      "Vector SW", vectors?.[ "SW" ] || "N/A",
      "Vector W", vectors?.[ "W" ] || "N/A",
      "Vector NW", vectors?.[ "NW" ] || "N/A"
    ];

    // Data Headers
    const headers = [
      "Eto", "Branch Name", "Stem Name", "Reading", 
      "Nine Stars", "Eight Gates", "Auspicious Gate", 
      "Void Time", "Standard Start", "Standard End"
    ];
    
    // Rows
    const rows = schedule.map((item) => [
      item.etoKanji,
      item.name,
      item.stemName,
      item.reading,
      item.kyusei.japanese,
      item.hachimon.japanese,
      item.hachimon.auspicious ? "Yes" : "No",
      isVoidTimeHour(item) ? "Yes (DANGER)" : "No",
      formatTime(item.startStandard),
      formatTime(item.endStandard),
    ]);

    // CSV Content
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // BOM for Excel
      telemetryHeaders.map(c => `"${c}"`).join(",") + "\n\n" +
      [headers, ...rows]
        .map((e) => e.map((c) => `"${c}"`).join(",")) // Quote fields
        .join("\n");

    // Download Link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = date.toLocaleDateString().replace(/\//g, "-");
    link.setAttribute("download", `temporal_matrix_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-4xl mt-8 flex flex-col gap-4">
      {/* HUD Header */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
           <h2 className="text-xs uppercase font-mono tracking-[0.3em] text-zinc-400">
             Temporal Filter Matrix / 時系空間フィルター
           </h2>
           <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1 py-0.5 ml-2">v2.4.1</span>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-[8px] font-mono text-zinc-600 tracking-widest hidden md:block">
              {date.toLocaleDateString()} / LON: {longitude.toFixed(4)}
           </div>
           <button
             onClick={handleDownloadCsv}
             className="px-3 py-1 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[9px] uppercase tracking-widest hover:bg-zinc-800 transition-colors"
           >
             Export CSV
           </button>
        </div>
      </div>

      {/* High Density Info Panel for Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[8px] font-mono leading-relaxed text-zinc-500 mb-2">
        <div className="bg-zinc-950/50 p-2 border border-blue-900/30">
           <strong className="text-blue-500 block mb-1">=== ALGORITHM: KIGAKU / MENJIA ===</strong>
           <p className="text-justify mb-1">
             本マトリックスは完全な生体電磁気的適合性に基づく時間窓を設定する。均時差（Equation of Time）を補正し、経度<InlineMath math={`${longitude.toFixed(2)}^\circ`} />における「真太陽時」を算出。干支・九星・八門の各磁束フィルターを時間軸に適用。
           </p>
           <p className="text-justify text-blue-400">
             【極短期的影響（時盤）】: 約2時間単位。当日のピンポイントな行動（出発時刻・重要会議の開始など）の成否に直結する即効性のレイヤー。
           </p>
        </div>
        <div className="bg-zinc-950/50 p-2 border border-red-900/30">
           <strong className="text-red-500 block mb-1">=== FILTER: VOID TIME PROHIBITION ===</strong>
           <p className="text-justify">
             午刻 (11:00-13:00) および未刻 (13:00-15:00) は「天中殺帯」として処理。この位相では地球の磁気シールドが自律神経周波数と同調外れを起こす。磁力線を垂直に切る物理移動（旅行/外出）は細胞レベルの深刻な電圧ギャップ（ANSショック）を引き起こすため全行動を凍結する。
           </p>
        </div>
        <div className="bg-zinc-950/50 p-2 border border-emerald-900/30">
           <strong className="text-emerald-500 block mb-1">=== FILTER: OPTIMAL DETOX WINDOW ===</strong>
           <p className="text-justify">
             緑色ハイライト：吉門（生/休/開）と木火の気（三碧/四緑/九紫）が共鳴する時間帯パラメータ。この位相は生体共鳴に特化した最適な「電位デルタ」を発生させ、細胞代謝と電気的デトックス（排出）を極限まで加速させる。
           </p>
        </div>
      </div>

      {/* The Matrix */}
      <div className="overflow-x-auto custom-scrollbar border border-zinc-900 bg-black/60 shadow-2xl rounded-sm">
        <table className="w-full text-left font-mono text-[10px] whitespace-nowrap">
          <thead className="bg-zinc-950 text-zinc-500 uppercase tracking-widest border-b border-zinc-800 sticky top-0">
            <tr>
              <th className="px-3 py-2 font-normal w-12 text-center">STS(判定)</th>
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
                             <div className="text-xs text-zinc-400 font-sans">{item.etoKanji}の刻 ({item.kyusei.japanese}中宮)</div>
                           </div>
                           <div className="scale-90 opacity-80"><KigakuBoard centerStar={item.kyusei} /></div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {isExpanded && isVoid && (
                    <tr>
                      <td colSpan={6} className="bg-red-950/10 p-4 border-b border-red-900/30 text-center">
                        <div className="text-xs font-mono text-red-500 uppercase tracking-[0.2em] animate-pulse mb-2">
                           WARNING: System Bio-Shield Offline.
                        </div>
                        <div className="text-[9px] font-sans text-red-800/80 max-w-xl mx-auto text-justify">
                           午・未の強力な電磁気結合は全球の方位ベクトル特性を上書き（オーバーライド）します。現在あなたの細胞ネットワークは地球共鳴基底周波数から完全に切り離されています。一切の空間移動、物理的・物質的追求・決断・交信を停止してください。CSVエクスポート等のバックアップ行動のみ許可されます。
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

export const SolarTimeTable = React.memo(SolarTimeTableComponent);

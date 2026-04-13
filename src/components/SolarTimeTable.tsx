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
  honmeiStar?: { physical: number; classical: number } | null;
  envData?: any;
  userEmail?: string | null;
}

export function SolarTimeTableComponent({ 
  date, longitude, latitude, eot, kpIndex, xrayFlux, ansLoad, shieldCapacity, vectors, honmeiStar, envData, userEmail
}: SolarTimeTableProps) {
  const schedule = useMemo(
    () => getDailySolarSchedule(date, longitude),
    [date, longitude]
  );
  
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "ishibashim@gmail.com"; 
  // 一時的なデバッグ措置：ログインしている（userEmailが存在する）状態であれば、一旦すべて表示するように制限を解除します。
  // （後ほど、ご指定のメールアドレス判明後に厳密な制限に再度設定します）
  const isAuthorized = process.env.NODE_ENV === 'development' || !!userEmail;

  const toggleRow = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });

  const isVoidTimeHour = (item: KimonScheduleItem) => {
    return item.japanese === "午" || item.japanese === "未"; // 11:00 - 15:00
  };

  const isOptimalTimeHour = (item: KimonScheduleItem) => {
    const isGoodGate = item.hachimon.auspicious; // 生, 休, 開
    
    // Dynamic Element Resonance (相生/相比) based on user's Honmei Star
    if (!honmeiStar || !honmeiStar.physical) return false;
    
    const getElement = (starNum: number) => {
       if (starNum === 1) return 'Water';
       if ([2, 5, 8].includes(starNum)) return 'Earth';
       if ([3, 4].includes(starNum)) return 'Wood';
       if ([6, 7].includes(starNum)) return 'Metal';
       if (starNum === 9) return 'Fire';
       return 'Earth'; // fallback
    };
    
    const myElement = getElement(honmeiStar.physical);
    const timeElement = getElement(item.kyusei.number || parseInt(item.kyusei.japanese.substring(0,1)) || 3);
    
    let isFavorable = false;
    if (myElement === timeElement) isFavorable = true; // Same element (相比)
    if (myElement === 'Wood' && ['Water', 'Fire'].includes(timeElement)) isFavorable = true;
    if (myElement === 'Fire' && ['Wood', 'Earth'].includes(timeElement)) isFavorable = true;
    if (myElement === 'Earth' && ['Fire', 'Metal'].includes(timeElement)) isFavorable = true;
    if (myElement === 'Metal' && ['Earth', 'Water'].includes(timeElement)) isFavorable = true;
    if (myElement === 'Water' && ['Metal', 'Wood'].includes(timeElement)) isFavorable = true;

    return isGoodGate && isFavorable;
  };

  const generateCsvString = () => {
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
      "Vector NW", vectors?.[ "NW" ] || "N/A",
      "---", "---",
      "Honmei Star (P)", honmeiStar?.physical?.toString() || "N/A",
      "Honmei Star (C)", honmeiStar?.classical?.toString() || "N/A",
      "Jupiter Lon", envData?.raw?.jupiterLon?.toFixed(2) || "N/A",
      "Lunar Lon", envData?.raw?.moonLon?.toFixed(2) || "N/A",
      "Solar Lon", envData?.raw?.sunLon?.toFixed(2) || "N/A",
      "---", "---",
      "STS Method", "True Solar Time (Verified)",
      "Engine Version", "v2.5.0-Tactical"
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
    return "data:text/csv;charset=utf-8,\uFEFF" + // BOM for Excel
      telemetryHeaders.map(c => `"${c}"`).join(",") + "\n\n" +
      [headers, ...rows]
        .map((e) => e.map((c) => `"${c}"`).join(",")) // Quote fields
        .join("\n");
  };

  const openPreview = () => {
    setPreviewContent(generateCsvString());
    setShowPreview(true);
  };

  const executeDownload = () => {
    const encodedUri = encodeURI(previewContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = date.toLocaleDateString().replace(/\//g, "-");
    link.setAttribute("download", `temporal_matrix_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowPreview(false);
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
           {isAuthorized && (
             <button
               onClick={openPreview}
               className="px-3 py-1 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[9px] uppercase tracking-widest hover:bg-zinc-800 transition-colors"
             >
               Review & Export AI Data
             </button>
           )}
        </div>
      </div>

      {/* Actionable Directives Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <div className="bg-emerald-950/20 border-l-2 border-emerald-500 p-2 md:p-3 shadow-inner">
           <div className="text-emerald-500 font-bold text-[10px] md:text-xs mb-1 tracking-widest uppercase flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> [ ACTION WINDOW ] 実行推奨帯
           </div>
           <p className="text-zinc-400 text-[9px] md:text-[10px] leading-relaxed font-sans text-justify">
              生体磁気と空間位相が最適化されるゴールデンタイム。重要な決断、交渉の開始、新しいプロジェクトの着手、および長距離移動（出発）に最も適した時間帯です。
           </p>
        </div>
        <div className="bg-red-950/20 border-l-2 border-red-500 p-2 md:p-3 shadow-inner">
           <div className="text-red-500 font-bold text-[10px] md:text-xs mb-1 tracking-widest uppercase flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span> [ VOID TIME ] 警告帯・行動凍結
           </div>
           <p className="text-zinc-400 text-[9px] md:text-[10px] leading-relaxed font-sans text-justify">
              地球の磁気シールドが乱れ、ヒューマンエラーや通信障害が多発する魔の時間帯（天中殺）。大きな決断、新規の開始、および長距離の物理的移動を完全に停止し、ルーチンワークに徹してください。
           </p>
        </div>
      </div>

      <details className="mb-4 bg-zinc-950/50 border border-zinc-800 text-[9px] font-mono text-zinc-500 group">
         <summary className="p-2 cursor-pointer hover:bg-zinc-900/50 list-none flex items-center justify-between uppercase tracking-widest">
            <div className="flex items-center gap-2">
               <span className="text-blue-500 blur-[0.5px]">◆</span> [ ALGORITHM ] 最適タイミングの分析ロジック
            </div>
            <span className="group-open:rotate-180 transition-transform">▼</span>
         </summary>
         <div className="p-3 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/50 text-[10px] leading-relaxed font-sans">
           <div className="p-2 border border-blue-900/30 rounded-sm">
              <strong className="text-blue-400 block mb-1 font-mono text-[9px]">◆ 1. 九星気学・環境方位</strong>
              <p className="text-zinc-400 text-justify">
                均時差を補正した「真太陽時」に基づき、その場所・その時間に流れる磁気的エネルギー（九星・八門）をリアルタイムに算出します。吉方位へ移動することで、引越し後の環境順化がスムーズになります。
              </p>
           </div>
           <div className="p-2 border border-red-900/30 rounded-sm">
              <strong className="text-red-400 block mb-1 font-mono text-[9px]">◆ 2. VOID TIME（天中殺）</strong>
              <p className="text-zinc-400 text-justify">
                天中殺（午刻・未刻など）は地球の磁気シールドと生体リズムが同調外れを起こす時間帯です。この時間帯での物理的移動や重要な決断（契約など）は、細胞レベルでの強い自律神経ストレスを招くため避けるべきです。
              </p>
           </div>
           <div className="p-2 border border-emerald-900/30 rounded-sm">
              <strong className="text-emerald-400 block mb-1 font-mono text-[9px]">◆ 3. OPTIMAL TIME（吉門）</strong>
              <p className="text-zinc-400 text-justify">
                緑色ハイライトは、吉門（生/休/開）とあなたの本命星が共鳴する「最適な移動タイミング」です。この時間帯に行動・移動を開始することで、肉体と環境の周波数が同調し、心身のデトックスと運気向上が見込めます。
              </p>
           </div>
         </div>
      </details>

      {/* Vertical Timeline Feed */}
      <div className="flex flex-col gap-3">
        {schedule.map((item, index) => {
           const now = new Date();
           const isCurrent = now >= item.startStandard && now < item.endStandard;
           const isExpanded = expandedIndex === index;
           const isVoid = isVoidTimeHour(item);
           const isOptimal = isOptimalTimeHour(item);
           
           const cardClass = isVoid ? "border-red-900/50 bg-red-950/20" 
                                    : isOptimal ? "border-emerald-900/50 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                    : "border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 transition-colors";
           
           return (
             <div key={index} className={`flex flex-col border ${cardClass} p-3 sm:p-5 rounded-md relative overflow-hidden`}>
                {/* Background Flavor text */}
                <div className="absolute right-[-10%] top-[-30%] text-[100px] sm:text-[140px] font-bold text-black/30 select-none z-0 tracking-tighter mix-blend-overlay pointer-events-none">
                   {item.etoKanji}
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-start justify-between relative z-10 gap-4">
                  <div className="flex flex-col">
                     <span className="text-xl sm:text-3xl font-mono text-zinc-100 font-bold tracking-widest drop-shadow-md">
                       {formatTime(item.startStandard)} - {formatTime(item.endStandard)}
                     </span>
                     <div className="flex items-center gap-3 mt-1 sm:mt-2">
                        <span className={`text-lg sm:text-xl font-bold ${isVoid ? 'text-red-500' : 'text-zinc-400'}`}>{item.etoKanji}の刻</span>
                        <span className="text-[10px] text-zinc-600 font-mono hidden sm:inline-block tracking-widest uppercase">[{item.reading}]</span>
                     </div>
                  </div>
                  
                  {/* Status Badge */}
                  <div className="flex-shrink-0 flex flex-col items-start sm:items-end">
                     {isVoid && <span className="bg-red-900/60 text-red-500 border border-red-500/80 px-4 py-1.5 font-bold text-sm sm:text-base tracking-widest md:animate-pulse shadow-md">[ NO-GO ] 行動凍結</span>}
                     {!isVoid && isOptimal && <span className="bg-emerald-900/60 text-emerald-400 border border-emerald-500/80 px-4 py-1.5 font-bold text-sm sm:text-base tracking-widest drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">[ GO ] 行動推奨</span>}
                     {!isVoid && !isOptimal && <span className="text-zinc-500 text-xs font-mono tracking-widest border border-zinc-800 px-3 py-1">ROUTINE (中立)</span>}
                  </div>
                </div>

                {/* Sub-info layout */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row flex-wrap gap-x-8 gap-y-3 relative z-10 text-[10px] sm:text-xs font-mono text-zinc-400">
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-600 uppercase tracking-widest text-[8px] sm:text-[10px]">Star(Qi) / 九星</span> 
                    <span className={`font-bold ${isVoid ? 'text-red-800' : 'text-zinc-300'}`}>{item.kyusei.japanese}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-600 uppercase tracking-widest text-[8px] sm:text-[10px]">Gate(Filter) / 八門</span> 
                    <span className={`font-bold ${isVoid ? 'text-red-800' : (item.hachimon.auspicious ? 'text-amber-400' : 'text-zinc-300')}`}>
                      {item.hachimon.japanese}
                    </span>
                  </div>
                </div>
                
                {/* Warning Text for Void Time */}
                {isVoid && (
                  <div className="mt-4 bg-red-950/40 p-3 sm:p-4 border-l-2 border-red-500/50 text-justify relative z-10 shadow-inner">
                    <div className="text-[10px] sm:text-xs font-mono text-red-500 uppercase tracking-widest mb-1 md:animate-pulse">
                       ⚠ SYSTEM SHIELD OFFLINE
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-sans text-red-400/80 leading-relaxed">
                       {item.japanese}の刻における強烈な電磁気定在波が地球共鳴と非同期状態です。物理移動・新規アクション・重要な決断の一切を停止し、安全なROUTINEタスクへ移行してください。
                    </div>
                  </div>
                )}

                {/* Decrypt Matrix Toggle */}
                <div className="mt-4 relative z-10 flex justify-end">
                   <button onClick={() => toggleRow(index)} className="text-[10px] text-zinc-500 hover:text-blue-400 flex items-center gap-2 transition-colors uppercase tracking-widest font-bold bg-zinc-950/50 px-3 py-1.5 border border-zinc-800">
                     <span className={expandedIndex === index ? 'text-blue-500' : ''}>{expandedIndex === index ? '▲' : '▼'}</span>
                     {expandedIndex === index ? 'HIDE MATRIX' : 'DECRYPT MATRIX'}
                   </button>
                </div>
                
                {isExpanded && (
                   <div className="mt-4 bg-black/80 p-4 border border-zinc-800 rounded-sm flex flex-col items-center relative z-10 shadow-inner">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Kigaku Compass Matrix</div>
                      <div className="scale-90 opacity-90"><KigakuBoard centerStar={item.kyusei} /></div>
                   </div>
                )}
             </div>
           );
        })}
      </div>

      {/* SECURE DATA REVIEW MODAL */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 p-6 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4 mb-4">
              <h3 className="text-emerald-500 font-mono tracking-widest uppercase text-sm font-bold">
                [ SECURE DATA REVIEW ]
              </h3>
              <button 
                onClick={() => setShowPreview(false)}
                className="text-zinc-500 hover:text-white font-mono text-xl leading-none"
              >
                &times;
              </button>
            </div>
            
            <p className="text-zinc-400 text-xs font-mono mb-4 text-justify leading-relaxed">
              以下のデータは生成AI（LLM）へのプロンプト入力として最適化されたフル・テレメトリーデータです。
              本命星・現在地・推命ベクトルのすべてが含まれます。内容を精査し、問題がなければエクスポートしてAIプロンプトに貼り付けてください。
            </p>

            <div className="flex-grow overflow-auto border border-zinc-800 bg-black/50 p-4 mb-4">
              <pre className="text-[10px] sm:text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-tight">
                {previewContent.replace("data:text/csv;charset=utf-8,\uFEFF", "")}
              </pre>
            </div>

            <div className="flex justify-end gap-4 border-t border-zinc-800 pt-4">
              <button 
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-zinc-400 text-xs font-mono uppercase tracking-widest hover:text-white"
              >
                Cancel
              </button>
              <button 
                onClick={executeDownload}
                className="px-6 py-2 bg-emerald-900/50 text-emerald-400 border border-emerald-500/50 text-xs font-mono uppercase tracking-widest hover:bg-emerald-900 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.2)]"
              >
                Confirm & Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const SolarTimeTable = React.memo(SolarTimeTableComponent);

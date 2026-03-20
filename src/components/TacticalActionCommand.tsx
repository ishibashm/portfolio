"use client";

import React from "react";
import { AlertOctagon, ShieldAlert, CheckCircle2 } from "lucide-react";

interface Props {
  kpIndex: number | null;
  ansLoad: number;
  isVoidTime: boolean;
}

export function TacticalActionCommandComponent({ kpIndex, ansLoad, isVoidTime }: Props) {
  
  // Logic for DEFCON and Directive
  let defcon = 5;
  let directive = "ALL CLEAR. 磁気的セーフゾーンでのアーシング（デトックス）を推奨します。";
  let logicTrace = "[EOT OK] [Kp < 4] [ANS < 70] [Time: Active]";
  let colorClass = "text-emerald-400 border-emerald-500/50 bg-emerald-950/20";
  let Icon = CheckCircle2;

  if (isVoidTime) {
    defcon = 1;
    directive = "天中殺フェーズ（絶対防御）：全移動ベクトルを破棄し、現在の0Vベースでグラウンディングを維持せよ。";
    logicTrace = "[CRITICAL] [Time: VOID (午/未)] -> Absolute Filter Overriden";
    colorClass = "text-red-500 border-red-500/50 bg-red-950/20 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]";
    Icon = AlertOctagon;
  } else if (kpIndex !== null && kpIndex >= 5) {
    defcon = 2;
    directive = `GEOMAGNETIC STORM (Kp=${kpIndex.toFixed(1)}): 地磁気嵐警報。荷電領域を回避し絶対安静を確保せよ。`;
    logicTrace = `[WARN] [Kp: ${kpIndex.toFixed(1)} >= 5] -> High Solar Wind Env Matrix`;
    colorClass = "text-red-400 border-red-500/50 bg-red-950/20";
    Icon = AlertOctagon;
  } else if (kpIndex !== null && kpIndex >= 4) {
    defcon = 3;
    directive = `ELEVATED NOISE (Kp=${kpIndex.toFixed(1)}): 環境ノイズ上昇。外部被ばく時間を極小化せよ。`;
    logicTrace = `[CAUTION] [Kp: ${kpIndex.toFixed(1)} >= 4] -> Moderate Storm Activity`;
    colorClass = "text-amber-500 border-amber-500/50 bg-amber-950/20";
    Icon = ShieldAlert;
  } else if (ansLoad > 70) {
    defcon = 3;
    directive = `HIGH ANS LOAD (${ansLoad}%): 自律神経シールド低下。祐気取りよりアーシングを最優先せよ。`;
    logicTrace = `[CAUTION] [ANS Load: ${ansLoad}% > 70%] -> Bio-Shield Depleted`;
    colorClass = "text-amber-500 border-amber-500/50 bg-amber-950/20";
    Icon = ShieldAlert;
  }

  return (
    <div className={`w-full max-w-4xl border p-3 flex flex-col gap-3 rounded-none relative overflow-hidden transition-all duration-500 ${colorClass}`}>
      
      {/* Background Tech Details */}
      <div className="absolute top-0 right-0 p-1 opacity-10 pointer-events-none grid grid-cols-4 gap-1 text-[4px] leading-[4px] font-mono break-all font-bold w-[300px]">
         {Array.from({length: 40}).map((_, i) => (
           <span key={i}>{Math.random().toString(36).substring(2, 6).toUpperCase()}</span>
         ))}
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 relative z-10">
        <div className="shrink-0 flex items-center justify-center bg-black/50 border border-current p-2 md:p-4 min-w-[80px] md:min-w-[120px]">
          <div className="flex flex-col items-center">
            <Icon size={32} className="md:size-[42px] mb-1 md:animate-pulse" />
            <div className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.3em] font-mono mt-1">Defcon</div>
            <div className="text-3xl md:text-5xl font-black font-sans tracking-tighter leading-none">{defcon}</div>
          </div>
        </div>

        <div className="grow flex flex-col justify-center border-t md:border-t-0 md:border-l border-current md:pl-6 pt-3 md:pt-0 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
             <h2 className="text-[9px] md:text-[10px] uppercase font-mono tracking-widest bg-black/50 px-2 py-0.5 border border-current self-start sm:self-auto">Command Directive</h2>
             <span className="text-[7px] md:text-[8px] font-mono opacity-80">{logicTrace}</span>
          </div>
          <p className="text-base md:text-xl font-bold font-serif leading-tight mt-1 tracking-tight">
            {directive}
          </p>
        </div>
      </div>

      <div className="mt-1 border-t border-current/30 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-[9px] font-mono leading-relaxed text-current opacity-80">
         <div>
            <strong className="block mb-0.5 font-bold tracking-widest">--- SYSTEM OBJECTIVE: PDD (Personal Defense & Detoxification) ---</strong>
            <p className="text-justify">本システムは従来の「開運・願掛け」という古典的パラダイムを破棄し、生体電磁気学（Bio-electromagnetics）に基づく「絶対防衛・完全デトックス」を目的とする。外部環境の強烈な電気的ノイズ期においては、能動的な気取りよりも、体内の電位差を相殺するアーシング（Earthing）を最優先戦略と規定する。</p>
         </div>
         <div>
            <strong className="block mb-0.5 font-bold tracking-widest">--- ABSOLUTE LAWS OF COMPUTATION: 力学的三原則 ---</strong>
            <ul className="list-disc pl-3">
               <li><span className="font-bold">Zero-Volt Sync:</span> 現在地（ベース）への連泊日数が生体電磁シールドの強度を決定する。</li>
               <li><span className="font-bold">Void Overwrite:</span> 午刻・未刻（11:00-15:00）の天中殺中は地球磁場の同期パスが一時遮断されるため、全空間移動を禁止する。</li>
               <li><span className="font-bold">Kp Limit:</span> Kp指数4.0以上は自律神経ホメオスタシスへの侵襲リスクありとし強制的にDEFCONを下げる。</li>
            </ul>
         </div>
      </div>
      
    </div>
  );
}

export const TacticalActionCommand = React.memo(TacticalActionCommandComponent);

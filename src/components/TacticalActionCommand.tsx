"use client";

import React from "react";
import { AlertOctagon, ShieldAlert, CheckCircle2 } from "lucide-react";

interface Props {
  kpIndex: number | null;
  ansLoad: number;
  isPersonalVoid: boolean;
  personalVoidZodiac: string[];
}

export function TacticalActionCommandComponent({ kpIndex, ansLoad, isPersonalVoid, personalVoidZodiac }: Props) {
  
  // Logic for DEFCON and Directive
  let defcon = 5;
  let directive = "COMMAND: PROCEED (通常行動可)";
  let logicTrace = "[EOT OK] [Kp < 4] [ANS < 70] [Time: Active]";
  let colorClass = "text-emerald-400 border-emerald-500/50 bg-emerald-950/20";
  let iconClass = "md:animate-pulse";
  let Icon = CheckCircle2;

  if (isPersonalVoid) {
    defcon = 1;
    directive = "COMMAND: HOLD_POSITION (完全避難推奨)";
    logicTrace = `[CRITICAL] [Personal Void: ${personalVoidZodiac.join(', ')}] -> System Restrict`;
    colorClass = "text-red-500 border-red-500/50 bg-red-950/40 shadow-[inset_0_0_80px_rgba(255,0,0,0.3)] animate-pulse border-2";
    iconClass = "animate-spin-slow text-red-500";
    Icon = AlertOctagon;
  } else if (kpIndex !== null && kpIndex >= 5) {
    defcon = 2;
    directive = `COMMAND: SHELTER (地磁気嵐・絶対安静)`;
    logicTrace = `[WARN] [Kp: ${kpIndex.toFixed(1)} >= 5] -> High Solar Wind Env`;
    colorClass = "text-red-400 border-red-500/50 bg-red-950/20";
    iconClass = "";
    Icon = AlertOctagon;
  } else if (kpIndex !== null && kpIndex >= 4) {
    defcon = 3;
    directive = `COMMAND: MINIMIZE_EXPOSURE (外部被ばく抑制)`;
    logicTrace = `[CAUTION] [Kp: ${kpIndex.toFixed(1)} >= 4] -> Moderate Storm`;
    colorClass = "text-amber-500 border-amber-500/50 bg-amber-950/20";
    iconClass = "";
    Icon = ShieldAlert;
  } else if (ansLoad > 70) {
    defcon = 3;
    directive = `COMMAND: EARTHING_PRIORITY (自律神経シールド低下)`;
    logicTrace = `[CAUTION] [ANS Load: ${ansLoad}% > 70%] -> Bio-Shield Depleted`;
    colorClass = "text-amber-500 border-amber-500/50 bg-amber-950/20";
    iconClass = "";
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
            <Icon size={32} className={`md:size-[42px] mb-1 ${iconClass}`} />
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

      <div className="mt-4 border-t border-current/30 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-current">
         <div className="bg-black/30 p-4 border border-current/20 flex flex-col items-center hover:bg-black/80 transition-colors">
            <span className="text-xl md:text-2xl font-black tracking-tighter uppercase italic">STAY</span>
            <span className="text-[10px] md:text-xs font-mono tracking-widest opacity-80 mt-1">01. Zero-Volt Sync</span>
         </div>
         <div className="bg-black/30 p-4 border border-current/20 flex flex-col items-center hover:bg-black/80 transition-colors">
            <span className="text-xl md:text-2xl font-black tracking-tighter uppercase italic">ALIGN</span>
            <span className="text-[10px] md:text-xs font-mono tracking-widest opacity-80 mt-1">02. Kp Shield Limit</span>
         </div>
         <div className="bg-black/30 p-4 border border-current/20 flex flex-col items-center hover:bg-black/80 transition-colors">
            <span className="text-xl md:text-2xl font-black tracking-tighter uppercase italic">VOID</span>
            <span className="text-[10px] md:text-xs font-mono tracking-widest opacity-80 mt-1">03. Time Overwrite</span>
         </div>
      </div>
      
    </div>
  );
}

export const TacticalActionCommand = React.memo(TacticalActionCommandComponent);

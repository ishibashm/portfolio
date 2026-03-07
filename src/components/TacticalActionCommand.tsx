"use client";

import React from "react";
import { AlertOctagon, ShieldAlert, CheckCircle2 } from "lucide-react";

interface Props {
  kpIndex: number | null;
  ansLoad: number;
  isVoidTime: boolean;
}

export function TacticalActionCommand({ kpIndex, ansLoad, isVoidTime }: Props) {
  
  // Logic for DEFCON and Directive
  let defcon = 5;
  let directive = "ALL CLEAR. Proceed to Magnetic Safe Zone for detoxification.";
  let colorClass = "text-emerald-400 border-emerald-500/50 bg-emerald-950/20";
  let Icon = CheckCircle2;

  if (isVoidTime) {
    defcon = 1;
    directive = "VOID TIME ACTIVE (天中殺). Cease all movement. Ground yourself at zero-volt base.";
    colorClass = "text-red-500 border-red-500/50 bg-red-950/20 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]";
    Icon = AlertOctagon;
  } else if (kpIndex !== null && kpIndex >= 5) {
    defcon = 2;
    directive = `GEOMAGNETIC STORM (Kp=${kpIndex.toFixed(1)}). Evade highly charged areas. Focus on deep rest.`;
    colorClass = "text-red-400 border-red-500/50 bg-red-950/20";
    Icon = AlertOctagon;
  } else if (kpIndex !== null && kpIndex >= 4) {
    defcon = 3;
    directive = `ELEVATED NOISE (Kp=${kpIndex.toFixed(1)}). Proceed with caution. Limit exposure duration.`;
    colorClass = "text-amber-500 border-amber-500/50 bg-amber-950/20";
    Icon = ShieldAlert;
  } else if (ansLoad > 70) {
    defcon = 3;
    directive = `HIGH ANS LOAD (${ansLoad}%). Your bio-shield is weakened. Prioritize earthing over charging.`;
    colorClass = "text-amber-500 border-amber-500/50 bg-amber-950/20";
    Icon = ShieldAlert;
  }

  return (
    <div className={`w-full max-w-4xl border-2 p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 rounded-sm backdrop-blur-md transition-all duration-500 ${colorClass}`}>
      
      <div className="flex-shrink-0 flex flex-col items-center">
        <Icon size={48} className="mb-2 animate-pulse" />
        <div className="text-[10px] uppercase tracking-[0.3em] font-mono">Defcon</div>
        <div className="text-4xl font-black font-sans tracking-tighter">{defcon}</div>
      </div>

      <div className="flex-grow flex flex-col justify-center border-l-2 border-current pl-6 py-2">
        <h2 className="text-xs uppercase font-mono tracking-widest opacity-80 mb-2">Primary Directive</h2>
        <p className="text-lg md:text-xl font-bold font-serif leading-tight">
          {directive}
        </p>
      </div>
      
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { KimonScheduleItem } from "../utils/solarTime";

interface ClockDisplayProps {
  kimon: KimonScheduleItem;
  isVoidTime: boolean;
  solarTime: Date;
  eot: number;
  longOffset: number;
}

export function ClockDisplay({ kimon, isVoidTime, solarTime, eot, longOffset }: ClockDisplayProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-4xl border border-zinc-900/80 bg-black/40 p-6 rounded-sm backdrop-blur-sm relative">
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500"></div>

      <div className="text-center md:text-left space-y-1">
        <div className="text-[10px] tracking-[0.3em] text-zinc-500 uppercase font-mono">Current Matrix Cycle</div>
        <div className={`text-6xl font-serif font-thin tracking-widest ${isVoidTime ? 'text-red-500 text-glow-red animate-pulse' : 'text-emerald-500 text-glow'}`}>
          {kimon.japanese}
        </div>
        <div className="text-sm tracking-[0.2em] text-zinc-400 font-serif">
          {kimon.reading} / Center: {kimon.name}
        </div>
      </div>

      <div className="mt-8 md:mt-0 flex flex-col items-end space-y-4">
         <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-emerald-900/80 font-mono">True Solar Time</div>
            <div className="text-3xl font-mono font-light text-emerald-400">
              {formatTime(solarTime)}
            </div>
         </div>
         <div className="text-right">
            <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">Standard JST</div>
            <div className="text-xl font-mono font-light text-zinc-500">
              {formatTime(now)}
            </div>
         </div>
         <div className="text-[8px] font-mono text-zinc-600 gap-2 flex">
            <span>EOT:{eot.toFixed(1)}m</span>
            <span>OS:{longOffset.toFixed(1)}m</span>
         </div>
      </div>
    </div>
  );
}

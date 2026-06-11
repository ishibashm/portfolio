"use client";

import React, { useState, useEffect } from "react";
import { Lunar } from "lunar-javascript";

interface ClockDisplayProps {
  kimon: { name: string; japanese: string; reading: string; note?: string } | null;
  isVoidTime: boolean;
  solarTime: Date;
  eot: number;
  longOffset: number;
  targetDate?: Date;
}

export function ClockDisplay({ kimon, isVoidTime, solarTime, eot, longOffset, targetDate = new Date() }: ClockDisplayProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  // Calculate Lunar & Rokuyo from targetDate (evaluation date) instead of now
  const displayDate = new Date(targetDate);
  displayDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());

  const lunarDate = Lunar.fromDate(displayDate);
  const ROKUYO_MAP = ["大安 (Taian)", "赤口 (Shakku)", "先勝 (Sensho)", "友引 (Tomobiki)", "先負 (Sakimake)", "仏滅 (Butsumetsu)"];
  const lunarMonth = lunarDate.getMonth();
  const lunarDay = lunarDate.getDay();
  const rokuyoName = ROKUYO_MAP[(lunarMonth + lunarDay) % 6];
  const yueXiang = lunarDate.getYueXiang(); // Phase name
  const lunarDateString = `旧暦 ${lunarMonth}月${lunarDay}日`;

  const getRokuyoColor = (r: string) => {
    if (r.startsWith('大安')) return 'text-emerald-400 font-bold';
    if (r.startsWith('友引')) return 'text-blue-400 font-bold';
    if (r.startsWith('仏滅') || r.startsWith('赤口')) return 'text-red-400 font-bold';
    return 'text-zinc-300';
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-4xl border border-zinc-900/80 bg-black/40 p-6 rounded-sm md:backdrop-blur-sm relative gap-6 md:gap-0">
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500"></div>

      {/* 1. Spatial Phase (Kimon) */}
      <div className="text-center md:text-left space-y-1 w-1/3">
        <div className="text-[9px] md:text-[10px] tracking-[0.2em] md:tracking-[0.3em] text-zinc-500 uppercase font-mono mb-1">Matrix Phase
          <span className="block text-[7px] tracking-normal text-zinc-600 mt-1 normal-case font-sans">
            (地磁気と太陽角による空間位相)
          </span>
        </div>
        <div className={`text-4xl sm:text-5xl font-serif font-thin tracking-widest ${isVoidTime ? 'text-red-500 text-glow-red md:animate-pulse' : 'text-emerald-500 text-glow'}`}>
          {kimon?.japanese || "--"}
        </div>
        <div className="text-xs md:text-sm tracking-widest text-zinc-400 font-serif">
          {kimon?.reading || "--"}
        </div>
      </div>

      {/* 2. Lunar Phase & Rokuyo */}
      <div className="text-center space-y-1 border-x border-zinc-800/50 px-4 w-1/3">
        <div className="text-[9px] md:text-[10px] tracking-[0.2em] md:tracking-[0.3em] text-purple-400/80 uppercase font-mono mb-1">Lunar Cycle
          <span className="block text-[7px] tracking-normal text-zinc-600 mt-1 normal-case font-sans">
            (太陰暦 / 東洋カレンダー基準)
          </span>
        </div>
        <div className={`text-2xl sm:text-3xl font-serif tracking-widest ${getRokuyoColor(rokuyoName)}`}>
          {rokuyoName.split(' ')[0]}
        </div>
        <div className="text-[10px] md:text-xs tracking-widest text-zinc-400 font-mono mt-2">
          {lunarDateString} / {yueXiang}
        </div>
      </div>

      {/* 3. Temporal Phase (Time) */}
      <div className="flex flex-col items-center md:items-end space-y-3 w-1/3">
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-emerald-900/80 font-mono">True Solar Time</div>
          <div className="text-2xl sm:text-3xl font-mono font-light text-emerald-400">
            {formatTime(new Date(now.getTime() + (eot + longOffset) * 60000))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">Standard JST</div>
          <div className="text-lg font-mono font-light text-zinc-500">
            {formatTime(now)}
          </div>
        </div>
        <div className="text-[8px] font-mono text-zinc-600 gap-2 flex justify-end">
          <span>EOT:{eot.toFixed(1)}m</span>
          <span>OS:{longOffset.toFixed(1)}m</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";

const KYOTO_LONGITUDE = 135.72; // Nishikyogoku

export const SolarTimeClock = () => {
  const [now, setNow] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);

  useEffect(() => {
    // Client-side only to avoid hydration mismatch
    setNow(new Date());
    
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (now) {
      const result = calculateSolarTime(now, KYOTO_LONGITUDE);
      setSolarData(result);
    }
  }, [now]);

  if (!now || !solarData) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-500">Loading...</div>;

  const kimon = getKimonHour(solarData.solarTime);
  
  // Format times
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-900">
      <div className="flex flex-col items-center space-y-12 z-10">
        
        {/* Main Display: Kimon Hour */}
        <div className="text-center space-y-4">
          <div className="text-sm tracking-[0.2em] text-zinc-500 uppercase">Current Kimon (Kyoto)</div>
          <div className="text-[10rem] leading-none font-thin tracking-tight text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            {kimon.japanese}
          </div>
          <div className="text-2xl font-light tracking-widest text-zinc-400">
            {kimon.reading} <span className="text-zinc-600">/</span> {kimon.name}
          </div>
          {kimon.note && (
            <div className="text-amber-500/80 text-sm border border-amber-900/30 bg-amber-950/20 px-3 py-1 rounded inline-block">
              ⚠️ {kimon.note}
            </div>
          )}
        </div>

        {/* Time Comparison */}
        <div className="grid grid-cols-2 gap-12 w-full max-w-lg mt-12 border-t border-zinc-800 pt-12">
          
          {/* Standard Time */}
          <div className="text-center space-y-2 opacity-50 hover:opacity-100 transition-opacity duration-500">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Standard Time (JST)</div>
            <div className="text-3xl font-mono text-zinc-300">
              {formatTime(now)}
            </div>
          </div>

          {/* Solar Time */}
          <div className="text-center space-y-2">
            <div className="text-xs uppercase tracking-wider text-emerald-600/70">True Solar Time</div>
            <div className="text-3xl font-mono text-emerald-400">
              {formatTime(solarData.solarTime)}
            </div>
          </div>
        </div>

        {/* Details Footer */}
        <div className="text-[10px] text-zinc-700 font-mono tracking-tight space-y-1 text-center">
            <div>LAT: {KYOTO_LONGITUDE}°E</div>
            <div>EOT: {solarData.equationOfTime.toFixed(2)}m</div>
            <div>OFFSET: {solarData.longitudeCorrection.toFixed(2)}m</div>
            <div>TOTAL CORRECTION: {solarData.totalCorrection.toFixed(2)}m</div>
        </div>

      </div>
      
      {/* Background Decor (Optional) */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 via-zinc-950 to-zinc-950"></div>
    </div>
  );
};

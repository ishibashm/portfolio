"use client";

import React, { useState, useEffect } from "react";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";
import { SolarTimeTable } from "./SolarTimeTable";

const KYOTO_LONGITUDE = 135.72; // Nishikyogoku

export const SolarTimeClock = () => {
  const [now, setNow] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Client-side only to avoid hydration mismatch
    setNow(new Date());
    
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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
    <div className="min-h-screen flex flex-col items-center bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-900 pt-24 pb-16 relative overflow-x-hidden">
      <div className="flex flex-col items-center space-y-12 z-10 w-full max-w-4xl px-4 animate-fade-in-up">
        
        {/* Main Display: Kimon Hour */}
        <div className="text-center space-y-6">
          <div className="text-xs tracking-[0.3em] text-zinc-500 uppercase font-light">Current Kimon (Kyoto)</div>
          
          <div className="relative group cursor-default">
            <div className="text-[12rem] leading-none font-serif font-thin text-emerald-500/90 text-glow animate-breathe transition-all duration-1000 group-hover:text-emerald-400">
              {kimon.japanese}
            </div>
            
            {/* Ambient Glow behind Kanji */}
             <div className="absolute inset-0 bg-emerald-500/10 blur-[100px] rounded-full -z-10 opacity-50 animate-pulse"></div>
          </div>

          <div className="text-3xl font-light tracking-[0.2em] text-zinc-400 font-serif">
            <span className="text-zinc-500 text-base tracking-widest block mb-2 font-sans opacity-70">
                {kimon.reading}
            </span>
            {kimon.name}
          </div>

          {kimon.note && (
            <div className="mt-4 px-4 py-1.5 rounded-full border border-amber-500/30 bg-amber-950/30 text-amber-500 text-xs tracking-widest uppercase shadow-[0_0_10px_rgba(245,158,11,0.2)]">
               {kimon.note}
            </div>
          )}
        </div>

        {/* Time Comparison */}
        <div className="grid grid-cols-2 gap-16 w-full max-w-2xl mt-16 pt-12 border-t border-zinc-900/50">
          
          {/* Standard Time */}
          <div className="text-center space-y-3 group">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 group-hover:text-zinc-500 transition-colors">Standard Time (JST)</div>
            <div className="text-4xl font-mono font-light text-zinc-500 group-hover:text-zinc-300 transition-colors duration-500">
              {formatTime(now)}
            </div>
          </div>

          {/* Solar Time */}
          <div className="text-center space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-emerald-900/80">True Solar Time</div>
            <div className="text-4xl font-mono font-light text-emerald-500 text-glow">
              {formatTime(solarData.solarTime)}
            </div>
          </div>
        </div>

        {/* Details Footer */}
        <div className="grid grid-cols-4 gap-4 text-[10px] text-zinc-800 font-mono tracking-wider opacity-60">
            <div>LAT: {KYOTO_LONGITUDE}°E</div>
            <div>EOT: {solarData.equationOfTime.toFixed(2)}m</div>
            <div>OFFSET: {solarData.longitudeCorrection.toFixed(2)}m</div>
            <div>CORR: {solarData.totalCorrection.toFixed(2)}m</div>
        </div>

        {/* Schedule Table */}
        <SolarTimeTable date={now} longitude={KYOTO_LONGITUDE} />

      </div>
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-900/10 blur-[150px] rounded-full mix-blend-screen"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/5 blur-[150px] rounded-full mix-blend-screen"></div>
          <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-amber-900/5 blur-[100px] rounded-full mix-blend-screen"></div>
      </div>

      {/* Scroll Down Indicator */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none"
           style={{ opacity: scrolled ? 0 : 1, transition: "opacity 0.5s ease" }}>
        <span className="text-[9px] tracking-[0.25em] uppercase text-emerald-700/70 font-sans">Scroll</span>
        <div className="animate-scroll-bounce">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-emerald-600/60">
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from "react";
import { Activity, Shield, Zap, Compass, Radio, Sparkles, Waves, Cpu, Orbit } from "lucide-react";
import { InlineMath, BlockMath } from 'react-katex';

interface DashboardProps {
  kpIndex: number | null;
  xrayFlux: string | null;
  magneticF: number | null;
  magneticD: number | null;
  magneticI: number | null;
  eot: number;
  hrv: number;
  setHrv: (val: number) => void;
  gsr: number;
  setGsr: (val: number) => void;
  baseSyncDays: number;
  setBaseSyncDays: (val: number) => void;
  ansLoad: number;
  shieldCapacity: number;
  // Timing Optimizer
  
  timingDetails?: { name: string; phenomenon: string; detail: string }[];
  timingRecommendation?: string;
  
}

export function BioMagneticDashboard({
  kpIndex, xrayFlux, magneticF, magneticD, magneticI, eot,
  hrv, setHrv, gsr, setGsr, baseSyncDays, setBaseSyncDays,
  ansLoad, shieldCapacity,
  timingDetails, timingRecommendation
}: DashboardProps) {

  // --- Animated Waveform State (Fake Data for UI Richness) ---
  const [waveformData, setWaveformData] = useState<number[]>(Array.from({ length: 40 }, () => 50));
  useEffect(() => {
    const interval = setInterval(() => {
      setWaveformData(prev => {
        const newData = [...prev.slice(1), 50 + (Math.random() * 40 - 20) + (hrv > 80 ? Math.sin(Date.now() / 200) * 10 : Math.cos(Date.now() / 100) * 20)];
        return newData;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [hrv]);

  const getKpColor = (kp: number | null) => {
    if (kp === null) return "text-zinc-500";
    if (kp >= 5) return "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    if (kp >= 4) return "text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]";
    return "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]";
  };

  const getKpBgColor = (kp: number | null) => {
    if (kp === null) return "bg-zinc-800";
    if (kp >= 5) return "bg-red-500";
    if (kp >= 4) return "bg-amber-500";
    return "bg-emerald-400";
  };

  const getLoadColor = (load: number) => {
    if (load > 80) return "text-red-500";
    if (load > 50) return "text-amber-500";
    return "text-emerald-400";
  };

  const parseXrayClass = (flux: string | null) => {
    if (!flux) return { type: 'A', value: 1 };
    const match = flux.match(/([A-Z])(\d+(\.\d+)?)/);
    if (!match) return { type: flux.charAt(0) || 'A', value: 1 };
    return { type: match[1], value: parseFloat(match[2]) };
  };

  const xrayData = parseXrayClass(xrayFlux);
  const xrayPct = xrayData.type === 'X' ? 100 : xrayData.type === 'M' ? 75 : xrayData.type === 'C' ? 50 : xrayData.type === 'B' ? 25 : 10;

  // Radar Chart Data Calculation
  const radarRadius = 40;
  const radarCenter = 50;
  const getRadarPoint = (index: number, total: number, score: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = radarRadius * score;
    return `${radarCenter + r * Math.cos(angle)},${radarCenter + r * Math.sin(angle)}`;
  };

  return (
    <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
      {/* 1. ENVIRONMENTAL TELEMETRY */}
      <div className="bg-zinc-950 border border-zinc-800/80 p-4 shadow-2xl relative overflow-hidden group flex flex-col h-full">
        {/* HUD Corner Accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500/50"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500/50"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500/50"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500/50"></div>
        
        <div className="absolute top-0 right-0 p-2 opacity-5 transition-opacity">
          <Zap size={150} className="text-emerald-500" />
        </div>
        
        <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-zinc-800/80 pb-2">
          <Radio size={14} className="text-emerald-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-300 font-bold">
            Environmental Telemetry <span className="text-zinc-600 font-normal">/ 外部環境パラメータ</span>
          </h2>
          <div className="ml-auto flex items-center gap-1">
             <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
             <span className="text-[7px] text-emerald-500 font-mono tracking-widest">LIVE DATA</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono relative z-10">
          {/* KP Index Circular Gauge */}
          <div className="flex flex-col p-3 bg-black/40 border border-zinc-800/80 rounded-sm relative overflow-hidden">
            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
               <Orbit size={10} className="text-zinc-600" /> KP-INDEX (NOAA)
            </span>
            <div className="flex items-center justify-between">
               <div className="relative w-14 h-14">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-zinc-900" />
                    <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" 
                       strokeDasharray={24 * 2 * Math.PI} 
                       strokeDashoffset={24 * 2 * Math.PI - ((kpIndex || 0) / 9) * (24 * 2 * Math.PI)}
                       strokeLinecap="round"
                       className={`${getKpColor(kpIndex)} transition-all duration-1000`} 
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                     <span className={`text-sm font-bold tracking-tighter ${getKpColor(kpIndex)} leading-none`}>
                       {kpIndex !== null ? kpIndex.toFixed(1) : "-"}
                     </span>
                  </div>
               </div>
               <div className="flex flex-col gap-0.5 w-1/3">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className={`h-[2px] w-full rounded-sm ${kpIndex !== null && (9 - i) <= kpIndex ? getKpBgColor(kpIndex) : 'bg-zinc-900'}`}></div>
                  ))}
               </div>
            </div>
            <div className="mt-2 text-[7px] text-zinc-600 text-right">0-9 PLANETARY SCALE</div>
          </div>

          {/* XRAY FLUX Linear Gauge */}
          <div className="flex flex-col p-3 bg-black/40 border border-zinc-800/80 rounded-sm relative overflow-hidden">
            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
               <Zap size={10} className="text-zinc-600" /> X-RAY FLUX
            </span>
            <div className="flex flex-col grow justify-center gap-2">
               <div className={`text-2xl font-bold tracking-tight text-center ${xrayData.type === 'M' || xrayData.type === 'X' ? 'text-red-500 animate-pulse' : 'text-zinc-300'}`}>
                 {xrayFlux || "A-CLASS"}
               </div>
               <div className="w-full relative h-1.5 bg-zinc-900 rounded-sm overflow-hidden">
                 <div className={`absolute top-0 left-0 bottom-0 transition-all duration-1000 ${xrayData.type === 'X' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]' : xrayData.type === 'M' ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${xrayPct}%` }}></div>
               </div>
               <div className="flex justify-between text-[6px] text-zinc-600 mt-0.5">
                  <span>A</span><span>B</span><span>C</span><span>M</span><span>X</span>
               </div>
            </div>
          </div>

          {/* WMM Output Data Matrix */}
          <div className="col-span-2 mt-2 pt-2 border-t border-zinc-800/50">
             <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1.5">
                   <Compass size={12} className="text-emerald-600" />
                   <span className="text-[9px] text-emerald-500/80 font-bold uppercase tracking-wider">LOCAL GEOMAGNETICS (WMM2020)</span>
                </div>
                <span className="text-[7px] text-zinc-600 px-1 py-0.5 bg-zinc-900 rounded-sm">V.2020-2025</span>
             </div>
             
             <div className="grid grid-cols-3 gap-1 relative">
                {/* HUD Data Brackets */}
                <div className="absolute top-0 left-0 w-1 h-full border-y border-l border-zinc-800 pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-1 h-full border-y border-r border-zinc-800 pointer-events-none"></div>
                
                <div className="bg-zinc-950/50 p-2 flex flex-col items-center justify-center border-r border-zinc-900 last:border-0">
                   <div className="text-[7px] text-emerald-600/70 mb-1 uppercase tracking-widest">Intensity [F]</div>
                   <div className="text-sm text-zinc-200 font-mono font-bold tracking-tight">
                     {magneticF ? `${magneticF.toFixed(0)}` : 'CALC'}<span className="text-[8px] text-zinc-500 ml-0.5">nT</span>
                   </div>
                </div>
                <div className="bg-zinc-950/50 p-2 flex flex-col items-center justify-center border-r border-zinc-900 last:border-0">
                   <div className="text-[7px] text-emerald-600/70 mb-1 uppercase tracking-widest">Declination [D]</div>
                   <div className="text-sm text-zinc-200 font-mono font-bold tracking-tight">
                     {magneticD ? `${magneticD.toFixed(2)}` : '--'}<span className="text-[8px] text-zinc-500 ml-0.5">°</span>
                   </div>
                </div>
                <div className="bg-zinc-950/50 p-2 flex flex-col items-center justify-center border-r border-zinc-900 last:border-0">
                   <div className="text-[7px] text-emerald-600/70 mb-1 uppercase tracking-widest">Inclination [I]</div>
                   <div className="text-sm text-zinc-200 font-mono font-bold tracking-tight">
                     {magneticI ? `${magneticI.toFixed(2)}` : '--'}<span className="text-[8px] text-zinc-500 ml-0.5">°</span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* 2. BIO-SYNC DIAGNOSTICS */}
      <div className="bg-zinc-950 border border-zinc-800/80 p-4 shadow-2xl relative overflow-hidden group flex flex-col h-full">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-blue-500/50"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-blue-500/50"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-blue-500/50"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-blue-500/50"></div>
        
        {/* Animated Background SVG Wave */}
        <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
           <svg width="100%" height="50%" viewBox="0 0 400 100" preserveAspectRatio="none">
             <path d={`M 0,50 ${waveformData.map((val, i) => `L ${i * 10},${val}`).join(' ')}`} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
           </svg>
        </div>

        <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-zinc-800/80 pb-2">
          <Activity size={14} className="text-blue-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-300 font-bold">
            Bio-Sync Diagnostics <span className="text-zinc-600 font-normal">/ 生体同期パラメータ</span>
          </h2>
          <div className="ml-auto flex items-center gap-1">
             <span className="text-[7px] text-blue-500 font-mono tracking-widest px-1 bg-blue-500/10 rounded-sm border border-blue-500/30">MONITORING</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 text-xs font-mono h-full">
           
           {/* Inputs Panel */}
           <div className="flex flex-col gap-3 bg-black/40 p-3 border border-zinc-800/50 rounded-sm">
              <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1 border-b border-zinc-800/80 pb-1">
                 <Cpu size={10} className="text-zinc-600" /> SENSOR OVERRIDES
              </span>
              
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[7px] text-zinc-400">
                   <span>HEART RATE VAR (HRV)</span>
                   <span className="text-emerald-400 font-bold">{hrv} ms</span>
                </div>
                <input type="range" min="10" max="150" value={hrv} onChange={(e) => setHrv(Number(e.target.value))} 
                  className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer hover:bg-zinc-700 transition-colors" />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[7px] text-zinc-400">
                   <span>GALVANIC SKIN RES (GSR)</span>
                   <span className="text-amber-400 font-bold">{gsr} μS</span>
                </div>
                <input type="range" min="0" max="20" step="0.5" value={gsr} onChange={(e) => setGsr(Number(e.target.value))} 
                  className="w-full accent-amber-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer hover:bg-zinc-700 transition-colors" />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[7px] text-zinc-400">
                   <span>ENVIRONMENT SYNC DURATION</span>
                   <span className="text-blue-400 font-bold">{baseSyncDays} DAYS</span>
                </div>
                <input type="range" min="0" max="100" value={baseSyncDays} onChange={(e) => setBaseSyncDays(Number(e.target.value))} 
                  className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer hover:bg-zinc-700 transition-colors" />
              </div>
           </div>

           {/* Output Load Calc Panel */}
           <div className="flex flex-col justify-between bg-black/40 p-3 border border-zinc-800/80 rounded-sm relative overflow-hidden group/load">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-red-900/10 pointer-events-none opacity-0 group-hover/load:opacity-100 transition-opacity"></div>
              
              <div className="flex flex-col">
                 <div className="text-[9px] text-zinc-400 mb-2 uppercase tracking-widest border-b border-zinc-800 pb-1 flex justify-between items-center">
                     <span className="font-bold flex items-center gap-1"><Waves size={10} className="text-zinc-500" /> ANS OVERLOAD</span>
                     <span className="text-[7px] text-zinc-600 font-mono">DANGER_CALC</span>
                 </div>
                 <div className="flex items-end justify-between px-1">
                    <div className={`text-4xl font-mono font-bold tracking-tighter ${getLoadColor(ansLoad)} drop-shadow-lg leading-none`}>
                       {ansLoad}<span className="text-sm opacity-50 ml-0.5">%</span>
                    </div>
                    {/* Vertical Level Indicator */}
                    <div className="flex gap-0.5 h-8 items-end pb-0.5">
                      {[...Array(5)].map((_, i) => {
                         const thres = (i + 1) * 20;
                         const active = ansLoad >= thres;
                         return (
                            <div key={i} className={`w-2 rounded-t-sm transition-all duration-500 ${active ? getLoadColor(ansLoad) : 'bg-zinc-800/80'}`} style={{ height: `${20 + i * 20}%` }}></div>
                         );
                      })}
                    </div>
                 </div>
                 <div className="text-[7px] text-zinc-500 leading-tight mt-2 text-justify">※ 移住・移動先の環境に対する自律神経ストレス予測</div>
              </div>
              
              <div className="flex flex-col border-t border-zinc-800/80 pt-2 mt-2">
                 <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                       <Shield size={10} className="text-blue-500" />
                       <span className="text-[8px] text-blue-500/80 uppercase tracking-widest font-bold">BASE SHIELD CAP</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-200">{shieldCapacity}%</div>
                 </div>
                 <div className="w-full h-1.5 bg-zinc-950 rounded-sm overflow-hidden border border-zinc-800/50">
                    <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 opacity-90 shadow-[0_0_10px_rgba(59,130,246,0.8)]" style={{ width: `${shieldCapacity}%` }}></div>
                 </div>
                 <div className="text-[7px] text-zinc-500 tracking-normal mt-1 text-justify">※ 空間座標の環境磁場に対する順化度合（バッファー値）</div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}
"use client";

import React from "react";
import { Activity, Shield, Zap, Compass, Radio } from "lucide-react";

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
}

export function BioMagneticDashboard({
  kpIndex, xrayFlux, magneticF, magneticD, magneticI, eot,
  hrv, setHrv, gsr, setGsr, baseSyncDays, setBaseSyncDays,
  ansLoad, shieldCapacity
}: DashboardProps) {

  const getKpColor = (kp: number | null) => {
    if (kp === null) return "text-zinc-500";
    if (kp >= 5) return "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    if (kp >= 4) return "text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]";
    return "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]";
  };

  const getLoadColor = (load: number) => {
    if (load > 80) return "text-red-500";
    if (load > 50) return "text-amber-500";
    return "text-emerald-400";
  };

  return (
    <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
      {/* Environmental Telemetry */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 p-5 rounded-sm shadow-2xl backdrop-blur-md relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
          <Zap size={64} className="text-zinc-600" />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <Radio size={14} className="text-emerald-500 animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 shadow-black drop-shadow-md">
            Environmental Telemetry
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs font-mono">
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-600 mb-1">KP-INDEX (NOAA)</span>
            <span className={`text-2xl font-bold font-sans tracking-tighter ${getKpColor(kpIndex)}`}>
              {kpIndex !== null ? kpIndex.toFixed(2) : "NO SIGNAL"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-600 mb-1">X-RAY FLUX</span>
            <span className={`text-xl font-bold tracking-tight ${xrayFlux?.includes('M') || xrayFlux?.includes('X') ? 'text-red-500 animate-pulse' : 'text-zinc-300'}`}>
              {xrayFlux || "A-CLASS"}
            </span>
          </div>

          <div className="col-span-2 mt-2 pt-2 border-t border-zinc-900/50">
             <div className="flex items-center gap-1.5 mb-2">
                <Compass size={12} className="text-zinc-500" />
                <span className="text-[9px] text-zinc-500 tracking-wider">LOCAL GEOMAGNETICS (WMM)</span>
             </div>
             <div className="grid grid-cols-3 gap-2">
               <div>
                  <div className="text-[8px] text-zinc-600">INTENSITY(F)</div>
                  <div className="text-sm text-zinc-300">{magneticF ? `${magneticF.toFixed(0)} nT` : 'CALCULATING'}</div>
               </div>
               <div>
                  <div className="text-[8px] text-zinc-600">DECLINATION(D)</div>
                  <div className="text-sm text-zinc-300">{magneticD ? `${magneticD.toFixed(2)}°` : '--'}</div>
               </div>
               <div>
                  <div className="text-[8px] text-zinc-600">INCLINATION(I)</div>
                  <div className="text-sm text-zinc-300">{magneticI ? `${magneticI.toFixed(2)}°` : '--'}</div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Bio-Sync Diagnostics */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 p-5 rounded-sm shadow-2xl backdrop-blur-md relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
          <Activity size={64} className="text-zinc-600" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-amber-500 animate-pulse" />
            <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400 shadow-black drop-shadow-md">
              Bio-Sync Diagnostics
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 relative z-10 text-xs font-mono">
           <div className="flex flex-col gap-3">
              <label className="flex flex-col">
                <span className="text-[9px] text-zinc-500 mb-1 flex justify-between">
                  <span>HRV (ms)</span>
                  <span className="text-zinc-400">{hrv}</span>
                </span>
                <input type="range" min="10" max="150" value={hrv} onChange={(e) => setHrv(Number(e.target.value))} 
                  className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
              </label>

              <label className="flex flex-col">
                <span className="text-[9px] text-zinc-500 mb-1 flex justify-between">
                  <span>GSR/EDA (μS)</span>
                  <span className="text-zinc-400">{gsr}</span>
                </span>
                <input type="range" min="0" max="20" step="0.5" value={gsr} onChange={(e) => setGsr(Number(e.target.value))} 
                  className="w-full accent-amber-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
              </label>

              <label className="flex flex-col">
                <span className="text-[9px] text-zinc-500 mb-1 flex justify-between">
                  <span>BASE SYNC (Days)</span>
                  <span className="text-zinc-400">{baseSyncDays}</span>
                </span>
                <input type="range" min="0" max="100" value={baseSyncDays} onChange={(e) => setBaseSyncDays(Number(e.target.value))} 
                  className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
              </label>
           </div>

           <div className="flex flex-col justify-center border-l border-zinc-900/50 pl-4 space-y-4">
              <div className="text-center">
                 <div className="text-[8px] text-zinc-600 mb-1 uppercase tracking-widest">ANS Overload</div>
                 <div className={`text-3xl font-bold tracking-tighter ${getLoadColor(ansLoad)}`}>
                    {ansLoad}%
                 </div>
                 {/* Bar */}
                 <div className="w-full h-1 bg-zinc-900 mt-2 rounded overflow-hidden">
                    <div className="h-full bg-current transition-all duration-500" style={{ width: `${ansLoad}%` }}></div>
                 </div>
              </div>

              <div className="flex justify-between items-end border-t border-zinc-900/50 pt-3">
                 <div className="text-[8px] text-zinc-600 uppercase tracking-widest">Shield Cap.</div>
                 <div className="text-sm font-bold text-zinc-300">{shieldCapacity}%</div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

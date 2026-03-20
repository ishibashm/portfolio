import React from "react";
import { Activity, Shield, Zap, Compass, Radio } from "lucide-react";
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
      <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-sm shadow-2xl md:backdrop-blur-md relative overflow-hidden group flex flex-col h-full">
        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
          <Zap size={120} className="text-zinc-600" />
        </div>
        
        <div className="flex items-center gap-2 mb-3 relative z-10 border-b border-zinc-800/50 pb-2">
          <Radio size={14} className="text-emerald-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">
            Environmental Telemetry / 外部環境パラメータ
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono relative z-10">
          {/* KP Index */}
          <div className="flex flex-col p-2 bg-zinc-900/30 border border-zinc-800/50 rounded-sm">
            <span className="text-[9px] text-zinc-600 mb-1 font-bold uppercase tracking-wider">KP-INDEX (NOAA)</span>
            <span className={`text-3xl font-bold font-sans tracking-tighter ${getKpColor(kpIndex)}`}>
              {kpIndex !== null ? kpIndex.toFixed(2) : "N/A"}
            </span>
          </div>

          {/* XRAY FLUX */}
          <div className="flex flex-col p-2 bg-zinc-900/30 border border-zinc-800/50 rounded-sm">
            <span className="text-[9px] text-zinc-600 mb-1 font-bold uppercase tracking-wider">X-RAY FLUX</span>
            <span className={`text-2xl font-bold tracking-tight ${xrayFlux?.includes('M') || xrayFlux?.includes('X') ? 'text-red-500 md:animate-pulse' : 'text-zinc-300'}`}>
              {xrayFlux || "A-CLASS"}
            </span>
          </div>

          {/* WMM Output */}
          <div className="col-span-1 sm:col-span-2 mt-2 pt-2 border-t border-zinc-900/50">
             <div className="flex flex-col mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                   <Compass size={12} className="text-zinc-500" />
                   <span className="text-[9px] text-zinc-400 tracking-wider">LOCAL GEOMAGNETICS (WMM2020)</span>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-zinc-900/50 p-2 border border-zinc-800">
                <div className="border-b md:border-b-0 md:border-r border-zinc-800 pb-2 md:pb-0 md:pr-2">
                   <div className="text-[8px] text-amber-600/70 mb-0.5 uppercase">Intensity (F)</div>
                   <div className="text-sm text-zinc-300 font-mono">{magneticF ? `${magneticF.toFixed(0)} nT` : 'CALC'}</div>
                </div>
                <div className="border-b md:border-b-0 md:border-r border-zinc-800 py-2 md:py-0 md:px-2">
                   <div className="text-[8px] text-amber-600/70 mb-0.5 uppercase">Declination (D)</div>
                   <div className="text-sm text-zinc-300 font-mono">{magneticD ? `${magneticD.toFixed(2)}°` : '--'}</div>
                </div>
                <div className="pt-2 md:pt-0 md:pl-2">
                   <div className="text-[8px] text-amber-600/70 mb-0.5 uppercase">Inclination (I)</div>
                   <div className="text-sm text-zinc-300 font-mono">{magneticI ? `${magneticI.toFixed(2)}°` : '--'}</div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Bio-Sync Diagnostics */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-sm shadow-2xl md:backdrop-blur-md relative overflow-hidden group flex flex-col h-full">
        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
          <Activity size={120} className="text-zinc-600" />
        </div>
        
        <div className="flex items-center gap-2 mb-3 relative z-10 border-b border-zinc-800/50 pb-2">
          <Shield size={14} className="text-amber-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">
            Bio-Sync Diagnostics / 生体同期パラメータ
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 text-xs font-mono h-full">
           
           {/* Inputs */}
           <div className="flex flex-col gap-4">
              <label className="flex items-center gap-3">
                <span className="text-[9px] text-zinc-400 w-24">HRV [IN]</span>
                <input type="range" min="10" max="150" value={hrv} onChange={(e) => setHrv(Number(e.target.value))} 
                  className="grow accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                <span className="text-emerald-400 font-bold w-12 text-right">{hrv} ms</span>
              </label>

              <label className="flex items-center gap-3">
                <span className="text-[9px] text-zinc-400 w-24">GSR [IN]</span>
                <input type="range" min="0" max="20" step="0.5" value={gsr} onChange={(e) => setGsr(Number(e.target.value))} 
                  className="grow accent-amber-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                <span className="text-amber-400 font-bold w-12 text-right">{gsr} μS</span>
              </label>

              <label className="flex items-center gap-3">
                <span className="text-[9px] text-zinc-400 w-24">BASE SYNC [IN]</span>
                <input type="range" min="0" max="100" value={baseSyncDays} onChange={(e) => setBaseSyncDays(Number(e.target.value))} 
                  className="grow accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer" />
                <span className="text-blue-400 font-bold w-12 text-right">{baseSyncDays} D</span>
              </label>
           </div>

           {/* Output Load Calc */}
           <div className="flex flex-col justify-start sm:border-l sm:border-zinc-900/50 sm:pl-4 space-y-3 bg-zinc-900/30 p-2 border border-zinc-800/50">
              <div className="text-center">
                 <div className="text-[10px] text-zinc-400 mb-1 uppercase tracking-widest border-b border-zinc-700/50 pb-1">ANS Overload Index</div>
                 <div className={`text-4xl font-bold tracking-tighter ${getLoadColor(ansLoad)}`}>
                    {ansLoad}%
                 </div>
                 {/* Bar */}
                 <div className="w-full h-1.5 bg-zinc-950 mt-2 rounded overflow-hidden border border-zinc-800">
                    <div className="h-full bg-current transition-all duration-500" style={{ width: `${ansLoad}%` }}></div>
                 </div>
              </div>
              
              
              <div className="flex-grow"></div>

              <div className="flex justify-between items-end mt-4">
                 <div className="text-[9px] text-blue-500 uppercase tracking-widest">Base Shield Cap (防御容量)</div>
                 <div className="text-base font-bold text-zinc-200">{shieldCapacity}%</div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import {
  Activity,
  Shield,
  Zap,
  Compass,
  Radio,
  Waves,
  Cpu,
  Orbit,
} from "lucide-react";

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
  /**
   * 地上気圧と、過去 3 時間の変化量 (hPa)。取れていなければ null。
   *
   * bioModelingEngine の「気象病」ペナルティ（1hPa の低下ごとに交感神経
   * 負荷 +3%、最大 30%）の入力そのもの。ANS Load が上がった理由が
   * 気圧なのか磁気嵐なのか、画面から分かるように並べて出す。
   *
   * null と 0 は違う。0 は「変化なしと分かっている」、null は「取れて
   * いない」。取れていないときにペナルティ 0 の根拠として 0 を見せない。
   */
  pressure?: { current: number; drop: number } | null;
  // Timing Optimizer

  timingDetails?: { name: string; phenomenon: string; detail: string }[];
  timingRecommendation?: string;
}

// eot / timingDetails / timingRecommendation は SolarTimeClock から
// 渡ってくるが、この画面では描画していない。呼び出し側を壊さないよう
// 受け口は残し、分割代入からだけ外してある。

/*
  背景の飾りの波形（opacity 10% の SVG）。以前は 100ms の setInterval で
  乱数を流し込み、このコンポーネント全体を毎秒 10 回描き直していた。
  実データではない飾りのために、地図と同じタブで CPU を使い続けて
  操作のかくつきに足していたので、固定の波形にして動かさない。
*/
const DECOR_WAVE_PATH = `M 0,50 ${Array.from(
  { length: 40 },
  (_, i) =>
    `L ${i * 10},${(50 + Math.sin(i / 3) * 14 + Math.sin(i / 1.3) * 6).toFixed(1)}`,
).join(" ")}`;

export function BioMagneticDashboard({
  kpIndex,
  xrayFlux,
  magneticF,
  magneticD,
  magneticI,
  hrv,
  setHrv,
  gsr,
  setGsr,
  baseSyncDays,
  setBaseSyncDays,
  ansLoad,
  shieldCapacity,
  pressure = null,
}: DashboardProps) {
  const getKpColor = (kp: number | null) => {
    if (kp === null) return "text-stone-400";
    if (kp >= 5)
      return "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    if (kp >= 4)
      return "text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]";
    return "text-emerald-600 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]";
  };

  const getKpBgColor = (kp: number | null) => {
    if (kp === null) return "bg-stone-100";
    if (kp >= 5) return "bg-red-500";
    if (kp >= 4) return "bg-amber-500";
    return "bg-emerald-400";
  };

  const getLoadColor = (load: number) => {
    if (load > 80) return "text-red-500";
    if (load > 50) return "text-amber-500";
    return "text-emerald-600";
  };

  const parseXrayClass = (flux: string | null) => {
    if (!flux) return { type: "A", value: 1 };
    const match = flux.match(/([A-Z])(\d+(\.\d+)?)/);
    if (!match) return { type: flux.charAt(0) || "A", value: 1 };
    return { type: match[1], value: parseFloat(match[2]) };
  };

  const xrayData = parseXrayClass(xrayFlux);
  const xrayPct =
    xrayData.type === "X"
      ? 100
      : xrayData.type === "M"
        ? 75
        : xrayData.type === "C"
          ? 50
          : xrayData.type === "B"
            ? 25
            : 10;

  return (
    /*
      幅の上限はここでは持たない。以前は max-w-4xl（896px）を自分で持って
      いて、外側を 1700px にしても効かず両端に余白が残っていた（#347 と
      同じ型）。2 枚の札は横並びのままなので、広げるとそのまま埋まる。
    */
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
      {/* 1. ENVIRONMENTAL TELEMETRY */}
      <div className="bg-stone-50 border border-stone-200 p-4 shadow-2xl relative overflow-hidden group flex flex-col h-full">
        {/* HUD Corner Accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-200"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-200"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-200"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-200"></div>

        <div className="absolute top-0 right-0 p-2 opacity-5 transition-opacity">
          <Zap size={150} className="text-emerald-500" />
        </div>

        <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-stone-200 pb-2">
          <Radio size={14} className="text-emerald-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-stone-600 font-bold">
            Environmental Telemetry{" "}
            <span className="text-stone-400 font-normal">
              / 外部環境パラメータ
            </span>
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-[7px] text-emerald-500 font-mono tracking-widest">
              LIVE DATA
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono relative z-10">
          {/* KP Index Circular Gauge */}
          <div className="flex flex-col p-3 bg-white/70 border border-stone-200 rounded-sm relative overflow-hidden">
            <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Orbit size={10} className="text-stone-400" /> KP-INDEX (NOAA)
            </span>
            <div className="flex items-center justify-between">
              <div className="relative w-14 h-14">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    className="text-zinc-900"
                  />
                  <circle
                    cx="28"
                    cy="28"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="transparent"
                    strokeDasharray={24 * 2 * Math.PI}
                    strokeDashoffset={
                      24 * 2 * Math.PI -
                      ((kpIndex || 0) / 9) * (24 * 2 * Math.PI)
                    }
                    strokeLinecap="round"
                    className={`${getKpColor(kpIndex)} transition-all duration-1000`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span
                    className={`text-sm font-bold tracking-tighter ${getKpColor(kpIndex)} leading-none`}
                  >
                    {kpIndex !== null ? kpIndex.toFixed(1) : "-"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5 w-1/3">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-[2px] w-full rounded-sm ${kpIndex !== null && 9 - i <= kpIndex ? getKpBgColor(kpIndex) : "bg-white"}`}
                  ></div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-[7px] text-stone-400 text-right">
              0-9 PLANETARY SCALE
            </div>
          </div>

          {/* XRAY FLUX Linear Gauge */}
          <div className="flex flex-col p-3 bg-white/70 border border-stone-200 rounded-sm relative overflow-hidden">
            <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Zap size={10} className="text-stone-400" /> X-RAY FLUX
            </span>
            <div className="flex flex-col grow justify-center gap-2">
              <div
                className={`text-2xl font-bold tracking-tight text-center ${xrayData.type === "M" || xrayData.type === "X" ? "text-red-500 animate-pulse" : "text-stone-600"}`}
              >
                {xrayFlux || "A-CLASS"}
              </div>
              <div className="w-full relative h-1.5 bg-white rounded-sm overflow-hidden">
                <div
                  className={`absolute top-0 left-0 bottom-0 transition-all duration-1000 ${xrayData.type === "X" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" : xrayData.type === "M" ? "bg-amber-500" : "bg-blue-500"}`}
                  style={{ width: `${xrayPct}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[6px] text-stone-400 mt-0.5">
                <span>A</span>
                <span>B</span>
                <span>C</span>
                <span>M</span>
                <span>X</span>
              </div>
            </div>
          </div>

          {/* 気圧（気象病モデルの入力） */}
          <div className="col-span-2 mt-2 pt-2 border-t border-stone-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Waves size={12} className="text-sky-600" />
              <span className="text-[9px] text-sky-500/80 font-bold uppercase tracking-wider">
                SURFACE PRESSURE (3H DELTA)
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200">
                <div className="text-[7px] text-sky-600/70 mb-1 uppercase tracking-widest">
                  現在
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {pressure ? pressure.current.toFixed(1) : "--"}
                  <span className="text-[8px] text-stone-400 ml-0.5">hPa</span>
                </div>
              </div>
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200">
                <div className="text-[7px] text-sky-600/70 mb-1 uppercase tracking-widest">
                  3時間変化
                </div>
                <div
                  className={`text-sm font-mono font-bold tracking-tight ${
                    pressure && pressure.drop <= -3
                      ? "text-red-500"
                      : pressure && pressure.drop < 0
                        ? "text-amber-600"
                        : "text-stone-700"
                  }`}
                >
                  {pressure
                    ? `${pressure.drop > 0 ? "+" : ""}${pressure.drop.toFixed(1)}`
                    : "--"}
                  <span className="text-[8px] text-stone-400 ml-0.5">hPa</span>
                </div>
              </div>
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center">
                <div className="text-[7px] text-sky-600/70 mb-1 uppercase tracking-widest">
                  自律神経負荷
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {pressure
                    ? `+${(pressure.drop < 0 ? Math.min(30, Math.abs(pressure.drop) * 3) : 0).toFixed(0)}`
                    : "--"}
                  <span className="text-[8px] text-stone-400 ml-0.5">%</span>
                </div>
              </div>
            </div>
            {!pressure && (
              <div className="mt-1 text-[7px] text-stone-400">
                気圧を取得できていません。この項目は負荷の計算に入っていません。
              </div>
            )}
          </div>

          {/* WMM Output Data Matrix */}
          <div className="col-span-2 mt-2 pt-2 border-t border-stone-200">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-1.5">
                <Compass size={12} className="text-emerald-600" />
                <span className="text-[9px] text-emerald-500/80 font-bold uppercase tracking-wider">
                  LOCAL GEOMAGNETICS (WMM2020)
                </span>
              </div>
              <span className="text-[7px] text-stone-400 px-1 py-0.5 bg-white rounded-sm">
                V.2020-2025
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 relative">
              {/* HUD Data Brackets */}
              <div className="absolute top-0 left-0 w-1 h-full border-y border-l border-stone-200 pointer-events-none"></div>
              <div className="absolute top-0 right-0 w-1 h-full border-y border-r border-stone-200 pointer-events-none"></div>

              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200 last:border-0">
                <div className="text-[7px] text-emerald-600/70 mb-1 uppercase tracking-widest">
                  Intensity [F]
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {magneticF ? `${magneticF.toFixed(0)}` : "CALC"}
                  <span className="text-[8px] text-stone-400 ml-0.5">nT</span>
                </div>
              </div>
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200 last:border-0">
                <div className="text-[7px] text-emerald-600/70 mb-1 uppercase tracking-widest">
                  Declination [D]
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {magneticD ? `${magneticD.toFixed(2)}` : "--"}
                  <span className="text-[8px] text-stone-400 ml-0.5">°</span>
                </div>
              </div>
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200 last:border-0">
                <div className="text-[7px] text-emerald-600/70 mb-1 uppercase tracking-widest">
                  Inclination [I]
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {magneticI ? `${magneticI.toFixed(2)}` : "--"}
                  <span className="text-[8px] text-stone-400 ml-0.5">°</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. BIO-SYNC DIAGNOSTICS */}
      <div className="bg-stone-50 border border-stone-200 p-4 shadow-2xl relative overflow-hidden group flex flex-col h-full">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-blue-200"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-blue-200"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-blue-200"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-blue-200"></div>

        {/* Animated Background SVG Wave */}
        <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
          <svg
            width="100%"
            height="50%"
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
          >
            <path
              d={DECOR_WAVE_PATH}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-stone-200 pb-2">
          <Activity size={14} className="text-blue-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-stone-600 font-bold">
            Bio-Sync Diagnostics{" "}
            <span className="text-stone-400 font-normal">
              / 生体同期パラメータ
            </span>
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[7px] text-blue-500 font-mono tracking-widest px-1 bg-blue-500/10 rounded-sm border border-blue-200">
              MONITORING
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 text-xs font-mono h-full">
          {/* Inputs Panel */}
          <div className="flex flex-col gap-3 bg-white/70 p-3 border border-stone-200 rounded-sm">
            <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1 border-b border-stone-200 pb-1">
              <Cpu size={10} className="text-stone-400" /> SENSOR OVERRIDES
            </span>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[7px] text-stone-500">
                <span>HEART RATE VAR (HRV)</span>
                <span className="text-emerald-600 font-bold">{hrv} ms</span>
              </div>
              <input
                type="range"
                min="10"
                max="150"
                value={hrv}
                onChange={(e) => setHrv(Number(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer hover:bg-stone-200 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[7px] text-stone-500">
                <span>GALVANIC SKIN RES (GSR)</span>
                <span className="text-amber-600 font-bold">{gsr} μS</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={gsr}
                onChange={(e) => setGsr(Number(e.target.value))}
                className="w-full accent-amber-500 h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer hover:bg-stone-200 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[7px] text-stone-500">
                <span>ENVIRONMENT SYNC DURATION</span>
                <span className="text-blue-600 font-bold">
                  {baseSyncDays} DAYS
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={baseSyncDays}
                onChange={(e) => setBaseSyncDays(Number(e.target.value))}
                className="w-full accent-blue-500 h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer hover:bg-stone-200 transition-colors"
              />
            </div>
          </div>

          {/* Output Load Calc Panel */}
          <div className="flex flex-col justify-between bg-white/70 p-3 border border-stone-200 rounded-sm relative overflow-hidden group/load">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-red-50 pointer-events-none opacity-0 group-hover/load:opacity-100 transition-opacity"></div>

            <div className="flex flex-col">
              <div className="text-[9px] text-stone-500 mb-2 uppercase tracking-widest border-b border-stone-200 pb-1 flex justify-between items-center">
                <span className="font-bold flex items-center gap-1">
                  <Waves size={10} className="text-stone-400" /> ANS OVERLOAD
                </span>
                <span className="text-[7px] text-stone-400 font-mono">
                  DANGER_CALC
                </span>
              </div>
              <div className="flex items-end justify-between px-1">
                <div
                  className={`text-4xl font-mono font-bold tracking-tighter ${getLoadColor(ansLoad)} drop-shadow-lg leading-none`}
                >
                  {ansLoad}
                  <span className="text-sm opacity-50 ml-0.5">%</span>
                </div>
                {/* Vertical Level Indicator */}
                <div className="flex gap-0.5 h-8 items-end pb-0.5">
                  {[...Array(5)].map((_, i) => {
                    const thres = (i + 1) * 20;
                    const active = ansLoad >= thres;
                    return (
                      <div
                        key={i}
                        className={`w-2 rounded-t-sm transition-all duration-500 ${active ? getLoadColor(ansLoad) : "bg-stone-100/80"}`}
                        style={{ height: `${20 + i * 20}%` }}
                      ></div>
                    );
                  })}
                </div>
              </div>
              <div className="text-[7px] text-stone-400 leading-tight mt-2 text-justify">
                ※ 移住・移動先の環境に対する自律神経ストレス予測
              </div>
            </div>

            <div className="flex flex-col border-t border-stone-200 pt-2 mt-2">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                  <Shield size={10} className="text-blue-500" />
                  <span className="text-[8px] text-blue-500/80 uppercase tracking-widest font-bold">
                    BASE SHIELD CAP
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-stone-700">
                  {shieldCapacity}%
                </div>
              </div>
              <div className="w-full h-1.5 bg-stone-50 rounded-sm overflow-hidden border border-stone-200">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 opacity-90 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                  style={{ width: `${shieldCapacity}%` }}
                ></div>
              </div>
              <div className="text-[7px] text-stone-400 tracking-normal mt-1 text-justify">
                ※ 空間座標の環境磁場に対する順化度合（バッファー値）
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

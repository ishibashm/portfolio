"use client";

import React from "react";
import { Zap, Compass, Radio, Waves, Orbit } from "lucide-react";

interface DashboardProps {
  kpIndex: number | null;
  xrayFlux: string | null;
  magneticF: number | null;
  magneticD: number | null;
  magneticI: number | null;
  eot: number;
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

export function BioMagneticDashboard({
  kpIndex,
  xrayFlux,
  magneticF,
  magneticD,
  magneticI,
  pressure = null,
}: DashboardProps) {
  const getKpColor = (kp: number | null) => {
    if (kp === null) return "text-stone-600";
    if (kp >= 5)
      return "text-red-700 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    if (kp >= 4)
      return "text-amber-700 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]";
    return "text-emerald-700 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]";
  };

  const getKpBgColor = (kp: number | null) => {
    if (kp === null) return "bg-stone-100";
    if (kp >= 5) return "bg-red-500";
    if (kp >= 4) return "bg-amber-500";
    return "bg-emerald-400";
  };

  const parseXrayClass = (flux: string | null) => {
    if (!flux) return { type: "A", value: 1 };
    const match = flux.match(/([A-Z])(\d+(\.\d+)?)/);
    if (!match) return { type: flux.charAt(0) || "A", value: 1 };
    return { type: match[1], value: parseFloat(match[2]) };
  };

  /*
    取れていない実測値は、空の計器を並べない。

    Kp・太陽 X 線・気圧はどれも外部の配信で、取れていないことが珍しく
    ない。以前はそのときも枠・目盛り・円グラフをそのまま描いて中身だけ
    「-」「--」にしていたので、**何も分からない計器を 2 画面ぶん眺めてから
    目的地の地図に着く**状態だった（#1327 で順序は直したが、空の計器は
    そのまま残っていた）。

    取れていないものは描かず、末尾の 1 行にまとめる。「取れていない」こと
    自体は消さない — 消すと「その日は静かだった」と読めてしまう。
  */
  const missing: string[] = [];
  if (kpIndex === null) missing.push("地磁気 Kp");
  if (!xrayFlux) missing.push("太陽 X 線");
  if (!pressure) missing.push("地上気圧");
  /** 外部の配信が 1 つでも届いているか。全部欠けていれば「実測」ではない。 */
  const hasFeed = missing.length < 3;
  /** 片方だけ残ったときは、半分の幅で置き去りにせず横いっぱいに使う。 */
  const gaugeSpan = kpIndex !== null && xrayFlux ? "" : "col-span-2 ";

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
      同じ型）。

      以前は 2 枚を横並びにしていた（環境と生体）。生体側を畳んだので
      1 枚だけになり、格子をやめて素直に横いっぱいへ広げる。
    */
    <div className="w-full mt-8">
      {/* 1. ENVIRONMENTAL TELEMETRY */}
      <div className="bg-stone-50 border border-stone-200 p-4 shadow-2xl relative overflow-hidden group flex flex-col h-full">
        {/* HUD Corner Accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-200"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-200"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-200"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-200"></div>

        <div className="absolute top-0 right-0 p-2 opacity-5 transition-opacity">
          <Zap size={150} className="text-emerald-700" />
        </div>

        <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-stone-200 pb-2">
          <Radio size={14} className="text-emerald-700 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-stone-600 font-bold">
            外部環境の実測値
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${hasFeed ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`}
            ></span>
            <span
              className={`text-[9px] font-mono tracking-widest ${hasFeed ? "text-emerald-700" : "text-stone-600"}`}
            >
              {hasFeed ? "実測" : "計算値のみ"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono relative z-10">
          {/* KP Index Circular Gauge */}
          {kpIndex !== null && (
            <div
              className={`${gaugeSpan}flex flex-col p-3 bg-white/70 border border-stone-200 rounded-sm relative overflow-hidden`}
            >
              <span className="text-[10px] text-stone-600 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                <Orbit size={10} className="text-stone-600" /> 地磁気 Kp（NOAA）
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
              <div className="mt-2 text-[9px] text-stone-600 text-right">
                Kp 指数（0〜9）
              </div>
            </div>
          )}

          {/* XRAY FLUX Linear Gauge */}
          {xrayFlux && (
            <div
              className={`${gaugeSpan}flex flex-col p-3 bg-white/70 border border-stone-200 rounded-sm relative overflow-hidden`}
            >
              <span className="text-[10px] text-stone-600 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                <Zap size={10} className="text-stone-600" /> 太陽 X 線
              </span>
              <div className="flex flex-col grow justify-center gap-2">
                <div
                  className={`text-2xl font-bold tracking-tight text-center ${xrayData.type === "M" || xrayData.type === "X" ? "text-red-700 animate-pulse" : "text-stone-600"}`}
                >
                  {xrayFlux || "--"}
                </div>
                <div className="w-full relative h-1.5 bg-white rounded-sm overflow-hidden">
                  <div
                    className={`absolute top-0 left-0 bottom-0 transition-all duration-1000 ${xrayData.type === "X" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" : xrayData.type === "M" ? "bg-amber-500" : "bg-blue-500"}`}
                    style={{ width: `${xrayPct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[9px] text-stone-600 mt-0.5">
                  <span>A</span>
                  <span>B</span>
                  <span>C</span>
                  <span>M</span>
                  <span>X</span>
                </div>
              </div>
            </div>
          )}

          {/* 気圧（気象病モデルの入力） */}
          {pressure && (
            <div className="col-span-2 mt-2 pt-2 border-t border-stone-200">
              <div className="flex items-center gap-1.5 mb-2">
                <Waves size={12} className="text-sky-700" />
                <span className="text-[9px] text-sky-700 font-bold uppercase tracking-wider">
                  地上気圧（3 時間の変化）
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200">
                  <div className="text-[9px] text-sky-700 mb-1 uppercase tracking-widest">
                    現在
                  </div>
                  <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                    {pressure ? pressure.current.toFixed(1) : "--"}
                    <span className="text-[10px] text-stone-600 ml-0.5">
                      hPa
                    </span>
                  </div>
                </div>
                <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200">
                  <div className="text-[9px] text-sky-700 mb-1 uppercase tracking-widest">
                    3時間変化
                  </div>
                  <div
                    className={`text-sm font-mono font-bold tracking-tight ${
                      pressure && pressure.drop <= -3
                        ? "text-red-700"
                        : pressure && pressure.drop < 0
                          ? "text-amber-700"
                          : "text-stone-700"
                    }`}
                  >
                    {pressure
                      ? `${pressure.drop > 0 ? "+" : ""}${pressure.drop.toFixed(1)}`
                      : "--"}
                    <span className="text-[10px] text-stone-600 ml-0.5">
                      hPa
                    </span>
                  </div>
                </div>
                <div className="bg-white/80 p-2 flex flex-col items-center justify-center">
                  <div className="text-[9px] text-sky-700 mb-1 uppercase tracking-widest">
                    自律神経負荷
                  </div>
                  <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                    {pressure
                      ? `+${(pressure.drop < 0 ? Math.min(30, Math.abs(pressure.drop) * 3) : 0).toFixed(0)}`
                      : "--"}
                    <span className="text-[10px] text-stone-600 ml-0.5">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WMM Output Data Matrix */}
          <div className="col-span-2 mt-2 pt-2 border-t border-stone-200">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-1.5">
                <Compass size={12} className="text-emerald-700" />
                <span className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider">
                  地磁気（WMM）
                </span>
              </div>
              {/* 以前は「V.2020-2025」と版の期間を書いていたが、geomagnetism
                  0.2.0 は wmm-2025 を持ち、2026 年は WMM2025 で計算している。
                  年を書くと次の版でまた嘘になるので、出典だけにする。 */}
              <span className="text-[9px] text-stone-600 px-1 py-0.5 bg-white rounded-sm">
                出典: NOAA WMM
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 relative">
              {/* HUD Data Brackets */}
              <div className="absolute top-0 left-0 w-1 h-full border-y border-l border-stone-200 pointer-events-none"></div>
              <div className="absolute top-0 right-0 w-1 h-full border-y border-r border-stone-200 pointer-events-none"></div>

              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200 last:border-0">
                <div className="text-[9px] text-emerald-700 mb-1 uppercase tracking-widest">
                  全磁力 F
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {magneticF ? `${magneticF.toFixed(0)}` : "計算中"}
                  <span className="text-[10px] text-stone-600 ml-0.5">nT</span>
                </div>
              </div>
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200 last:border-0">
                <div className="text-[9px] text-emerald-700 mb-1 uppercase tracking-widest">
                  偏角 D
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {magneticD !== null ? `${magneticD.toFixed(2)}` : "--"}
                  <span className="text-[10px] text-stone-600 ml-0.5">°</span>
                </div>
              </div>
              <div className="bg-white/80 p-2 flex flex-col items-center justify-center border-r border-stone-200 last:border-0">
                <div className="text-[9px] text-emerald-700 mb-1 uppercase tracking-widest">
                  伏角 I
                </div>
                <div className="text-sm text-stone-700 font-mono font-bold tracking-tight">
                  {magneticI !== null ? `${magneticI.toFixed(2)}` : "--"}
                  <span className="text-[10px] text-stone-600 ml-0.5">°</span>
                </div>
              </div>
            </div>
          </div>

          {missing.length > 0 && (
            <div className="col-span-2 mt-2 pt-2 border-t border-stone-200 text-xs text-stone-600">
              取得できていません: {missing.join("・")}
              。取れていない項目は負荷の計算に入っていません。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
      <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-sm shadow-2xl backdrop-blur-md relative overflow-hidden group flex flex-col h-full">
        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
          <Zap size={120} className="text-zinc-600" />
        </div>
        
        <div className="flex items-center gap-2 mb-3 relative z-10 border-b border-zinc-800/50 pb-2">
          <Radio size={14} className="text-emerald-500 animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">
            Environmental Telemetry / 外部環境パラメータ
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-xs font-mono relative z-10">
          {/* KP Index */}
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-600 mb-1">KP-INDEX (NOAA)</span>
            <span className={`text-3xl font-bold font-sans tracking-tighter ${getKpColor(kpIndex)}`}>
              {kpIndex !== null ? kpIndex.toFixed(2) : "N/A"}
            </span>
            <div className="text-[8px] text-zinc-500 mt-1 leading-relaxed text-justify pr-2">
              <strong className="text-zinc-400">算出基準・使用先:</strong> 太陽風による擾乱スケール（0-9）。 <InlineMath math="Kp \geq 4" /> で強力な電磁気ノイズが発生。「Tactical Magnetic Map」上の赤いノイズ領域を物理的に肥大化させ、緑の吉方領域を減衰させる係数としてマップ描画エンジンに直接使用されます。
            </div>
          </div>

          {/* XRAY FLUX */}
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-600 mb-1">X-RAY FLUX</span>
            <span className={`text-2xl font-bold tracking-tight ${xrayFlux?.includes('M') || xrayFlux?.includes('X') ? 'text-red-500 animate-pulse' : 'text-zinc-300'}`}>
              {xrayFlux || "A-CLASS"}
            </span>
            <div className="text-[8px] text-zinc-500 mt-1 leading-relaxed text-justify pr-2">
              <strong className="text-zinc-400">算出基準:</strong> GOES衛星観測のX線フラックス量。M/Xクラスフレアは電離層に電磁波（X線/紫外線）を打ち込み、シューマン共振の基底周波数 <InlineMath math="(7.83\text{Hz})" /> を歪め、精神状態にダイレクトな影響を与える。
            </div>
          </div>

          {/* WMM Output */}
          <div className="col-span-2 mt-2 pt-2 border-t border-zinc-900/50">
             <div className="flex flex-col mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                   <Compass size={12} className="text-zinc-500" />
                   <span className="text-[9px] text-zinc-400 tracking-wider">LOCAL GEOMAGNETICS (WMM2020)</span>
                </div>
                <div className="text-[8px] text-zinc-500 leading-relaxed mb-1">
                  <strong className="text-zinc-400">測定原理:</strong> 世界磁気モデル（WMM）に基づきGPS座標から磁束密度ベクトルを導出。これが生体細胞が現在同期している「基準電位（0Vベース）」となる。 <InlineMath math="\vec{B} = (X, Y, Z)" /> を成分に分解。
                  <br/><strong className="text-zinc-400">【使用先】:</strong> 下記の「偏角 (D)」が、マップ描画エンジンにおいて**「真北と磁北のズレ（Magnetic North）」を物理的に補正するための回転角度**として直接使用されます。
                </div>
             </div>
             <div className="grid grid-cols-3 gap-2 bg-zinc-900/50 p-2 border border-zinc-800">
               <div>
                  <div className="text-[8px] text-amber-600/70 mb-0.5">全磁力 / INTENSITY (F)</div>
                  <div className="text-sm text-zinc-300">{magneticF ? `${magneticF.toFixed(0)} nT` : 'CALC'}</div>
                  <div className="text-[7px] text-zinc-500 mt-0.5 leading-tight"><InlineMath math="F = \sqrt{H^2 + Z^2}" /> <br/><strong className="text-zinc-400">【使用先】:</strong> 現在は観測用（生体電位の基底ベースライン参考値）として取得。将来的に移動距離に応じた被曝量（ダメージ量）の算出係数として使用予定。</div>
               </div>
               <div>
                  <div className="text-[8px] text-amber-600/70 mb-0.5">偏角 / DECLINATION (D)</div>
                  <div className="text-sm text-zinc-300">{magneticD ? `${magneticD.toFixed(2)}°` : '--'}</div>
                  <div className="text-[7px] text-zinc-500 mt-0.5 leading-tight"><InlineMath math="D = \arctan(Y/X)" /> <br/>真北と磁北のズレ。ベクトル計算に必須。</div>
               </div>
               <div>
                  <div className="text-[8px] text-amber-600/70 mb-0.5">伏角 / INCLINATION (I)</div>
                  <div className="text-sm text-zinc-300">{magneticI ? `${magneticI.toFixed(2)}°` : '--'}</div>
                  <div className="text-[7px] text-zinc-500 mt-0.5 leading-tight"><InlineMath math="I = \arctan(Z/H)" /> <br/><strong className="text-zinc-400">【使用先】:</strong> 観測用。磁力線が地表に突入するZ軸角度。標高・フライト移動時の3次元干渉計算（高度ノイズ係数）として使用予定。</div>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Bio-Sync Diagnostics */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-sm shadow-2xl backdrop-blur-md relative overflow-hidden group flex flex-col h-full">
        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
          <Activity size={120} className="text-zinc-600" />
        </div>
        
        <div className="flex items-center gap-2 mb-3 relative z-10 border-b border-zinc-800/50 pb-2">
          <Shield size={14} className="text-amber-500 animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">
            Bio-Sync Diagnostics / 生体同期パラメータ
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10 text-xs font-mono h-full">
           
           {/* Inputs */}
           <div className="flex flex-col gap-5">
              <label className="flex flex-col">
                <span className="text-[9px] text-zinc-400 mb-1 flex justify-between">
                  <span>HRV 心拍変動 (ms) [INPUT]</span>
                  <span className="text-emerald-400 font-bold">{hrv} ms</span>
                </span>
                <input type="range" min="10" max="150" value={hrv} onChange={(e) => setHrv(Number(e.target.value))} 
                  className="w-full accent-emerald-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer mb-1" />
                <span className="text-[7px] text-zinc-500 leading-relaxed text-justify">副交感神経（PNS）の優位性指標。<strong className="text-zinc-400">【使用先】:</strong> 下部の「ANS Load（自律神経負荷）」に直接加算され、ノイズ環境下でのあなたの防衛力（シールド）と相殺計算されます。数値が低い（過緊張）ほど負荷が上がります。</span>
              </label>

              <label className="flex flex-col">
                <span className="text-[9px] text-zinc-400 mb-1 flex justify-between">
                  <span>GSR 皮膚電気反射 (μS) [INPUT]</span>
                  <span className="text-amber-400 font-bold">{gsr} μS</span>
                </span>
                <input type="range" min="0" max="20" step="0.5" value={gsr} onChange={(e) => setGsr(Number(e.target.value))} 
                  className="w-full accent-amber-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer mb-1" />
                <span className="text-[7px] text-zinc-500 leading-relaxed text-justify">皮膚コンダクタンスによる交感神経活動量の実測値。<strong className="text-zinc-400">【使用先】:</strong> HRVと同様に「ANS Load（負荷）」としてペナルティ加算されます。数値が高い（多汗・ストレス）ほど、外部ノイズのダメージを受けやすくなります。</span>
              </label>

              <label className="flex flex-col">
                <span className="text-[9px] text-zinc-400 mb-1 flex justify-between">
                  <span>BASE SYNC 定住同期 (Days) [INPUT]</span>
                  <span className="text-blue-400 font-bold">{baseSyncDays} Days</span>
                </span>
                <input type="range" min="0" max="100" value={baseSyncDays} onChange={(e) => setBaseSyncDays(Number(e.target.value))} 
                  className="w-full accent-blue-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer mb-1" />
                <span className="text-[7px] text-zinc-500 leading-relaxed text-justify">現在のGPS座標における連続睡眠日数。細胞電位がその土地の磁場ベクトルに完全にアンカーされ（0V同期）、シールド強度が100%になるには約60日を要する。</span>
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
              
              <div className="text-[7.5px] text-zinc-500 leading-relaxed pb-2 border-b border-zinc-800/50">
                 <strong className="text-zinc-600 block mb-1">演算アルゴリズム形式:</strong>
                 <div className="bg-black py-1 overflow-x-auto text-[10px] my-1 rounded">
                   <BlockMath math="\text{Load} = (1 - h) + \Delta\text{Kp} + g - (S \times 0.2)" />
                 </div>
                 <span className="text-[6.5px]">※ <InlineMath math="h" />: HRV補正係数, <InlineMath math="\Delta\text{Kp}" />: 超過Kpペナルティ, <InlineMath math="g" />: GSR補正, <InlineMath math="S" />: 定住シールド乗数。</span><br/>
                 <div className="mt-1 text-justify">宇宙天気ノイズと現在生体ステータスを統合した自律神経過負荷指数。 <InlineMath math="\geq 50\%" /> で経絡の電位濾過機能の限界点を超退し、 <InlineMath math="\geq 80\%" /> で防御網の崩壊＝細胞毒性の蓄積フェーズへの突入を示す。</div>
              </div>

              <div className="flex justify-between items-end">
                 <div className="text-[9px] text-blue-500 uppercase tracking-widest">Base Shield Cap (防御容量)</div>
                 <div className="text-base font-bold text-zinc-200">{shieldCapacity}%</div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Crosshair, Maximize, Minimize, Download } from "lucide-react";
import { BlockMath, InlineMath } from 'react-katex';
import { downloadKML } from "../utils/kmlExport";

// Because Leaflet needs the window object, we must dynamically import it with ssr: false
const MagneticMapInner = dynamic(() => import("./MagneticMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-zinc-950 border border-zinc-800 flex items-center justify-center font-mono text-xs text-zinc-600 animate-pulse">
      [ INITIALIZING SPATIAL VECTORS... ]
    </div>
  ),
});

interface MapProps {
  lat: number;
  lon: number;
  declination: number | null;
}

export function TacticalMagneticMap({ lat, lon, declination }: MapProps) {
  return (
    <div className="w-full max-w-6xl mt-8 grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px] xl:grid-cols-[1fr_350px]">
      
      {/* Map Container */}
      <div className="relative border border-zinc-800 shadow-2xl w-full flex flex-col h-[400px] md:h-[600px] lg:h-[700px]">
         <div className="absolute top-0 left-0 w-full p-2 z-10 bg-linear-to-b from-black/80 to-transparent pointer-events-none flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Crosshair size={14} className="text-blue-500 animate-pulse" />
              <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-300 drop-shadow-md">
                Tactical Magnetic Vectors
              </h2>
            </div>
            <div className="flex flex-col items-end gap-1">
               <button 
                  onClick={() => downloadKML(lat, lon, declination || 0)}
                  className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[9px] uppercase font-mono tracking-wider border border-zinc-700 rounded-sm transition-colors"
               >
                  <Download size={10} />
                  KML Export
               </button>
               <div className="text-[8px] font-mono text-zinc-400 text-right bg-black/50 px-1 py-0.5 border border-zinc-800/50">
                  COORD: {lat.toFixed(4)}N, {lon.toFixed(4)}E<br />
                  DEC: {declination ? declination.toFixed(2) : '--'}°
               </div>
            </div>
         </div>
         
         <div className="w-full h-full relative z-0 flex grow min-h-0">
           <MagneticMapInner lat={lat} lon={lon} declination={declination || 0} />
         </div>
         
         {/* Overlays */}
         <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
            <div className="bg-black/80 border border-zinc-800 p-2 font-mono text-[9px] leading-tight text-zinc-400 backdrop-blur-sm">
               <div className="text-emerald-500 font-bold mb-1">■ True North (Geo)</div>
               <div className="text-blue-500 font-bold">■ Magnetic North (WMM2020)</div>
               <div className="mt-2 text-zinc-600 text-[8px]">
                  * Lines represent primary spatial azimuths. <br/>
                  * Green overlays = safe vectors. Red = hazardous noise.
               </div>
            </div>
         </div>
      </div>

      {/* Info Panel Dense */}
      <div className="bg-zinc-950 border border-zinc-800 p-3 text-[8px] sm:text-[9px] font-mono text-zinc-400 flex flex-col gap-3 custom-scrollbar overflow-y-auto max-h-[400px] md:max-h-[600px] lg:max-h-[700px]">
         <div className="border-b border-zinc-900 pb-2">
            <h3 className="text-blue-500 text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-blue-900/40 px-1">SYS.1</span> 磁北偏角計算 (WMM補正)
            </h3>
            <p className="leading-relaxed text-justify">
               地図上の「真北（Geographic North）」と磁石が指す「磁北（Magnetic North）」の間には、地理的座標に応じた磁気偏角（Declination）が存在する。本システムはWorld Magnetic Model (WMM2020)を使用し、現在座標における精密な偏角 <InlineMath math="D" /> を算出する。
               古典的気学が用いる単なる地図上の北ではなく、体内鉄分・生体磁気に直接作用する磁力線のベクトルを完全にトレースする。
            </p>
            <div className="bg-black py-1 my-1 rounded text-center">
               <InlineMath math="\vec{B}_\text{local} = R_z(D) \cdot \vec{B}_\text{geo}" />
            </div>
         </div>

         <div className="border-b border-zinc-900 pb-2">
            <h3 className="text-emerald-500 text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-emerald-900/40 px-1">SYS.2</span> 空間ベクトル（正中・四隅フィルター）
            </h3>
            <p className="leading-relaxed text-justify mb-1">
               十二支（子午卯酉、寅申巳亥など）に基づく空間方位は、単なる概念ではなく特定周波数の電磁波が交差する物理的グリッドである。
               特に正中線（南北・東西軸の <InlineMath math="\pm 10^\circ \sim 15^\circ" /> の範囲）と四隅線（鬼門・裏鬼門等）の境界域では、磁束密度の急激な勾配（Magnetic Gradient）が発生する。
            </p>
            <ul className="list-disc pl-3 text-zinc-500 space-y-1">
               <li><span className="text-emerald-500">SAFE VECTOR:</span> 磁束が安定した平滑地帯。細胞代謝が最適化される。</li>
               <li><span className="text-red-500">NOISE VECTOR:</span> 磁力線が交錯する境界波の干渉帯。ANS（自律神経）の乱れを引き起こす。</li>
            </ul>
         </div>

         <div className="pt-1">
            <h3 className="text-amber-500 text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center gap-1">
               <span className="bg-amber-900/40 px-1">WARN</span> 長距離移動シールド減衰理論
            </h3>
            <p className="leading-relaxed text-justify">
               長距離空間の移動プロセス（特に新幹線や航空機による金属製ケージ内での地磁気切断移動）においては、現在地の0V同期ベースラインが完全に消失する。<InlineMath math="v > 100\text{km/h}" /> における地球磁力線の交差は、細胞膜電位の微小なノイズ蓄積を引き起こす。
               旅行先での強烈な吉方位であっても、移動直後は必ず静的アーシング（素足での土への接触等）を行い、同調（リシンク）時間を設けること。
            </p>
         </div>
      </div>
    </div>
  );
}

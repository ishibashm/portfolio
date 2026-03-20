"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Crosshair, Maximize, Minimize, Download, HelpCircle, Layers, Box } from "lucide-react";
import { BlockMath, InlineMath } from 'react-katex';
import { MagneticSpatialHUD } from "./MagneticSpatialHUD";
import { downloadKML } from "../utils/kmlExport";

// Because Leaflet needs the window object, we must dynamically import it with ssr: false
const MagneticMapInner = dynamic(() => import("./MagneticMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-zinc-950 border border-zinc-800 flex items-center justify-center font-mono text-xs text-zinc-600 md:animate-pulse">
      [ INITIALIZING SPATIAL VECTORS... ]
    </div>
  ),
});

interface MapProps {
  lat: number;
  lon: number;
  declination: number | null;
  inclination: number | null;
  intensity: number | null;
  vectors?: Record<string, string> | null;
  layers?: {
    yearLayer: Partial<Record<string, string>>;
    monthLayer: Partial<Record<string, string>>;
    dayLayer: Partial<Record<string, string>>;
    finalVectors: Record<string, string>;
  } | null;
  honmeiStar?: { physical: number; classical: number } | null;
  kpIndex?: number | null;
  ansLoad?: number;
  shieldCapacity?: number;
  hudLayers?: { terrain: boolean; weather: boolean; bio: boolean };
  toggleLayer?: (layer: 'terrain' | 'weather' | 'bio') => void;
}

export function TacticalMagneticMapComponent({ 
  lat, lon, declination, inclination, intensity, vectors, layers, honmeiStar, kpIndex, ansLoad, shieldCapacity = 100,
  hudLayers = { terrain: true, weather: true, bio: true },
  toggleLayer
}: MapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHUD, setShowHUD] = useState(true);
  const [activeDecryptTab, setActiveDecryptTab] = useState(1);

  return (
    <div className={`w-full max-w-6xl mt-8 grid grid-cols-1 ${isFullscreen ? "" : "lg:grid-cols-[1fr_350px]"} gap-4`}>
      
      {/* Map Container */}
      <div className={`relative border border-zinc-800 shadow-2xl w-full flex flex-col ${isFullscreen ? "fixed inset-0 z-100 bg-black h-screen" : "h-[400px] md:h-[600px] lg:h-[700px]"}`}>
         <div className="absolute top-0 left-0 w-full p-2 z-10 bg-linear-to-b from-black/80 to-transparent pointer-events-none flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Crosshair size={14} className="text-blue-500 md:animate-pulse" />
              <h2 className="text-xs uppercase font-mono tracking-widest text-zinc-300 drop-shadow-md">
                Tactical Magnetic Vectors
              </h2>
            </div>
            <div className="flex flex-col items-end gap-1">
               <div className="flex items-center gap-2">
                  {/* Layer Toggles */}
                  <div className="pointer-events-auto flex items-center bg-zinc-950/80 border border-zinc-800 p-0.5 rounded-sm mr-2">
                    <button 
                      onClick={() => toggleLayer?.('terrain')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono border-r border-zinc-800 transition-colors ${hudLayers.terrain ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-600'}`}
                      title="Terrain (Magnetic Base)"
                    >
                      TER
                    </button>
                    <button 
                      onClick={() => toggleLayer?.('weather')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono border-r border-zinc-800 transition-colors ${hudLayers.weather ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-600'}`}
                      title="Weather (Cosmic Storms)"
                    >
                      WTH
                    </button>
                    <button 
                      onClick={() => toggleLayer?.('bio')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors ${hudLayers.bio ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-600'}`}
                      title="Bio (Personal Resonance)"
                    >
                      BIO
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowHUD(!showHUD)}
                    className={`pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border rounded-sm transition-colors ${showHUD ? 'border-blue-500 text-blue-400' : 'border-zinc-700'}`}
                    title="Toggle 3D HUD"
                  >
                    <Box size={10} />
                    HUD: {showHUD ? 'ON' : 'OFF'}
                  </button>
                  <button 
                    onClick={() => downloadKML(lat, lon, declination || 0)}
                    className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border border-zinc-700 rounded-sm transition-colors"
                  >
                    <Download size={10} />
                    KML Export
                  </button>
                  <button 
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border border-zinc-700 rounded-sm transition-colors"
                    title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                  >
                    {isFullscreen ? <Minimize size={10} /> : <Maximize size={10} />}
                  </button>
               </div>
               <div className="text-[10px] font-mono text-zinc-400 text-right bg-black/50 px-1 py-0.5 border border-zinc-800/50">
                  COORD: {lat.toFixed(4)}N, {lon.toFixed(4)}E<br />
                  DEC: {declination ? declination.toFixed(2) : '--'}°
               </div>
            </div>
         </div>
         
         <div className="w-full h-full relative z-0 flex grow min-h-0 overflow-hidden bg-black">
             <MagneticMapInner
              lat={lat}
              lon={lon}
              declination={declination || 0}
              intensity={intensity || 50000}
              vectors={vectors}
              layers={layers}
              honmeiStar={honmeiStar}
              kpIndex={kpIndex}
              ansLoad={ansLoad}
              hudLayers={hudLayers}
              isFullscreen={isFullscreen}
             />
         </div>

         {/* 3D HUD Overlay */}
         <div className={`absolute bottom-2 left-2 z-20 pointer-events-auto transition-all duration-500 translate-y-0 ${showHUD ? 'opacity-100 scale-100' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}>
           <MagneticSpatialHUD 
             declination={declination || 0}
             inclination={inclination || 0}
             kpIndex={kpIndex || 0}
             shieldCapacity={shieldCapacity}
             size={isFullscreen ? 280 : 180}
           />
         </div>
         
          {/* Overlays */}
          <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
             <div className="bg-black/80 border border-zinc-800 p-2 font-mono text-[11px] leading-tight text-zinc-400 md:backdrop-blur-sm">
                <div className="text-emerald-500 font-bold mb-1">■ True North (Geo)</div>
                <div className="text-blue-500 font-bold">■ Magnetic North (WMM2020)</div>
                <div className="mt-2 text-zinc-600 text-[10px]">
                   * Lines represent primary spatial azimuths. <br/>
                  * Green overlays = safe vectors. Red = hazardous noise.
               </div>
            </div>
         </div>
      </div>
      {/* Theoretical Info Panel (Hidden by default) */}
      {!isFullscreen && (
        <details className="bg-zinc-950/90 border-t-2 border-zinc-700 font-mono text-zinc-400 text-[10px] w-full group shadow-2xl overflow-hidden mt-4">
          <summary className="p-3 lg:p-4 cursor-pointer bg-black focus:outline-none hover:bg-zinc-900 transition-colors uppercase tracking-widest font-bold text-zinc-500 list-none flex items-center justify-between border-b border-zinc-800">
             <div className="flex items-center gap-2">
               <span className="text-red-500 animate-pulse">■</span> [ TOP SECRET ] DECRYPT THEORETICAL DATA ARCHIVES
             </div>
             <span className="group-open:rotate-180 transition-transform text-zinc-600">▼</span>
          </summary>
          
          {/* Spec Sheet Terminal Container */}
          <div className="flex flex-col min-h-[350px]">
            {/* Horizontal Tab Menu List */}
            <div className="w-full border-b border-zinc-800 flex flex-row bg-black/50 overflow-x-auto custom-scrollbar snap-x">
              {[
                { id: 1, name: "D-CORRECT", subtitle: "WMM2020", shape: "[LINE]", color: "text-blue-500", border: "border-blue-500", bgActive: "bg-blue-900/10" },
                { id: 2, name: "V-FILTER", subtitle: "SPATIAL", shape: "[ZONE]", color: "text-emerald-500", border: "border-emerald-500", bgActive: "bg-emerald-900/10" },
                { id: 3, name: "E-ENGINE", subtitle: "EPHEMERIS", shape: "[CORE]", color: "text-purple-500", border: "border-purple-500", bgActive: "bg-purple-900/10" },
                { id: 4, name: "U-SYNC", subtitle: "UMWELT", shape: "[POINT]", color: "text-amber-500", border: "border-amber-500", bgActive: "bg-amber-900/10" },
              ].map(tab => (
                <button
                   key={tab.id}
                   onClick={(e) => { e.preventDefault(); setActiveDecryptTab(tab.id); }}
                   className={`flex flex-col text-center justify-center items-center py-2 px-4 border-b-2 transition-all min-w-[100px] sm:min-w-[120px] snap-center shrink-0 ${activeDecryptTab === tab.id ? `${tab.border} ${tab.bgActive} text-white` : 'border-transparent text-zinc-600 hover:bg-zinc-900/50 hover:text-zinc-400'}`}
                >
                   <span className={`text-[9px] font-bold tracking-widest uppercase ${activeDecryptTab === tab.id ? tab.color : 'text-zinc-500'}`}>SYS.{tab.id} {tab.shape}</span>
                   <span className="text-[10px] sm:text-[11px] font-bold mt-0.5">{tab.name}</span>
                   <span className="text-[8px] mt-0.5 opacity-60 hidden md:block">{tab.subtitle}</span>
                </button>
              ))}
            </div>

            {/* Tab Content Panel */}
            <div className="w-full p-4 sm:p-6 bg-[url('/scanline.png')] bg-repeat relative custom-scrollbar overflow-y-auto overflow-x-hidden max-h-[400px]">
                <div className="absolute inset-0 pointer-events-none opacity-5" style={{ backgroundImage: "linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.25) 50%), linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06))", backgroundSize: "100% 4px, 6px 100%"}}></div>
                
                <div className="relative z-10 flex flex-col gap-4">
                  
                  {/* SYS.1 */}
                  {activeDecryptTab === 1 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-blue-500 font-bold tracking-widest mb-2 border-b border-blue-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-blue-900/40 text-blue-400 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.1</span>
                           <span className="text-[7px] leading-none border-t border-blue-400/50 pt-1 w-full text-center">[LINE]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>MAGNETIC_DECLINATION_CORRECTION</span>
                           <span className="text-[9px] text-blue-400/80 flex items-center gap-1.5 mt-0.5"><span className="w-4 h-0.5 bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)] block"></span> MAP ELEMENT: Blue Magnetic North Line</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ TARGET ]</span>
                            <span className="text-zinc-300">地球磁場の精密トレースに基づく真の「磁北」の特性</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <span className="leading-relaxed">米国防総省規格 World Magnetic Model (WMM2020) を適用。地図上の北（Geographic North）と、コンパスが指す北（Magnetic North）の偏差 <InlineMath math="D" /> を計算する。</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ LOGIC_CORE ]</span>
                            <div className="bg-zinc-950/80 p-3 border border-zinc-800 text-center w-full shadow-inner font-mono text-[10px] overflow-x-auto whitespace-nowrap custom-scrollbar">
                               <InlineMath math="\vec{B}_\text{local} = R_z(D) \cdot \vec{B}_\text{geo}" />
                            </div>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3 mt-2">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ REASONING ]</span>
                            <span className="leading-relaxed text-zinc-500 text-[10px]">細胞内鉄分および生体プラズマへの磁束干渉モデルにおいては、地図上の形式的な北ではなく、リアルタイムの物理磁力線ベクトルに基づく必要があるため。</span>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.2 */}
                  {activeDecryptTab === 2 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-emerald-500 font-bold tracking-widest mb-2 border-b border-emerald-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-emerald-900/40 text-emerald-400 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.2</span>
                           <span className="text-[7px] leading-none border-t border-emerald-400/50 pt-1 w-full text-center">[ZONE]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>SPATIAL_VECTOR_FILTERS</span>
                           <span className="text-[9px] text-emerald-400/80 flex items-center gap-1.5 mt-0.5">
                             <div className="flex items-center"><span className="w-2.5 h-2.5 bg-emerald-500/60 block border border-emerald-400"></span><span className="w-2.5 h-2.5 bg-red-500/60 block border border-red-400 -ml-0.5"></span></div>
                             MAP ELEMENT: Colored Sector Overlays
                           </span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ TARGET ]</span>
                            <span className="text-zinc-300">空間方位上の電磁干渉帯（ノイズ境界）の回避</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <div className="flex flex-col gap-2">
                               <span className="leading-relaxed">十二支（子午卯酉、寅申巳亥など）に基づく空間方位を、特定周波数の電磁波が交差する物理的グリッドとして処理。正中線・四隅線にて <InlineMath math="\pm 10^\circ" /> の強力な磁束勾配（Gradient）を検知。</span>
                               <div className="flex flex-col gap-1 mt-1 text-[10px] font-mono border border-zinc-800 p-2 bg-black/40">
                                 <div><span className="text-emerald-500 font-bold">● SAFE VECTOR:</span> 磁束が平滑化された領域。代謝最適化。</div>
                                 <div><span className="text-red-500 font-bold">X NOISE VECTOR:</span> 境界波の干渉帯。ANS（自律神経）エラー源。</div>
                               </div>
                            </div>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-amber-900/50 pl-3 mt-2">
                            <span className="w-24 font-bold text-amber-500 uppercase tracking-widest shrink-0">[ WARNING ]</span>
                            <span className="leading-relaxed text-amber-500/80 text-[10px]">長距離空間移動（<InlineMath math="v > 100\text{km/h}" />）時は、地磁気切断により0Vベースラインが消失する。到着後は直ちにアース（静的接地）による再同調（リシンク）を実行せよ。</span>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.3 */}
                  {activeDecryptTab === 3 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-purple-500 font-bold tracking-widest mb-2 border-b border-purple-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-purple-900/40 text-purple-400 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.3</span>
                           <span className="text-[7px] leading-none border-t border-purple-400/50 pt-1 w-full text-center">[CORE]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>EPHEMERIS_ENGINE_RESONANCE</span>
                           <span className="text-[9px] text-purple-400/80 flex items-center gap-1.5 mt-0.5"><span className="w-3 h-3 border border-purple-500 rotate-45 block"></span> MAP ELEMENT: Invisible Base Matrix</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <span className="leading-relaxed">母体を離れ初アクセスした地磁気・太陽風の「宇宙スナップショット」をハッシュ関数へ入力。<InlineMath math="F_{\text{self}}" />（初期周波数）を算出し、現在の空間環境波とのリアルタイム干渉をシミュレートする。</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ LOGIC_CORE ]</span>
                            <div className="bg-zinc-950/80 p-3 border border-zinc-800 text-center w-full shadow-inner font-mono text-[10px] overflow-x-auto whitespace-nowrap custom-scrollbar">
                               <InlineMath math="F_{\text{self}} = (11 - \sum \text{digits}(Y)) \pmod 9" />
                            </div>
                         </div>
                         
                         <div className="flex flex-col mt-2 gap-2">
                            <div className="text-zinc-500 font-bold text-[10px] tracking-widest border-b border-zinc-800 pb-1 mb-1">■ TIME-SPAN CALCULATION MODELS</div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                               <div className="border border-purple-900/30 p-2 bg-purple-950/10">
                                 <div className="text-purple-400 font-bold mb-1">YEAR VECTOR</div>
                                 <div className="text-[9px] text-zinc-500">木星黄経（11.86年周期）の地磁気変調モデル。長期プロジェクトなど根幹定在波を決定。</div>
                               </div>
                               <div className="border border-amber-900/30 p-2 bg-amber-950/10">
                                 <div className="text-amber-500 font-bold mb-1">MONTH VECTOR</div>
                                 <div className="text-[9px] text-zinc-500">太陽と月の相対位相（潮汐摩擦）。体液・血流の短期バイオリズムを支配。</div>
                               </div>
                               <div className="border border-blue-900/30 p-2 bg-blue-950/10">
                                 <div className="text-blue-400 font-bold mb-1">DAY VECTOR</div>
                                 <div className="text-[9px] text-zinc-500">地球の自転と太陽風の直撃角。数時間単位の即効性自律神経トリガー。</div>
                               </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.4 */}
                  {activeDecryptTab === 4 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-amber-500 font-bold tracking-widest mb-2 border-b border-amber-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-amber-900/40 text-amber-500 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.4</span>
                           <span className="text-[7px] leading-none border-t border-amber-500/50 pt-1 w-full text-center">[POINT]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>UMWELT_SYNCHRONIZATION</span>
                           <span className="text-[9px] text-amber-500/80 flex items-center gap-1.5 mt-0.5"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)] block"></span> MAP ELEMENT: Center Location Ping</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ THEORY ]</span>
                            <span className="leading-relaxed">本システムは数学的な盤面（東洋方位術/九星気学）を、「太陽系の惑星周期と太陽風が地球磁気圏に与える干渉波の物理的フラクタル演算モデル」として再定義する。</span>
                         </div>
                         <div className="flex flex-col gap-2 mt-2">
                           <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-blue-900/50 pl-3">
                              <span className="w-24 font-bold text-blue-500 uppercase tracking-widest shrink-0">[ GALAXY ]</span>
                              <span className="text-zinc-400 text-[10px]">重力・磁気嵐サイクルが作り出す定在波（洛書マトリクス）。</span>
                           </div>
                           <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-emerald-900/50 pl-3">
                              <span className="w-24 font-bold text-emerald-500 uppercase tracking-widest shrink-0">[ EARTH ]</span>
                              <span className="text-zinc-400 text-[10px]">地表面へ投影された干渉グリッド（WMM2020偏角補正）。</span>
                           </div>
                           <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-purple-900/50 pl-3">
                              <span className="w-24 font-bold text-purple-500 uppercase tracking-widest shrink-0">[ HUMAN ]</span>
                              <span className="text-zinc-400 text-[10px]">母体外へ出た瞬間に地球磁場から自律神経（ANS）へ書き込まれる初期周波数（本命星）。</span>
                           </div>
                         </div>
                         <div className="bg-zinc-950 text-zinc-500 p-3 italic text-center font-mono text-[9px] mt-4 shadow-inner border border-zinc-800">
                           <span className="text-blue-500">"We do not read fortunes. We decode planetary telemetry."</span>
                           <br />（我々は運命を占わない。惑星のテレメトリをデコードするのだ。）
                         </div>
                      </div>
                    </div>
                  )}

                </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

export const TacticalMagneticMap = React.memo(TacticalMagneticMapComponent);

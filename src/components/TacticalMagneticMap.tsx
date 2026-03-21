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
    <div className={`w-full max-w-6xl mt-8 flex flex-col gap-4`}>
      
      {/* Map Container */}
      <div className={`relative border border-zinc-800 shadow-2xl w-full flex flex-col ${isFullscreen ? "fixed inset-0 z-100 bg-black h-screen" : "h-[400px] md:h-[600px] lg:h-[700px]"}`}>
         <div className="absolute top-0 left-0 w-full p-2 z-10 bg-linear-to-b from-black/80 to-transparent pointer-events-none flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Crosshair size={14} className="text-blue-500 md:animate-pulse" />
              <h2 className="text-xs uppercase font-mono tracking-widest text-zinc-300 drop-shadow-md">
                [稼働環境] 地磁気・太陽風ベクター観測
              </h2>
            </div>
            <div className="flex flex-col items-end gap-1">
               <div className="flex items-center gap-2">
                  {/* Layer Toggles */}
                  <div className="pointer-events-auto flex items-center bg-zinc-950/80 border border-zinc-800 p-0.5 rounded-sm mr-2">
                    <button 
                      onClick={() => toggleLayer?.('terrain')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono border-r border-zinc-800 transition-colors ${hudLayers.terrain ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-600'}`}
                      title="TER (地形・磁場ベース)"
                    >
                      TER [基盤帯]
                    </button>
                    <button 
                      onClick={() => toggleLayer?.('weather')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono border-r border-zinc-800 transition-colors ${hudLayers.weather ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-600'}`}
                      title="WTH (宇宙天気・磁気嵐)"
                    >
                      WTH [変動波]
                    </button>
                    <button 
                      onClick={() => toggleLayer?.('bio')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors ${hudLayers.bio ? 'text-purple-400 bg-purple-500/10' : 'text-zinc-600'}`}
                      title="BIO (生体共鳴・固有波長)"
                    >
                      BIO [生体波]
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
                  制作者座標: {lat.toFixed(4)}N, {lon.toFixed(4)}E<br />
                  現在地磁気偏角: {declination ? declination.toFixed(2) : '--'}°
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
                <div className="text-emerald-500 font-bold mb-1">■ 地図上の真北 (Geo)</div>
                <div className="text-blue-500 font-bold">■ 実際の磁北 (WMM2020補正)</div>
                <div className="mt-2 text-zinc-600 text-[10px]">
                   * 「Hardware Initialization & Anchor Sync」の設定値をベースに当サイト上で動的に算出・同期された最適化ベクトル。<br/>
                  * <span className="text-emerald-500/70">緑の帯</span>: パフォーマンスが最大化される行動推奨ゾーン<br/>
                  * <span className="text-red-500/70">赤の帯</span>: エラーを誘発する非推奨ベクトル
               </div>
            </div>
         </div>
      </div>
      {/* Theoretical Info Panel */}
      {!isFullscreen && (
        <div className="bg-zinc-950/90 border-t-2 border-zinc-700 font-mono text-zinc-400 text-[10px] w-full shadow-2xl overflow-hidden mt-4">
          <div className="p-3 lg:p-4 bg-black border-b border-zinc-800 flex items-center justify-between uppercase tracking-widest font-bold text-zinc-500">
             <div className="flex items-center gap-2">
               <span className="text-red-500 animate-pulse">■</span> [ TOP SECRET ] DECRYPT THEORETICAL DATA ARCHIVES
             </div>
          </div>
          
          {/* Spec Sheet Terminal Container */}
          <div className="flex flex-col min-h-[350px]">
            {/* Horizontal Tab Menu List */}
            <div className="w-full border-b border-zinc-800 flex flex-row bg-black/50 overflow-x-auto custom-scrollbar snap-x">
              {[
                { id: 1, name: "D-CORRECT", subtitle: "WMM2020", shape: "[LINE]", color: "text-blue-500", border: "border-blue-500", bgActive: "bg-blue-900/10" },
                { id: 2, name: "V-FILTER", subtitle: "SPATIAL", shape: "[ZONE]", color: "text-emerald-500", border: "border-emerald-500", bgActive: "bg-emerald-900/10" },
                { id: 3, name: "E-ENGINE", subtitle: "EPHEMERIS", shape: "[CORE]", color: "text-purple-500", border: "border-purple-500", bgActive: "bg-purple-900/10" },
                { id: 4, name: "U-SYNC", subtitle: "UMWELT", shape: "[POINT]", color: "text-amber-500", border: "border-amber-500", bgActive: "bg-amber-900/10" },
                { id: 5, name: "B-REVIEW", subtitle: "BIO-PHYSICS", shape: "[EVAL]", color: "text-rose-500", border: "border-rose-500", bgActive: "bg-rose-900/10" },
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
            <div className="w-full p-4 sm:p-6 bg-[url('/scanline.png')] bg-repeat relative overflow-x-hidden z-10">
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
                            <span className="text-zinc-300">地図の北と「実際の磁北」のズレ補正</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <span className="leading-relaxed">米国防総省規格(WMM2020)で磁気偏差 <InlineMath math="D" /> を計算し、コンパスの指す北(Magnetic North)を真北に補正する。</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ LOGIC_CORE ]</span>
                            <div className="bg-zinc-950/80 p-3 border border-zinc-800 text-center w-full shadow-inner font-mono text-[10px] overflow-x-auto whitespace-nowrap custom-scrollbar">
                               <InlineMath math="\vec{B}_\text{local} = R_z(D) \cdot \vec{B}_\text{geo}" />
                            </div>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3 mt-2">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ REASONING ]</span>
                            <span className="leading-relaxed text-zinc-500 text-[10px]">脳内マグネタイト(生体磁石)や生体プラズマへの磁束干渉は、地図上の形式的な北ではなく、リアルタイムの物理磁力線ベクトルに依存するため。</span>
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
                            <span className="text-zinc-300">パーソナライズされた演算データによる行動最適化の可視化</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <div className="flex flex-col gap-2">
                               <span className="leading-relaxed">「Hardware Initialization」の入力値から算出された固有波長と、現在の環境波長との干渉をリアルタイムに処理しマップ上にマッピング。</span>
                               <div className="flex flex-col gap-1 mt-1 text-[10px] font-mono border border-zinc-800 p-2 bg-black/40">
                                 <div><span className="text-emerald-500 font-bold">● 🟩 最適化ゾーン(緑):</span> パフォーマンスが最大化される行動推奨ゾーン。</div>
                                 <div><span className="text-blue-500 font-bold">● 🟦 通常ゾーン(青):</span> 標準的な環境負荷。致命的な干渉が発生していないベースライン。</div>
                                 <div><span className="text-red-500 font-bold">X 🟥 非推奨ベクトル(赤):</span> 演算に基づく行動阻害エリア。エラーやANS過負荷を誘発する境界。</div>
                               </div>
                            </div>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-amber-900/50 pl-3 mt-2">
                            <span className="w-24 font-bold text-amber-500 uppercase tracking-widest shrink-0">[ WARNING ]</span>
                            <span className="leading-relaxed text-amber-500/80 text-[10px]">高速移動(<InlineMath math="v > 100\text{km/h}" />)時は地磁気切断で0Vベースラインが消失。到着後は直ちにアース(静的接地)で再同調(リシンク)を。</span>
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
                           <span className="text-[9px] text-purple-400/80 flex items-center gap-1.5 mt-0.5"><span className="w-3 h-3 border border-purple-500/30 rounded-full border-dashed flex items-center justify-center"></span> MAP ELEMENT: Invisible Base Matrix (地図上非表示)</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <span className="leading-relaxed">誕生時の地磁気・太陽風データ(宇宙スナップショット)から初期周波数 <InlineMath math="F_{\text{self}}" /> を算出。現在の環境波とのリアルタイム干渉をシミュレートする。</span>
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
                                 <div className="text-[9px] text-zinc-500">木星黄経(11.86年周期)の地磁気変調。長期的な根幹定在波。</div>
                               </div>
                               <div className="border border-amber-900/30 p-2 bg-amber-950/10">
                                 <div className="text-amber-500 font-bold mb-1">MONTH VECTOR</div>
                                 <div className="text-[9px] text-zinc-500">太陽・月の相対位相(潮汐摩擦)。体液・血流の短期バイオリズム。</div>
                               </div>
                               <div className="border border-blue-900/30 p-2 bg-blue-950/10">
                                 <div className="text-blue-400 font-bold mb-1">DAY VECTOR</div>
                                 <div className="text-[9px] text-zinc-500">地球自転と太陽風直撃角。数時間単位の即効性自律神経トリガー。</div>
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
                            <span className="leading-relaxed">東洋の方位術を、惑星周期と太陽風が地球磁場に与える干渉波の「物理的フラクタル演算モデル」として再定義する。</span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-red-900/50 pl-3">
                            <span className="w-24 font-bold text-red-500 uppercase tracking-widest shrink-0">[ MECHANISM ]</span>
                            <span className="leading-relaxed text-zinc-300 text-[10px]">
                              脳内にある<span className="text-red-400 font-bold">マグネタイト(生体磁石)</span>や網膜の<span className="text-red-400 font-bold">量子磁気受容体(クリプトクロム)</span>が環境磁場を直接感知する。加えて、地球の電磁定在波<span className="text-red-400 font-bold">(シューマン共振: 7.83Hz)</span>が人間の脳波と直接同期しているため、太陽風や磁気嵐の物理ノイズは、自律神経(ANS)の乱れや生体エラーとして身体に干渉する。
                            </span>
                         </div>
                         <div className="flex flex-col gap-2 mt-2">
                           <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-blue-900/50 pl-3">
                              <span className="w-24 font-bold text-blue-500 uppercase tracking-widest shrink-0">[ GALAXY ]</span>
                              <span className="text-zinc-400 text-[10px]">磁気嵐サイクルが生む定在波(洛書マトリクス)。</span>
                           </div>
                           <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-emerald-900/50 pl-3">
                              <span className="w-24 font-bold text-emerald-500 uppercase tracking-widest shrink-0">[ EARTH ]</span>
                              <span className="text-zinc-400 text-[10px]">地表に投影される干渉グリッド(WMM2020補正)。</span>
                           </div>
                           <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-purple-900/50 pl-3">
                              <span className="w-24 font-bold text-purple-500 uppercase tracking-widest shrink-0">[ HUMAN ]</span>
                              <span className="text-zinc-400 text-[10px]">誕生時に地球磁場から自律神経(ANS)に刻まれる初期周波数(本命星)。</span>
                           </div>
                         </div>
                         <div className="bg-zinc-950 text-zinc-500 p-3 italic text-center font-mono text-[9px] mt-4 shadow-inner border border-zinc-800">
                           <span className="text-blue-500">"We do not read fortunes. We decode planetary telemetry."</span>
                           <br />（我々は運命を占わない。惑星のテレメトリをデコードするのだ。）
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.5 */}
                  {activeDecryptTab === 5 && (
                    <div className="animate-fade-in flex flex-col gap-4 mb-10 pb-10">
                      <div className="text-rose-500 font-bold tracking-widest mb-2 border-b border-rose-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-rose-900/40 text-rose-500 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.5</span>
                           <span className="text-[7px] leading-none border-t border-rose-500/50 pt-1 w-full text-center">[EVAL]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>MULTI-DISCIPLINARY_REVIEW</span>
                           <span className="text-[9px] text-rose-500/80 flex items-center gap-1.5 mt-0.5"><span className="w-2.5 h-2.5 bg-rose-500 rotate-45 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)] block"></span> MAP ELEMENT: Theoretical Consensus</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ OVERVIEW ]</span>
                            <span className="leading-relaxed">なぜ環境磁場が人体に影響を与えるのか。本システムの生態物理学的メカニズムについて、5つの専門領域からの検証結果。</span>
                         </div>
                         <div className="flex flex-col gap-3 mt-2">
                            {/* Expert 1 */}
                            <div className="border border-zinc-800 bg-zinc-950/50 p-3 relative mt-2">
                               <div className="text-[9px] text-blue-400 font-mono absolute -top-2 left-2 bg-black px-1 border border-zinc-800">◆ 空間物理学 / 宇宙天気予報</div>
                               <span className="text-zinc-300 text-[10px] sm:text-xs leading-relaxed inline-block mt-1">「太陽風のプラズマが地球磁気圏に衝突すると『磁気嵐』が発生する。送電網すら破壊する巨大な電磁ノイズが、微細な電気信号で動く人間の神経系（脳波や心電図）に干渉しないと考える方が不自然だ。リアルタイムのWMM2020を用いた偏差補正は、人工衛星の軌道計算にも使われる非常に強固なアプローチと言える。」</span>
                            </div>
                            {/* Expert 2 */}
                            <div className="border border-zinc-800 bg-zinc-950/50 p-3 relative mt-2">
                               <div className="text-[9px] text-emerald-400 font-mono absolute -top-2 left-2 bg-black px-1 border border-zinc-800">◆ 生体電磁気学 / 神経科学</div>
                               <span className="text-zinc-300 text-[10px] sm:text-xs leading-relaxed inline-block mt-1">「人間の脳組織には『マグネタイト』と呼ばれる生体磁石が含まれ、網膜には『クリプトクロム』という磁場に反応する量子受容体がある。これらが外部の地磁気変動を直接感知し、自律神経(ANS)の交感・副交感神経のバランスを物理的に乱すメカニズムは、科学的にも証明されつつある。」</span>
                            </div>
                            {/* Expert 3 */}
                            <div className="border border-zinc-800 bg-zinc-950/50 p-3 relative mt-2">
                               <div className="text-[9px] text-amber-400 font-mono absolute -top-2 left-2 bg-black px-1 border border-zinc-800">◆ アルゴリズム設計 / 情報工学</div>
                               <span className="text-zinc-300 text-[10px] sm:text-xs leading-relaxed inline-block mt-1">「誕生時の天体配置（宇宙環境パラメータ）を『初期周波数(<InlineMath math="F_{\text{self}}" />)のシード値』としてハッシュ関数に入力し、現在の環境波との干渉スペクトルを演算する設計が極めてエレガントだ。東洋の伝統的な盤面を『フラクタルな干渉波の物理計算』としてリバースエンジニアリングした点が高く評価できる。」</span>
                            </div>
                            {/* Expert 4 */}
                            <div className="border border-zinc-800 bg-zinc-950/50 p-3 relative mt-2">
                               <div className="text-[9px] text-purple-400 font-mono absolute -top-2 left-2 bg-black px-1 border border-zinc-800">◆ 環境生理学 / パフォーマンス科学</div>
                               <span className="text-zinc-300 text-[10px] sm:text-xs leading-relaxed inline-block mt-1">「地球そのものが発する7.83Hzの定在波『シューマン共振』は、人間のリラックス時の脳波（アルファ波〜シータ波）と完全に一致する。高速移動や電磁ノイズ帯でこのベースラインが切断されると自己治癒力への悪影響があるため、『到着後のアース（静的接地）による再同調』は、トップアスリートも実践する極めて論理的な対策だ。」</span>
                            </div>
                            {/* Expert 5 */}
                            <div className="border border-zinc-800 bg-zinc-950/50 p-3 relative mt-2">
                               <div className="text-[9px] text-rose-400 font-mono absolute -top-2 left-2 bg-black px-1 border border-zinc-800">◆ 現代風水学 / 東洋データサイエンティスト</div>
                               <span className="text-zinc-300 text-[10px] sm:text-xs leading-relaxed inline-block mt-1">「最高だ。五黄や暗剣といった東洋占星術の用語を一切合切捨て去り、『演算に基づく行動阻害エリア』と定義し直した。古い慣習のままではなく、再現性のある行動科学のリスク・アルゴリズムへと昇華されている。古代の叡智を現代のデータトラッキングとして完全に洗練させた究極の形だね。」</span>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const TacticalMagneticMap = React.memo(TacticalMagneticMapComponent);

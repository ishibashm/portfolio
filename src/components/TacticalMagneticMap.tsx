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
  activeLayerMode?: 'final' | 'year' | 'month' | 'day';
  setActiveLayerMode?: (mode: 'final' | 'year' | 'month' | 'day') => void;
}

export function TacticalMagneticMapComponent({ 
  lat, lon, declination, inclination, intensity, vectors, layers, honmeiStar, kpIndex, ansLoad, shieldCapacity = 100,
  hudLayers = { terrain: true, weather: true, bio: true },
  toggleLayer,
  activeLayerMode = 'final',
  setActiveLayerMode
}: MapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHUD, setShowHUD] = useState(true);
  const [activeDecryptTab, setActiveDecryptTab] = useState(1);

  return (
    <div className={`w-full max-w-6xl mt-8 flex flex-col gap-4`}>
      
      {/* Map Container */}
      <div className={`relative border border-zinc-800 shadow-2xl w-full flex flex-col ${isFullscreen ? "fixed inset-0 z-100 bg-black h-screen" : "h-[400px] md:h-[600px] lg:h-[700px]"}`}>
         <div className="absolute top-0 left-0 w-full p-2 z-10 bg-linear-to-b from-black/80 to-transparent pointer-events-none flex flex-col sm:flex-row justify-between items-start gap-2">
            <div className="flex items-center gap-2">
              <Crosshair size={14} className="text-blue-500 md:animate-pulse mt-1" />
              <div className="flex flex-col">
                <h2 className="text-xs uppercase font-mono tracking-widest text-zinc-300 drop-shadow-md">
                  [稼働環境] 地磁気・太陽風ベクター観測
                </h2>
                
                {/* Layer Mode Switcher */}
                <div className="pointer-events-auto flex items-center mt-1.5 bg-zinc-950/80 border border-zinc-800 rounded-sm overflow-hidden text-[9px] font-mono w-max">
                  <button 
                    onClick={() => setActiveLayerMode && setActiveLayerMode('final')}
                    className={`px-2 py-1 transition-colors ${activeLayerMode === 'final' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-500 hover:text-zinc-300'} border-r border-zinc-800`}
                  >
                    FINAL(統合)
                  </button>
                  <button 
                    onClick={() => setActiveLayerMode && setActiveLayerMode('year')}
                    className={`px-2 py-1 transition-colors ${activeLayerMode === 'year' ? 'bg-indigo-900/50 text-indigo-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'} border-r border-zinc-800`}
                  >
                    YEAR(年)
                  </button>
                  <button 
                    onClick={() => setActiveLayerMode && setActiveLayerMode('month')}
                    className={`px-2 py-1 transition-colors ${activeLayerMode === 'month' ? 'bg-purple-900/50 text-purple-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'} border-r border-zinc-800`}
                  >
                    MONTH(月)
                  </button>
                  <button 
                    onClick={() => setActiveLayerMode && setActiveLayerMode('day')}
                    className={`px-2 py-1 transition-colors ${activeLayerMode === 'day' ? 'bg-cyan-900/50 text-cyan-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    DAY(日)
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
               <div className="flex items-center gap-2">
                  {/* Layer Toggles */}
                  <div className="pointer-events-auto flex items-center bg-zinc-950/80 border border-zinc-800 p-0.5 rounded-sm mr-2 hidden lg:flex">
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
              activeLayerMode={activeLayerMode}
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
                { id: 1, name: "CORE", subtitle: "基本算出概念", shape: "[基礎]", color: "text-zinc-300", border: "border-zinc-500", bgActive: "bg-zinc-800/80" },
                { id: 2, name: "LONG/MID", subtitle: "年盤・月盤", shape: "[年月]", color: "text-indigo-400", border: "border-indigo-500", bgActive: "bg-indigo-900/20" },
                { id: 3, name: "SHORT", subtitle: "日盤", shape: "[日]", color: "text-cyan-400", border: "border-cyan-500", bgActive: "bg-cyan-900/20" },
                { id: 4, name: "BIO NOISE", subtitle: "パーソナル", shape: "[固有]", color: "text-fuchsia-400", border: "border-fuchsia-500", bgActive: "bg-fuchsia-900/20" },
                { id: 5, name: "FINAL", subtitle: "統合判定", shape: "[最適化]", color: "text-white", border: "border-zinc-400", bgActive: "bg-zinc-800" },
              ].map(tab => (
                <button
                   key={tab.id}
                   onClick={(e) => { e.preventDefault(); setActiveDecryptTab(tab.id); }}
                   className={`flex flex-col text-center justify-center items-center py-2 px-4 border-b-2 transition-all min-w-[100px] sm:min-w-[124px] snap-center shrink-0 ${activeDecryptTab === tab.id ? `${tab.border} ${tab.bgActive} text-white` : 'border-transparent text-zinc-600 hover:bg-zinc-900/50 hover:text-zinc-400'}`}
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
                  
                  {/* SYS.1: CORE */}
                  {activeDecryptTab === 1 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-zinc-300 font-bold tracking-widest mb-2 border-b border-zinc-700 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-zinc-800/80 text-zinc-300 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.1</span>
                           <span className="text-[7px] leading-none border-t border-zinc-500/50 pt-1 w-full text-center">[CORE]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>基本となるベクトル算出概念</span>
                           <span className="text-[9px] text-zinc-500 mt-0.5">占いやオカルトを排除した天体物理学的アルゴリズム</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ CONCEPT ]</span>
                            <span className="leading-relaxed">
                               東洋占星術（九星気学・四柱推命）の根幹を、<strong className="text-blue-400">「天体（太陽・月・木星）の相対的な幾何学・重力ベクトルが地球の磁場ループに与える干渉」</strong>として数式（物理モデル）にリバースエンジニアリングしています。
                            </span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ METHOD ]</span>
                            <span className="leading-relaxed">
                               旧暦のカレンダー（2月4日など）をそのまま信用せず、米国防総省規格の天文エンジン（WMM2020 / VSOP87）を使用し、リアルタイムな<strong className="text-blue-400">太陽黄経・月相・ユリウス日</strong>から空間のノイズ状態を計算・導出します。
                            </span>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.2: YEAR / MONTH */}
                  {activeDecryptTab === 2 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-indigo-400 font-bold tracking-widest mb-2 border-b border-indigo-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-indigo-900/40 text-indigo-400 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.2</span>
                           <span className="text-[7px] leading-none border-t border-indigo-500/50 pt-1 w-full text-center">[LONG/MID]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>年盤・月盤のベースライン演算</span>
                           <span className="text-[9px] text-indigo-400/80 flex items-center gap-1.5 mt-0.5">長期・中期にわたる空間の電磁気定在波（五黄・暗剣クラス）</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3">
                            <span className="w-24 font-bold text-indigo-400 uppercase tracking-widest shrink-0">[ YEAR ]</span>
                            <span className="leading-relaxed">
                               木星の公転周期（約11.86年）が生み出す巨大な磁気潮汐を基幹サイクルとし、太陽黄経315度（真の立春位相）をフラクタルな周期の切り替えポイントとして、1〜9の基本波長を算出します。<br/>
                               中心に「5 (ベースノイズ)」が位置するサイクルでは、特定の方向に強烈な物理ノイズ（NOISE_GOU / NOISE_ANKEN）が発生します。
                            </span>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3 mt-2">
                            <span className="w-24 font-bold text-purple-400 uppercase tracking-widest shrink-0">[ MONTH ]</span>
                            <span className="leading-relaxed">
                               月と太陽の黄経差（月相・引力による潮汐摩擦力）と、太陽の黄道上位置（季節波）を「AM変調波」のように掛け合わせて中期波長を算出します。
                               <InlineMath math="(\text{SolarTerm} \times 12 + \text{LunarPhase}) \pmod 9" /> の数式によって特定のベクトルに月の干渉ノイズを与えます。
                            </span>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.3: DAY */}
                  {activeDecryptTab === 3 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-cyan-400 font-bold tracking-widest mb-2 border-b border-cyan-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-cyan-900/40 text-cyan-400 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.3</span>
                           <span className="text-[7px] leading-none border-t border-cyan-500/50 pt-1 w-full text-center">[SHORT]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>日盤（地球自転）の位相計算</span>
                           <span className="text-[9px] text-cyan-400/80 flex items-center gap-1.5 mt-0.5">数時間〜数日単位での太陽風直撃角の変化</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-amber-900/50 pl-3">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ ALGORITHM ]</span>
                            <div className="flex flex-col gap-2">
                               <span className="leading-relaxed">
                                  自転軸への光の入り方（太陽黄経 L0）によって、自転サイクルの「エネルギー増幅 / 減衰」のベクトルが完全に反転することを利用しています。
                               </span>
                               <ul className="list-disc ml-4 space-y-1 text-zinc-300 mt-1">
                                  <li><span className="text-cyan-500 font-bold">夏至（L0=90°）〜 初冬：</span> 太陽エネルギーが減衰する位相（陰遁フラクタル）。Julian Dayに逆相キャンセルを掛けて算出。</li>
                                  <li><span className="text-cyan-300 font-bold">冬至（L0=270°）〜 初夏：</span> エネルギーが増幅する位相（陽遁フラクタル）。順次インクリメントで算出。</li>
                               </ul>
                               <div className="mt-1 text-[9px] text-zinc-500 italic">
                                  ※カレンダーの「日・月」など人工的な区切りを一切使用せず、Julian Day(ユリウス日)から直接計算する非常に高精度な関数モデルです。
                               </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.4: BIO NOISE */}
                  {activeDecryptTab === 4 && (
                    <div className="animate-fade-in flex flex-col gap-4">
                      <div className="text-[#d946ef] font-bold tracking-widest mb-2 border-b border-fuchsia-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-fuchsia-900/40 text-[#d946ef] px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.4</span>
                           <span className="text-[7px] leading-none border-t border-fuchsia-500/50 pt-1 w-full text-center">[BIO]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>パーソナル波長との強干渉（本命殺）</span>
                           <span className="text-[9px] text-fuchsia-400/80 flex items-center gap-1.5 mt-0.5">固有の自律神経波長へ向けた電磁波ノイズの抽出結果</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-fuchsia-900/50 pl-3">
                            <span className="w-24 font-bold text-[#d946ef] uppercase tracking-widest shrink-0">[ RESONANCE ]</span>
                            <div className="flex flex-col gap-1">
                               <span className="leading-relaxed text-zinc-300">
                                  あなたが誕生時に受けた地球磁場「Hardware Init（固有波長・本命星）」と、現在の空間波長が強烈に干渉・反発しあう方位を算出します。
                               </span>
                               <span className="text-[9px] text-fuchsia-400">※固有波長とは、あなたの身体（ハードウェア）が初期化された年月に浴びた自律神経層の初期設定リズムのことです。</span>
                            </div>
                         </div>
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-zinc-700 pl-3 mt-2">
                            <span className="w-24 font-bold text-zinc-500 uppercase tracking-widest shrink-0">[ NOISE TYPE ]</span>
                            <div className="flex flex-col gap-2">
                               <div className="bg-fuchsia-950/20 p-2 border border-fuchsia-900/30">
                                  <strong className="text-[#d946ef]">同調過多 (NOISE_HONMEI / 本命殺)</strong>
                                  <p className="text-[9px] mt-0.5 text-zinc-400">空間波長と出力波長が完全に被り、ハウリング（不整脈や焦燥感）を起こすベクトル。</p>
                               </div>
                               <div className="bg-fuchsia-950/20 p-2 border border-fuchsia-900/30">
                                  <strong className="text-[#d946ef]">反射干渉 (NOISE_TEKI / 的殺)</strong>
                                  <p className="text-[9px] mt-0.5 text-zinc-400">対極の位置から返ってくる反射位相により、行動の空振りや予測エラーが発生するベクトル。</p>
                               </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                  {/* SYS.5: FINAL VECTOR */}
                  {activeDecryptTab === 5 && (
                    <div className="animate-fade-in flex flex-col gap-4 mb-10 pb-10">
                      <div className="text-emerald-500 font-bold tracking-widest mb-2 border-b border-emerald-900/50 pb-2 uppercase flex items-start gap-2 text-xs sm:text-sm">
                         <div className="bg-emerald-900/40 text-emerald-500 px-1.5 py-1 flex flex-col items-center shrink-0">
                           <span className="text-[8px] leading-none mb-1">SYS.5</span>
                           <span className="text-[7px] leading-none border-t border-emerald-500/50 pt-1 w-full text-center">[FINAL]</span>
                         </div>
                         <div className="flex flex-col justify-center">
                           <span>全位相レイヤーの統合最適化ロジック</span>
                           <span className="text-[9px] text-emerald-500/80 flex items-center gap-1.5 mt-0.5">マップ初期表示「FINALモード」における安全/危険の導出基準</span>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 text-[10px] sm:text-xs text-zinc-400">
                         <div className="flex flex-col md:flex-row md:gap-4 border-l-2 border-emerald-900/50 pl-3">
                            <span className="w-24 font-bold text-emerald-500 uppercase tracking-widest shrink-0">[ LOGIC TREE ]</span>
                            <div className="flex flex-col gap-3">
                               <span className="leading-relaxed text-zinc-300">
                                  Year / Month / Day の3つの独立したシステムレイヤーを重ね合わせ、各方位の「最終ベクター」を以下のように論理判定（AND/OR）します。
                               </span>
                               
                               <div className="bg-black/60 p-3 border border-zinc-800 font-mono text-[9px] md:text-[10px]">
                                  <div className="text-red-400 mb-1">IF (Year OR Month OR Day == 致命的ノイズ)</div>
                                  <div className="ml-4 mb-2 text-zinc-500">→ <strong className="text-red-500">[ 🟥 凶殺ベクトル (赤) ]</strong> (NOISE) 宇宙天気や地球磁場由来の物理的ノイズ。進入は固く禁止されます。</div>
                                  
                                  <div className="text-[#d946ef] mb-1">ELSE IF (個人の固有波長(本命星)と強干渉する)</div>
                                  <div className="ml-4 mb-2 text-zinc-500">→ <strong className="text-[#d946ef]">[ 🟪 生体警告ベクトル (紫) ]</strong> (WARNING) あなたの生体波長と反発する「本命殺・的殺」。環境自体は正常でも個人のエラーが増加します。</div>

                                  <div className="text-yellow-400 mb-1">ELSE IF (構造的バグ・空亡/天中殺)</div>
                                  <div className="ml-4 mb-2 text-zinc-500">→ <strong className="text-yellow-500">[ 🟨 警告ゾーン (黄) ]</strong> (WARNING) 空間のフレームワークが崩壊しているバグ領域。不可侵。</div>

                                  <div className="text-emerald-400 mb-1">ELSE IF (全レイヤーノイズ無し AND 目的/固有波長と完全共鳴)</div>
                                  <div className="ml-4 mb-2 text-zinc-500">→ <strong className="text-emerald-500">[ 🟩 最適化ゾーン (緑) ]</strong> (OPTIMAL) 能力が増幅される超推奨帯。(※条件が厳しいため表示されない事が多いです)</div>
                                  
                                  <div className="text-blue-400 mb-1">ELSE</div>
                                  <div className="ml-4 text-zinc-500">→ <strong className="text-blue-500">[ 🟦 通常ゾーン (透明) ]</strong> (SAFE) リスクもなく加点もないフラットな帯域。画面上では「透明/無色」で表現されます。</div>
                               </div>
                               
                               <span className="text-[9px] text-emerald-400/80 mt-1 italic">
                                  ※レイヤー単体表示（YEAR/MONTH等）時には統合された「共鳴連携」が存在しないため、緑の最適化ゾーンは存在しません。
                               </span>
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

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
  physicalLayers?: {
    yearLayer: Partial<Record<string, string>>;
    monthLayer: Partial<Record<string, string>>;
    dayLayer: Partial<Record<string, string>>;
    finalVectors: Record<string, string>;
  } | null;
  classicalLayers?: {
    yearLayer: Partial<Record<string, string>>;
    monthLayer: Partial<Record<string, string>>;
    dayLayer: Partial<Record<string, string>>;
    finalVectors: Record<string, string>;
  } | null;
  honmeiStar?: { physical: number; classical: number } | null;
  kpIndex?: number | null;
  ansLoad?: number;
  shieldCapacity?: number;
  hudLayers?: { terrain: boolean; weather: boolean; bio: boolean; hazard?: boolean };
  toggleLayer?: (layer: 'terrain' | 'weather' | 'bio' | 'hazard') => void;
  activeLayerMode?: 'final' | 'year' | 'month' | 'day';
  setActiveLayerMode?: (mode: 'final' | 'year' | 'month' | 'day') => void;
  activeModel?: 'physical' | 'classical';
  properties?: any[];
  useTrueNorth?: boolean;
  setUseTrueNorth?: (val: boolean) => void;
  onSelectTarget?: (lat: number, lon: number) => void;
}

export function TacticalMagneticMapComponent({ 
  lat, lon, declination, inclination, intensity, physicalLayers, classicalLayers, honmeiStar, kpIndex, ansLoad, shieldCapacity = 100,
  hudLayers = { terrain: true, weather: true, bio: true, hazard: false },
  toggleLayer,
  activeLayerMode = 'final',
  setActiveLayerMode,
  activeModel = 'physical',
  properties = [],
  useTrueNorth: propsUseTrueNorth,
  setUseTrueNorth: propsSetUseTrueNorth,
  onSelectTarget
}: MapProps) {
  const [showHUD, setShowHUD] = useState(true);
  const [localUseTrueNorth, localSetUseTrueNorth] = useState(false);
  const useTrueNorth = propsUseTrueNorth !== undefined ? propsUseTrueNorth : localUseTrueNorth;
  const setUseTrueNorth = propsSetUseTrueNorth !== undefined ? propsSetUseTrueNorth : localSetUseTrueNorth;
  const [activeDecryptTab, setActiveDecryptTab] = useState(1);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const isPhysical = activeModel === 'physical';
  const activeLayers = isPhysical ? physicalLayers : classicalLayers;
  const activeVectors = React.useMemo(() => {
    if (!activeLayers) return {};
    if (activeLayerMode === 'final') return activeLayers.finalVectors || {};
    if (activeLayerMode === 'year') return activeLayers.yearLayer || {};
    if (activeLayerMode === 'month') return activeLayers.monthLayer || {};
    if (activeLayerMode === 'day') return activeLayers.dayLayer || {};
    return {};
  }, [activeLayers, activeLayerMode]);

  const borderColor = isPhysical ? 'border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-zinc-500/50 shadow-[0_0_15px_rgba(113,113,122,0.2)]';

  return (
    <div className={`w-full max-w-6xl mt-8 flex flex-col gap-4`}>
      
      {/* Map Container */}
      <div 
        ref={mapContainerRef}
        className={`relative border ${borderColor} transition-all duration-500 shadow-2xl w-full flex flex-col h-[400px] md:h-[600px] lg:h-[700px]`}
      >
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
                    <button 
                      onClick={() => toggleLayer?.('hazard')}
                      className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors border-l border-zinc-800 ${hudLayers.hazard ? 'text-red-500 bg-red-500/10 font-bold' : 'text-zinc-600'}`}
                      title="HZD (ハザードマップ・外部GIS連携)"
                    >
                      HZD [災害域]
                    </button>
                  </div>
                  <button 
                    onClick={() => setUseTrueNorth(!useTrueNorth)}
                    className={`pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] font-bold font-mono tracking-wider border rounded-sm transition-colors ${useTrueNorth ? 'border-emerald-500 text-emerald-400' : 'border-blue-500 text-blue-400'}`}
                    title="Toggle True/Magnetic North Base"
                  >
                    基準: {useTrueNorth ? '真北' : '磁北'}
                  </button>
                  <button 
                    onClick={() => setShowHUD(!showHUD)}
                    className={`pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border rounded-sm transition-colors ${showHUD ? 'border-blue-500 text-blue-400' : 'border-zinc-700'}`}
                    title="Toggle 3D HUD"
                  >
                    <Box size={10} />
                    HUD: {showHUD ? 'ON' : 'OFF'}
                  </button>
                  <button 
                    onClick={() => downloadKML(lat, lon, declination || 0, useTrueNorth, activeVectors as Record<string, string>)}
                    className="pointer-events-auto bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border border-zinc-700 rounded-sm transition-colors"
                  >
                    <Download size={10} />
                    KML Export
                  </button>
               </div>
               <div className="text-[10px] font-mono text-zinc-400 text-right bg-black/50 px-1 py-0.5 border border-zinc-800/50">
                  制作者座標: {lat.toFixed(4)}N, {lon.toFixed(4)}E<br />
                  現在地磁気偏角: {declination ? declination.toFixed(2) : '--'}°
               </div>
            </div>
         </div>
         
         <div className="w-full h-full relative z-0 flex grow min-h-0 overflow-hidden bg-black">
             {/* Model Indicator Watermark */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 opacity-[0.03]">
                <div className={`text-6xl md:text-8xl font-black uppercase tracking-tighter -rotate-12 ${isPhysical ? 'text-emerald-500' : 'text-zinc-500'}`}>
                   {isPhysical ? '[ PHYSICAL MODEL ]' : '[ CLASSICAL MODEL ]'}
                </div>
             </div>
             
             {/* HUD Label Top Left */}
             <div className="absolute top-16 left-2 pointer-events-none z-10">
               <div className={`px-2 py-1 text-[10px] font-mono font-bold tracking-widest uppercase border backdrop-blur-sm shadow-lg ${isPhysical ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900/40 text-zinc-400 border-zinc-500/50'}`}>
                 {isPhysical ? '▶ PHYSICAL MODEL ACTIVE' : '▶ CLASSICAL MODEL ACTIVE'}
               </div>
             </div>
             <MagneticMapInner
              lat={lat}
              lon={lon}
              declination={declination || 0}
              intensity={intensity || 50000}
              vectors={isPhysical ? physicalLayers?.finalVectors : classicalLayers?.finalVectors}
              layers={isPhysical ? physicalLayers : classicalLayers}
              honmeiStar={honmeiStar}
              kpIndex={kpIndex}
              ansLoad={ansLoad}
              hudLayers={hudLayers}
              activeLayerMode={activeLayerMode}
              useTrueNorth={useTrueNorth}
              properties={properties}
              onSelectTarget={onSelectTarget}
              nodeMapping={isPhysical ? 'physical' : 'traditional'}
             />
         </div>

         {/* 3D HUD Overlay */}
         <div className={`absolute bottom-2 left-2 z-20 pointer-events-auto transition-all duration-500 translate-y-0 ${showHUD ? 'opacity-100 scale-100' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}>
           <MagneticSpatialHUD 
             declination={declination || 0}
             inclination={inclination || 0}
             kpIndex={kpIndex || 0}
             shieldCapacity={shieldCapacity}
             size={180}
           />
         </div>
      </div>
      {/* Theoretical Info Panel -> Compact Algorithm Info */}
      <details className="mt-4 bg-zinc-950/50 border border-zinc-800 text-[10px] font-mono text-zinc-400 w-full group">
         <summary className="p-3 cursor-pointer hover:bg-zinc-900/50 list-none flex items-center justify-between uppercase tracking-widest font-bold">
            <div className="flex items-center gap-2">
               <span className="text-red-500 blur-[0.5px]">◆</span> [ ALGORITHM ] 吉凶方位の分析ロジック（空間ベクトル）
            </div>
            <span className="group-open:rotate-180 transition-transform text-zinc-500">▼</span>
         </summary>
         <div className="p-3 sm:p-4 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-3 bg-black/50 text-[10px] leading-relaxed font-sans">
           <div className="p-2 sm:p-3 border border-red-900/30 rounded-sm">
              <strong className="text-red-400 block mb-1 font-mono text-[9px] uppercase">◆ 1. 凶殺ベクトル (NOISE)</strong>
              <p className="text-zinc-400 text-justify mt-1">
                地図上の<strong className="text-red-500 font-bold">赤い破線</strong>や<strong className="text-fuchsia-500 font-bold">紫の複破線</strong>は、宇宙天気や地球磁場の乱れ、またはあなたの固有波長（本命星）と強干渉を起こす危険方位（五黄殺・本命殺など）です。引越しや長期滞在先としては絶対に避けるべきルートです。
              </p>
           </div>
           <div className="p-2 sm:p-3 border border-yellow-900/30 rounded-sm">
              <strong className="text-yellow-400 block mb-1 font-mono text-[9px] uppercase">◆ 2. 警告ゾーン (VOID)</strong>
              <p className="text-zinc-400 text-justify mt-1">
                <strong className="text-yellow-500 font-bold">黄色の点線</strong>は、空間の磁気フレームワークが崩壊している「天中殺・歳破」の方向です。この方位への移動は、予測不可能なトラブルや自律神経の不調を招きやすいため、重要な決断・移動は保留を推奨します。
              </p>
           </div>
           <div className="p-2 sm:p-3 border border-emerald-900/30 rounded-sm">
              <strong className="text-emerald-400 block mb-1 font-mono text-[9px] uppercase">◆ 3. 最適化ゾーン (OPTIMAL)</strong>
              <p className="text-zinc-400 text-justify mt-1">
                <strong className="text-emerald-500 font-bold">緑の実線</strong>は、すべてのノイズレイヤーをクリアし、かつあなたの目的（引越し・療養など）と完全に共鳴する「大吉方位」です。この方位へ移動することで、環境ストレスが最小化され、生体リズムが整います。
              </p>
           </div>
         </div>
      </details>
    </div>
  );
}

export const TacticalMagneticMap = React.memo(TacticalMagneticMapComponent);

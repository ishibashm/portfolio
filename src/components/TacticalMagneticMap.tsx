"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Crosshair,
  Maximize,
  Minimize,
  Download,
  HelpCircle,
  Layers,
  Box,
} from "lucide-react";
import { BlockMath, InlineMath } from "react-katex";
import { MagneticSpatialHUD } from "./MagneticSpatialHUD";
import { downloadKML } from "../utils/kmlExport";

// Because Leaflet needs the window object, we must dynamically import it with ssr: false
const MagneticMapInner = dynamic(() => import("./MagneticMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-400 md:animate-pulse">
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
  hudLayers?: {
    terrain: boolean;
    weather: boolean;
    bio: boolean;
    hazard?: boolean;
  };
  toggleLayer?: (layer: "terrain" | "weather" | "bio" | "hazard") => void;
  activeLayerMode?: string;
  setActiveLayerMode?: (mode: any) => void;
  activeModel?: "physical" | "classical";
  properties?: any[];
  useTrueNorth?: boolean;
  setUseTrueNorth?: (val: boolean) => void;
  targetLat?: number | null;
  targetLon?: number | null;
  onSelectTarget?: (lat: number, lon: number) => void;
  /** 強調表示する方位。ヒートマップで選んだ方位や目的地の方位を渡す。 */
  highlightDirection?: string | null;
}

export function TacticalMagneticMapComponent({
  lat,
  lon,
  declination,
  inclination,
  intensity,
  physicalLayers,
  classicalLayers,
  honmeiStar,
  kpIndex,
  ansLoad,
  shieldCapacity = 100,
  hudLayers = { terrain: true, weather: true, bio: true, hazard: false },
  toggleLayer,
  activeLayerMode = "final",
  setActiveLayerMode,
  activeModel = "physical",
  properties = [],
  useTrueNorth: propsUseTrueNorth,
  setUseTrueNorth: propsSetUseTrueNorth,
  targetLat,
  targetLon,
  onSelectTarget,
  highlightDirection = null,
}: MapProps) {
  const [showHUD, setShowHUD] = useState(true);
  const [localUseTrueNorth, localSetUseTrueNorth] = useState(false);
  const useTrueNorth =
    propsUseTrueNorth !== undefined ? propsUseTrueNorth : localUseTrueNorth;
  const setUseTrueNorth =
    propsSetUseTrueNorth !== undefined
      ? propsSetUseTrueNorth
      : localSetUseTrueNorth;
  const [activeDecryptTab, setActiveDecryptTab] = useState(1);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const isPhysical = activeModel === "physical";
  const activeLayers = isPhysical ? physicalLayers : classicalLayers;
  const activeVectors = React.useMemo(() => {
    if (!activeLayers) return {};
    if (activeLayerMode === "final") return activeLayers.finalVectors || {};
    if (activeLayerMode === "year") return activeLayers.yearLayer || {};
    if (activeLayerMode === "month") return activeLayers.monthLayer || {};
    if (activeLayerMode === "day") return activeLayers.dayLayer || {};
    return {};
  }, [activeLayers, activeLayerMode]);

  const borderColor = isPhysical
    ? "border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
    : "border-zinc-500/50 shadow-[0_0_15px_rgba(113,113,122,0.2)]";

  return (
    <div className={`w-full max-w-6xl mt-8 flex flex-col gap-4`}>
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className={`relative border ${borderColor} transition-all duration-500 shadow-2xl w-full flex flex-col h-[400px] md:h-[600px] lg:h-[700px]`}
      >
        <div className="absolute top-0 left-0 w-full p-2 z-10 bg-linear-to-b from-black/80 to-transparent pointer-events-none flex flex-col sm:flex-row justify-between items-start gap-2">
          <div className="flex items-center gap-2">
            <Crosshair
              size={14}
              className="text-blue-500 md:animate-pulse mt-1"
            />
            <div className="flex flex-col">
              <h2 className="text-xs uppercase font-mono tracking-widest text-stone-600 drop-shadow-md">
                [稼働環境] 地磁気・太陽風ベクター観測
              </h2>

              {/* Layer Mode Switcher with Combinations */}
              <div className="pointer-events-auto flex items-center mt-1.5 bg-white/80 border border-stone-200 rounded-sm overflow-hidden text-[9px] font-mono flex-wrap max-w-full">
                <span className="px-1.5 py-1 text-[8px] text-stone-400 bg-white border-r border-stone-200">
                  時間軸:
                </span>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("final")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "final" || !activeLayerMode ? "bg-emerald-50 text-emerald-600 font-bold" : "text-stone-400 hover:text-stone-600"} border-r border-stone-200 cursor-pointer`}
                >
                  🪐 全統合(年+月+日)
                </button>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("year_month")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "year_month" ? "bg-purple-50 text-purple-600 font-bold" : "text-stone-400 hover:text-stone-600"} border-r border-stone-200 cursor-pointer`}
                >
                  📅 年+月
                </button>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("month_day")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "month_day" ? "bg-blue-50 text-blue-600 font-bold" : "text-stone-400 hover:text-stone-600"} border-r border-stone-200 cursor-pointer`}
                >
                  🌓 月+日
                </button>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("year_day")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "year_day" ? "bg-amber-50 text-amber-600 font-bold" : "text-stone-400 hover:text-stone-600"} border-r border-stone-200 cursor-pointer`}
                >
                  ☀️ 年+日
                </button>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("year")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "year" ? "bg-indigo-50 text-indigo-600 font-bold" : "text-stone-400 hover:text-stone-600"} border-r border-stone-200 cursor-pointer`}
                >
                  年
                </button>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("month")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "month" ? "bg-purple-50 text-purple-600 font-bold" : "text-stone-400 hover:text-stone-600"} border-r border-stone-200 cursor-pointer`}
                >
                  月
                </button>
                <button
                  onClick={() =>
                    setActiveLayerMode && setActiveLayerMode("day")
                  }
                  className={`px-2 py-1 transition-colors ${activeLayerMode === "day" ? "bg-cyan-50 text-cyan-600 font-bold" : "text-stone-400 hover:text-stone-600"} cursor-pointer`}
                >
                  日
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {/* Layer Toggles */}
              <div className="pointer-events-auto flex items-center bg-white/80 border border-stone-200 p-0.5 rounded-sm mr-2 hidden lg:flex">
                <button
                  onClick={() => toggleLayer?.("terrain")}
                  className={`px-1.5 py-0.5 text-[9px] font-mono border-r border-stone-200 transition-colors ${hudLayers.terrain ? "text-blue-600 bg-blue-500/10" : "text-stone-400"}`}
                  title="TER (地形・磁場ベース)"
                >
                  TER [基盤帯]
                </button>
                <button
                  onClick={() => toggleLayer?.("weather")}
                  className={`px-1.5 py-0.5 text-[9px] font-mono border-r border-stone-200 transition-colors ${hudLayers.weather ? "text-amber-600 bg-amber-500/10" : "text-stone-400"}`}
                  title="WTH (宇宙天気・磁気嵐)"
                >
                  WTH [変動波]
                </button>
                <button
                  onClick={() => toggleLayer?.("bio")}
                  className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors ${hudLayers.bio ? "text-purple-600 bg-purple-500/10" : "text-stone-400"}`}
                  title="BIO (生体共鳴・固有波長)"
                >
                  BIO [生体波]
                </button>
                <button
                  onClick={() => toggleLayer?.("hazard")}
                  className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors border-l border-stone-200 ${hudLayers.hazard ? "text-red-500 bg-red-500/10 font-bold" : "text-stone-400"}`}
                  title="HZD (ハザードマップ・外部GIS連携)"
                >
                  HZD [災害域]
                </button>
              </div>
              <button
                onClick={() => setUseTrueNorth(!useTrueNorth)}
                className={`pointer-events-auto bg-white/80 hover:bg-stone-100 text-stone-600 px-2 py-1 flex items-center gap-1 text-[11px] font-bold font-mono tracking-wider border rounded-sm transition-colors ${useTrueNorth ? "border-emerald-500 text-emerald-600" : "border-blue-500 text-blue-600"}`}
                title="Toggle True/Magnetic North Base"
              >
                基準: {useTrueNorth ? "真北" : "磁北"}
              </button>
              <button
                onClick={() => setShowHUD(!showHUD)}
                className={`pointer-events-auto bg-white/80 hover:bg-stone-100 text-stone-600 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border rounded-sm transition-colors ${showHUD ? "border-blue-500 text-blue-600" : "border-stone-300"}`}
                title="Toggle 3D HUD"
              >
                <Box size={10} />
                HUD: {showHUD ? "ON" : "OFF"}
              </button>
              <button
                onClick={() =>
                  downloadKML(
                    lat,
                    lon,
                    declination || 0,
                    useTrueNorth,
                    activeVectors as Record<string, string>,
                    isPhysical ? "physical" : "traditional",
                    hudLayers,
                  )
                }
                className="pointer-events-auto bg-white/80 hover:bg-stone-100 text-stone-600 px-2 py-1 flex items-center gap-1 text-[11px] uppercase font-mono tracking-wider border border-stone-300 rounded-sm transition-colors"
              >
                <Download size={10} />
                KML Export
              </button>
            </div>
            <div className="text-[10px] font-mono text-stone-500 text-right bg-white/70 px-1 py-0.5 border border-stone-200">
              制作者座標: {lat.toFixed(4)}N, {lon.toFixed(4)}E<br />
              現在地磁気偏角: {declination ? declination.toFixed(2) : "--"}°
            </div>
          </div>
        </div>

        <div className="w-full h-full relative z-0 flex grow min-h-0 overflow-hidden bg-white">
          {/* Model Indicator Watermark */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 opacity-[0.03]">
            <div
              className={`text-6xl md:text-8xl font-black uppercase tracking-tighter -rotate-12 ${isPhysical ? "text-emerald-500" : "text-stone-400"}`}
            >
              {isPhysical ? "[ PHYSICAL MODEL ]" : "[ CLASSICAL MODEL ]"}
            </div>
          </div>

          {/* HUD Label Top Left */}
          <div className="absolute top-16 left-2 pointer-events-none z-10">
            <div
              className={`px-2 py-1 text-[10px] font-mono font-bold tracking-widest uppercase border backdrop-blur-sm shadow-lg ${isPhysical ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-500 border-zinc-500/50"}`}
            >
              {isPhysical
                ? "▶ PHYSICAL MODEL ACTIVE"
                : "▶ CLASSICAL MODEL ACTIVE"}
            </div>
          </div>
          <MagneticMapInner
            lat={lat}
            lon={lon}
            declination={declination || 0}
            intensity={intensity || 50000}
            vectors={
              isPhysical
                ? physicalLayers?.finalVectors
                : classicalLayers?.finalVectors
            }
            layers={isPhysical ? physicalLayers : classicalLayers}
            honmeiStar={honmeiStar}
            kpIndex={kpIndex}
            ansLoad={ansLoad}
            hudLayers={hudLayers}
            activeLayerMode={activeLayerMode}
            useTrueNorth={useTrueNorth}
            properties={properties}
            onSelectTarget={onSelectTarget}
            targetLat={targetLat}
            targetLon={targetLon}
            nodeMapping={isPhysical ? "physical" : "traditional"}
            highlightDirection={highlightDirection}
          />
        </div>

        {/* 3D HUD Overlay */}
        <div
          className={`absolute bottom-2 left-2 z-20 pointer-events-auto transition-all duration-500 translate-y-0 ${showHUD ? "opacity-100 scale-100" : "opacity-0 scale-90 translate-y-4 pointer-events-none"}`}
        >
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
      <details className="mt-4 bg-white/80 border border-stone-200 text-[10px] font-mono text-stone-500 w-full group">
        <summary className="p-3 cursor-pointer hover:bg-white/80 list-none flex items-center justify-between uppercase tracking-widest font-bold">
          <div className="flex items-center gap-2">
            <span className="text-red-500 blur-[0.5px]">◆</span> [ ALGORITHM ]
            吉凶方位の分析ロジック（空間ベクトル）
          </div>
          <span className="group-open:rotate-180 transition-transform text-stone-400">
            ▼
          </span>
        </summary>
        <div className="p-3 sm:p-4 border-t border-stone-200 grid grid-cols-1 md:grid-cols-4 gap-3 bg-white/70 text-[10px] leading-relaxed font-sans">
          <div className="p-2 sm:p-3 border border-red-200 rounded-sm">
            <strong className="text-red-600 block mb-1 font-mono text-[9px] uppercase">
              ◆ 1. 凶殺ベクトル (NOISE)
            </strong>
            <p className="text-stone-500 text-justify mt-1">
              地図上の
              <strong className="text-red-500 font-bold">赤い破線</strong>や
              <strong className="text-fuchsia-500 font-bold">紫の複破線</strong>
              は、宇宙天気や地球磁場の乱れ、またはあなたの固有波長（本命星）と強干渉を起こす危険方位（五黄殺・本命殺など）です。引越しや長期滞在先としては絶対に避けるべきルートです。
            </p>
          </div>
          <div className="p-2 sm:p-3 border border-yellow-900/30 rounded-sm">
            <strong className="text-yellow-400 block mb-1 font-mono text-[9px] uppercase">
              ◆ 2. 天中殺 (VOID)
            </strong>
            <p className="text-stone-500 text-justify mt-1">
              <strong className="text-yellow-500 font-bold">黄色の点線</strong>
              は、個人の運気の空白（ボイド）である「天中殺（空亡）」の方向です。この方位への移動は、主観的な見通しの狂いやトラブルを招きやすいため、重要な決断は保留を推奨します。
            </p>
          </div>
          <div className="p-2 sm:p-3 border border-amber-200 rounded-sm">
            <strong className="text-amber-500 block mb-1 font-mono text-[9px] uppercase">
              ◆ 3. 月交点 (NODE)
            </strong>
            <p className="text-stone-500 text-justify mt-1">
              <strong className="text-amber-500 font-bold">
                オレンジの破線
              </strong>
              は、軌道の交点である「羅睺・計都軸（月交点）」の方向です。日食・月食の起点であり、地磁気・太陽風の物理的特異方位であるため、精神面への影響（宿命的磁気ストレス）に注意してください（※全方位に適用される「月相」とは異なり、空間的な偏りを持つ要因です）。
            </p>
          </div>
          <div className="p-2 sm:p-3 border border-emerald-200 rounded-sm">
            <strong className="text-emerald-600 block mb-1 font-mono text-[9px] uppercase">
              ◆ 4. 最適化ゾーン (OPTIMAL)
            </strong>
            <p className="text-stone-500 text-justify mt-1">
              <strong className="text-emerald-500 font-bold">緑の実線</strong>
              は、すべてのノイズレイヤーをクリアし、かつあなたの目的（引越し・療養など）と完全に共鳴する「大吉方位」です。この方位へ移動することで、環境ストレスが最小化され、生体リズムが整います。
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}

export const TacticalMagneticMap = React.memo(TacticalMagneticMapComponent);

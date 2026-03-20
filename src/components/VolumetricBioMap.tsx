"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Direction } from "../utils/ephemerisEngine";

interface VolumetricBioMapProps {
  lat: number;
  lon: number;
  kpIndex: number | null;
  layers: any;
  hudLayers: { terrain: boolean; weather: boolean; bio: boolean };
}

export function VolumetricBioMap({ lat, lon, kpIndex, layers, hudLayers }: VolumetricBioMapProps) {
  const sectors: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const [rotation, setRotation] = useState(-25);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation(prev => prev + 0.1);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const weatherIntensity = useMemo(() => {
    return Math.min(1, (kpIndex || 0) / 9);
  }, [kpIndex]);

  // Generate tile coordinates for the background map
  // This is a simplified mockup of a 3D tile layer
  const mapTiles = useMemo(() => {
    const zoom = 12;
    // Rough calc for a 3x3 grid around the center
    return [0, 1, 2].map(x => [0, 1, 2].map(y => ({ x: x - 1, y: y - 1 })));
  }, []);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden perspective-distant">
      {/* 3D Scene Container */}
      <div 
        className="relative w-[1000px] h-[1000px] transition-transform duration-1000 ease-out"
        style={{ 
          transform: `rotateX(60deg) rotateZ(${rotation}deg)`,
          transformStyle: "preserve-3d" 
        }}
      >
        {/* Layer 1: The Real Map Ground (Satellite/Dark Tiles) */}
        {hudLayers.terrain && (
          <div 
            className="absolute inset-0 rounded-full overflow-hidden border border-zinc-700/50 shadow-[0_0_50px_rgba(0,0,0,1)]"
            style={{ 
              transform: "translateZ(0px)",
              background: "radial-gradient(circle, #0a0a0a, #000)"
            }}
          >
            {/* Mock Tiled Map Background */}
            <div className="absolute inset-0 opacity-40 mix-blend-screen grid grid-cols-3 grid-rows-3 scale-150">
               {mapTiles.map((row, i) => row.map((tile, j) => (
                 <div 
                   key={`${i}-${j}`} 
                   className="border border-zinc-900/20 bg-center bg-cover"
                   style={{ 
                     backgroundImage: `url(https://stamen-tiles.a.ssl.fastly.net/toner-lite/12/3639/1615.png)`,
                     filter: "invert(1) hue-rotate(180deg) brightness(0.5)"
                   }}
                 />
               )))}
            </div>
            
            {/* Grid Overlay */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

            {/* Magnetic Boundaries (Digital Twin) */}
            <svg viewBox="0 0 100 100" className="w-full h-full rotate-[22.5deg] opacity-20">
              {sectors.map((dir, i) => (
                <path
                  key={`ground-grid-${dir}`}
                  d={`M 50 50 L ${50 + 50 * Math.cos((i * 45 * Math.PI) / 180)} ${50 + 50 * Math.sin((i * 45 * Math.PI) / 180)} A 50 50 0 0 1 ${50 + 50 * Math.cos(((i + 1) * 45 * Math.PI) / 180)} ${50 + 50 * Math.sin(((i + 1) * 45 * Math.PI) / 180)} Z`}
                  fill="transparent"
                  stroke="#444"
                  strokeWidth="0.2"
                />
              ))}
            </svg>
          </div>
        )}

        {/* 3D Volumetric Sectors (The "Mapping" that becomes 3D) */}
        <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {sectors.map((dir, i) => {
            const status = layers?.finalVectors[dir] || "SAFE";
            const isNoise = status.includes("NOISE");
            const isOptimal = status === "OPTIMAL";
            
            // Height logic based on status
            const height = isOptimal ? 40 : (isNoise ? -20 : 0);
            const color = isOptimal ? "rgba(16, 185, 129, 0.4)" : (isNoise ? "rgba(239, 68, 68, 0.2)" : "rgba(59, 130, 246, 0.1)");
            
            return (
              <div 
                key={`vol-sector-${dir}`}
                className="absolute inset-0 transition-all duration-1000"
                style={{ 
                  transform: `translateZ(${height}px)`,
                  transformStyle: "preserve-3d",
                  opacity: hudLayers.bio ? 1 : 0
                }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full rotate-[22.5deg]">
                  <path
                    d={`M 50 50 L ${50 + 48 * Math.cos((i * 45 * Math.PI) / 180)} ${50 + 48 * Math.sin((i * 45 * Math.PI) / 180)} A 48 48 0 0 1 ${50 + 48 * Math.cos(((i + 1) * 45 * Math.PI) / 180)} ${50 + 48 * Math.sin(((i + 1) * 45 * Math.PI) / 180)} Z`}
                    fill={color}
                    stroke={isOptimal ? "#10b981" : (isNoise ? "#ef4444" : "transparent")}
                    strokeWidth="0.5"
                    className={isOptimal ? "md:animate-pulse" : ""}
                  />
                </svg>
              </div>
            );
          })}
        </div>

        {/* Layer 2: Cosmic Clouds (Space Weather) */}
        {hudLayers.weather && (
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ transform: "translateZ(120px)", transformStyle: "preserve-3d" }}
          >
             <div 
               className={`absolute inset-0 opacity-40 transition-colors duration-1000 ${weatherIntensity > 0.5 ? 'bg-red-950/30' : 'bg-blue-950/20'}`}
               style={{
                 filter: "blur(60px)",
                 backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)",
                 transform: `scale(${1.2 + weatherIntensity * 0.5})`
               }}
             />
             
             {/* Dynamic Weather Particles */}
             <div className="absolute inset-0 overflow-hidden rounded-full">
                <div className="absolute inset-0 md:animate-spin-slow opacity-30 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] scale-[2]" />
             </div>
          </div>
        )}

        {/* Vertical Axis Indicators */}
        <div className="absolute inset-0 pointer-events-none" style={{ transformStyle: "preserve-3d" }}>
            <div 
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-[300px] bg-linear-to-t from-transparent via-zinc-600/50 to-transparent"
              style={{ transform: "rotateX(-90deg)" }}
            />
            {/* North Indicator */}
            <div 
              className="absolute left-1/2 top-0 -translate-x-1/2 text-[12px] font-mono text-zinc-500 font-bold tracking-widest"
              style={{ transform: "rotateX(-60deg) translateZ(20px)" }}
            >
              [ MAGNETIC_NORTH ]
            </div>
        </div>
      </div>

      {/* 3D Depth Legend */}
      <div className="absolute bottom-6 right-6 font-mono text-[9px] text-zinc-500 flex flex-col gap-2 bg-black/80 p-3 border border-zinc-800 md:backdrop-blur-sm shadow-xl">
        <div className="text-zinc-400 border-b border-zinc-800 pb-1 mb-1 font-bold">VOLUMETRIC_DEPTH_KEY</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,1)]" /> 
          <span>ELEVATED: OPTIMAL_SYNC</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-zinc-800 border border-zinc-700" /> 
          <span>BASELINE: GEO_MAP</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-red-600 opacity-50 shadow-[0_0_5px_rgba(239,68,68,1)]" /> 
          <span>DEPRESSED: NOISE_VECTOR</span>
        </div>
      </div>

      {/* Data Telemetry Overlay */}
      <div className="absolute top-6 left-6 font-mono text-[10px] text-emerald-500/80 tracking-tighter transition-opacity duration-1000">
         <div>[ SYS_RENDER: VOLUMETRIC_DEPTH_V2 ]</div>
         <div>[ TARGET: {lat.toFixed(4)}, {lon.toFixed(4)} ]</div>
         <div className="mt-1 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 md:animate-ping rounded-full" />
            LIVE_SPATIAL_SYNCING...
         </div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import React from "react";

// Disable SSR for Leaflet map component
const MagneticMapInner = dynamic(() => import("./MagneticMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-zinc-950 border border-zinc-900 rounded-sm animate-pulse">
      <div className="text-[10px] font-mono tracking-widest text-emerald-700/50 uppercase">
        Initializing Spatial Grid...
      </div>
    </div>
  ),
});

interface Props {
  lat: number | null;
  lon: number | null;
  declination: number | null;
}

export function TacticalMagneticMap({ lat, lon, declination }: Props) {
  if (lat === null || lon === null || declination === null) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-zinc-950 border border-zinc-900 rounded-sm">
        <div className="text-[10px] font-mono tracking-widest text-amber-700/50 uppercase flex flex-col items-center">
          <svg className="animate-spin h-5 w-5 mb-3 text-amber-500/50" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="16" strokeLinecap="round"/>
          </svg>
          Waiting for GPS Telemetry...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] md:h-[500px] relative group mt-8">
      {/* Decorative corners */}
      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-500/50 z-10 transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1"></div>
      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-500/50 z-10 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"></div>
      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-500/50 z-10 transition-transform group-hover:-translate-x-1 group-hover:translate-y-1"></div>
      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-500/50 z-10 transition-transform group-hover:translate-x-1 group-hover:translate-y-1"></div>
      
      <MagneticMapInner lat={lat} lon={lon} declination={declination} />
    </div>
  );
}

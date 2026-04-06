"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Circle, useMap, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icons in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapInnerProps {
  lat: number;
  lon: number;
  declination: number; // Magnetic Declination (D) in degrees
  intensity?: number;  // Magnetic Intensity (F) in nT
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
  hudLayers?: { terrain: boolean; weather: boolean; bio: boolean };
  isFullscreen?: boolean;
  activeLayerMode?: 'final' | 'year' | 'month' | 'day';
}

// Function to calculate a point at a certain distance and bearing from origin
function getDestination(lat: number, lon: number, bearing: number, distanceKm: number = 5) {
  const R = 6371; // Earth radius in km
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (bearing * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceKm / R) +
    Math.cos(lat1) * Math.sin(distanceKm / R) * Math.cos(brng)
  );
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(distanceKm / R) * Math.cos(lat1),
    Math.cos(distanceKm / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI] as [number, number];
}

function SyncMapCenter({ lat, lon }: { lat: number, lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);

  return null;
}

function MapResizeHandler({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap();
  React.useEffect(() => {
    // Small delay to ensure CSS transition/layout is complete
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [isFullscreen, map]);
  return null;
}

export default function MagneticMapInner({ 
  lat, lon, declination, intensity = 50000, vectors, layers, honmeiStar, kpIndex, ansLoad = 0, 
  hudLayers = { terrain: true, weather: true, bio: true },
  isFullscreen = false,
  activeLayerMode = 'final'
}: MapInnerProps) {
  const [mounted, setMounted] = React.useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const center = React.useMemo<[number, number]>(() => [lat, lon], [lat, lon]);
  
  // Calculate bearings based on TRUE NORTH (0) + Magnetic Declination
  const magNorthBearing = React.useMemo(() => declination, [declination]);
  
  // Memoize sectors based on activeLayerMode and layers
  const sectors = React.useMemo(() => {
    const dirMap = [
      { dir: 'N', deg: 0 }, { dir: 'NE', deg: 45 }, { dir: 'E', deg: 90 },
      { dir: 'SE', deg: 135 }, { dir: 'S', deg: 180 }, { dir: 'SW', deg: 225 },
      { dir: 'W', deg: 270 }, { dir: 'NW', deg: 315 }
    ];

    return dirMap.map(d => {
      let status = 'SAFE';
      if (layers) {
        if (activeLayerMode === 'final' && layers.finalVectors) {
          status = layers.finalVectors[d.dir] || 'SAFE';
        } else if (activeLayerMode === 'year' && layers.yearLayer) {
          status = layers.yearLayer[d.dir] || 'SAFE';
        } else if (activeLayerMode === 'month' && layers.monthLayer) {
          status = layers.monthLayer[d.dir] || 'SAFE';
        } else if (activeLayerMode === 'day' && layers.dayLayer) {
          status = layers.dayLayer[d.dir] || 'SAFE';
        }
      } else if (vectors && vectors[d.dir]) {
        status = vectors[d.dir];
      }
      return { ...d, status };
    });
  }, [vectors, layers, activeLayerMode]);

  // 1. Memoize boundaries - only depends on declination and intensity
  const boundaries = React.useMemo(() => {
    const distortionFactor = Math.max(-0.25, Math.min(0.25, (intensity - 50000) / 100000));
    return [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map(b => {
      const shift = Math.sin((b - declination) * (Math.PI / 180)) * distortionFactor * 45;
      return b + shift;
    });
  }, [declination, intensity]);

  // 2. Memoize vector styles based on status and kpIndex
  const getStyleForVector = React.useCallback((status: string) => {
    const baseKp = kpIndex || 0;
    const noiseMultiplier = 1 + (baseKp * 0.15); 
    const safeMultiplier = Math.max(0.1, 1 - (baseKp * 0.1));
    const weight = status.startsWith('NOISE') && baseKp >= 4 ? 2 : 1;

    let style;
    switch (status) {
      case 'OPTIMAL': style = { color: "#10b981", opacity: Math.min(0.8, 0.4 * safeMultiplier) }; break;
      case 'SAFE': style = { color: "#3b82f6", opacity: 0.35 }; break;
      case 'NOISE_GOU': style = { color: "#dc2626", opacity: Math.min(0.9, 0.5 * noiseMultiplier) }; break;
      case 'NOISE_ANKEN': style = { color: "#ef4444", opacity: Math.min(0.9, 0.4 * noiseMultiplier) }; break;
      case 'NOISE_HONMEI': style = { color: "#d946ef", opacity: Math.min(0.8, 0.4 * noiseMultiplier) }; break;
      case 'NOISE_TEKI': style = { color: "#d946ef", opacity: Math.min(0.8, 0.3 * noiseMultiplier) }; break;
      case 'NOISE': style = { color: "#ef4444", opacity: Math.min(0.8, 0.3 * noiseMultiplier) }; break;
      default: style = { color: "#3f3f46", opacity: 0.1 };
    }
    return { ...style, weight: status === 'SAFE' ? 1 : weight };
  }, [kpIndex]);

  // 3. Memoize the entire vector/sector layer to avoid re-calculating points unless inputs change
  const vectorLayer = React.useMemo(() => {
    return sectors.map(d => {
      // 3D HUD Logic: Calculate status based on ACTIVE layers directly from final status
      const hasTerrainNoise = d.status === 'NOISE';
      const hasBioNoise = d.status.includes('HONMEI') || d.status.includes('TEKI');
      const hasWeatherNoise = d.status.includes('NOISE') && !hasBioNoise && !hasTerrainNoise;
      
      // Filter logic: If a layer is OFF, ignore its noise contribution for the VISUAL display
      let displayStatus = 'SAFE';

      if (hudLayers.terrain && hasTerrainNoise) displayStatus = d.status;
      if (hudLayers.weather && hasWeatherNoise) displayStatus = d.status;
      if (hudLayers.bio && hasBioNoise) {
        displayStatus = d.status; // Bio noise (Honmei/Teki)
      }

      if (!d.status.includes('NOISE')) {
        displayStatus = d.status;
      }

      const { color, opacity, weight } = getStyleForVector(displayStatus);
      const baseBearing = magNorthBearing + d.deg;
      
      const points: [number, number][] = [center];
      for (let offset = -10; offset <= 10; offset += 1) {
        // Reduced from 5000km to 1000km bounds to save mobile memory
        points.push(getDestination(lat, lon, baseBearing + offset, 1000));
      }

      // Calculate label position (approx 3km out)
      const labelPos = getDestination(lat, lon, baseBearing, 3000);

      const getStatusLabel = (status: string) => {
        if (status === 'NOISE_GOU') return '五';
        if (status === 'NOISE_ANKEN') return '暗';
        if (status === 'NOISE_HONMEI') return '本';
        if (status === 'NOISE_TEKI') return '的';
        if (status === 'OPTIMAL') return '吉';
        return '';
      };

      const label = getStatusLabel(displayStatus);

      // Tooltip breakdown
      const y = layers?.yearLayer[d.dir] || 'SAFE';
      const m = layers?.monthLayer[d.dir] || 'SAFE';
      const dLayer = layers?.dayLayer[d.dir] || 'SAFE';

      const formatLayer = (s: string) => {
        if (s.startsWith('NOISE_GOU') || s.startsWith('NOISE_ANKEN')) return '危険 (宇宙嵐)';
        if (s.startsWith('NOISE_HONMEI') || s.startsWith('NOISE_TEKI')) return '不調 (体質不適合)';
        if (s === 'OPTIMAL') return '良好 (位相同期)';
        return '平穏';
      };

      return (
        <React.Fragment key={`sector-group-${d.dir}-${activeLayerMode}`}>
          <Polygon 
            positions={points} 
            color={color} 
            fillColor={color} 
            fillOpacity={opacity}
            weight={weight}
            pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight }}
          >
            <Tooltip className="custom-map-tooltip">
              <div className="bg-zinc-950 text-zinc-200 p-2 font-mono text-[10px] border border-zinc-800 shadow-xl">
                <div className="text-blue-400 border-b border-zinc-800 mb-1 pb-1 uppercase tracking-widest">{d.dir} Sector Analysis</div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">川 (地磁気ベース):</span>
                    <span className="text-emerald-500">平滑</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">天気 (天体サイクル):</span>
                    <span className={y.includes('NOISE') || m.includes('NOISE') || dLayer.includes('NOISE') ? 'text-red-500' : 'text-emerald-500'}>
                      {formatLayer(y)} / {formatLayer(m)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">体質 (個人相性):</span>
                    <span className={d.status.includes('HONMEI') || d.status.includes('TEKI') ? 'text-[#d946ef]' : 'text-emerald-500'}>
                      {formatLayer(dLayer)}
                    </span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-zinc-800 text-[9px]">
                    <span className="text-zinc-400">STATUS: </span>
                    <span className={color.includes('10b981') ? 'text-emerald-500' : color.includes('dc2626') || color.includes('ef4444') ? 'text-red-500' : color.includes('d946ef') ? 'text-[#d946ef]' : 'text-zinc-500'}>
                      {d.status}
                    </span>
                  </div>
                </div>
              </div>
            </Tooltip>
          </Polygon>
          {label && (
            <Marker 
              position={labelPos} 
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="color: ${color}; text-shadow: 0 0 4px black; font-weight: bold; font-family: monospace; font-size: 14px;">${label}</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
              })}
              interactive={false}
            />
          )}
        </React.Fragment>
      );
    });
  }, [sectors, getStyleForVector, magNorthBearing, center, lat, lon, layers, hudLayers, activeLayerMode]);

  const dangerLayer = React.useMemo(() => {
    return boundaries.map((b, idx) => {
      const baseBearing = magNorthBearing + b;
      const points: [number, number][] = [center];
      for (let offset = -2; offset <= 2; offset += 1) {
        points.push(getDestination(lat, lon, baseBearing + offset, 1000));
      }
      return (
        <Polygon 
          key={`danger-${idx}`}
          positions={points} 
          color="#ef4444" 
          fillColor="#ef4444" 
          fillOpacity={0.4} 
          weight={0} 
        />
      );
    });
  }, [boundaries, magNorthBearing, center, lat, lon]);

  // Concentric Rings for Shield Attenuation Theory (in meters)
  // Reduced max radius from 5000km to 1000km to prevent projection crashes on mobile devices
  const attenuationRings: number[] = [100000, 250000, 500000, 750000, 1000000];

  if (!mounted) {
    return (
      <div className="w-full h-full bg-zinc-950 flex shadow-inner border border-zinc-900 items-center justify-center font-mono text-[10px] text-zinc-800">
        [ SYNCING SPATIAL ASYNC... ]
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-sm overflow-hidden border border-zinc-800/80 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
        <MapContainer key="magnetic-map-container" center={center} zoom={13} className="w-full h-full bg-zinc-950" zoomControl={false} preferCanvas={true}>
            <SyncMapCenter lat={lat} lon={lon} />
            <MapResizeHandler isFullscreen={isFullscreen} />
            <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        
        <Marker position={center} />
        
        {/* Draw True North Line (Geographic) */}
        <Polyline 
           positions={[center, getDestination(lat, lon, 0, 1000)]} 
           color="#10b981" 
           weight={3} 
           dashArray="10,10" 
           opacity={0.8}
        />

        {/* Draw Magnetic North Line */}
        <Polyline 
          positions={[center, getDestination(lat, lon, magNorthBearing, 1000)]} 
          color="#3b82f6" 
          weight={4} 
        />

        {/* Draw Dynamic Sectors (Stars/Vectors) */}
        {vectorLayer}

        {/* Draw Danger Zones (Red) at Boundaries */}
        {dangerLayer}

        {/* Concentric Distance Rings for Attenuation */}
        {attenuationRings.map((radiusMeters, i) => (
           <Circle 
             key={`ring-${radiusMeters}`}
             center={center}
             radius={radiusMeters}
             pathOptions={{ color: '#71717a', weight: 1, dashArray: '4,8', fill: false, opacity: 0.5 - (i * 0.1) }}
           />
        ))}
      </MapContainer>
      
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-1000 pointer-events-none">
        <div className="bg-zinc-950/80 md:backdrop-blur-md px-3 py-2 border border-blue-500/30 rounded-sm">
          <div className="text-[9px] uppercase font-mono tracking-widest text-blue-400">磁北 (WMM2020)</div>
          <div className="text-xs font-mono text-zinc-300">現在地偏差: {declination.toFixed(2)}°</div>
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 z-1000 pointer-events-none">
        <div className="bg-zinc-950/80 md:backdrop-blur-md px-3 py-2 border border-emerald-500/30 rounded-sm text-right">
          <div className="text-[10px] uppercase font-mono tracking-widest text-zinc-300 border-b border-zinc-800 pb-1 mb-1 font-bold">
            [{activeLayerMode.toUpperCase()} LAYER DISPLAY]
          </div>
          {honmeiStar && <div className="text-[10px] uppercase font-mono tracking-widest text-[#d946ef] mt-1 pt-1 border-t border-zinc-800">[Hardware Init同期] 固有波長: {honmeiStar.physical}</div>}
          <div className="text-[9px] uppercase font-mono tracking-widest text-[#10b981] mt-1 pt-1 border-t border-zinc-800">最適化ゾーン (緑)</div>
          <div className="text-[8px] font-sans text-zinc-400">行動パフォーマンス最大化帯</div>
          
          <div className="text-[9px] uppercase font-mono tracking-widest text-[#3b82f6] mt-1">通常ゾーン (青)</div>
          <div className="text-[8px] font-sans text-zinc-400">標準的な環境負荷</div>
          
          <div className="text-[9px] uppercase font-mono tracking-widest text-[#d946ef] mt-1 pt-1 border-t border-zinc-800">生体警告ベクトル (紫)</div>
          <div className="text-[8px] font-sans text-zinc-400">パーソナル波長との強干渉領域 (本命殺/的殺)</div>
          
          <div className="text-[9px] uppercase font-mono tracking-widest text-[#ef4444] mt-1">凶殺ベクトル (赤)</div>
          <div className="text-[8px] font-sans text-zinc-400">物理的な磁気異常ノイズ (五黄殺/暗剣殺)</div>
          
          <div className="flex justify-end items-center gap-1 mt-1 pt-1 border-t border-zinc-800">
             <div className="w-3 border-t-2 border-dashed border-red-500"></div>
             <div className="text-[9px] uppercase font-mono tracking-widest text-red-500">危険境界</div>
          </div>
          <div className="flex justify-end items-center gap-1 mt-1">
             <div className="w-3 border-t border-dashed border-zinc-500"></div>
             <div className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">距離リング (空間スケール)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
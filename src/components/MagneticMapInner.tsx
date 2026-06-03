"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Circle, CircleMarker, useMap, Tooltip, useMapEvents } from "react-leaflet";
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
  hudLayers?: { terrain: boolean; weather: boolean; bio: boolean; hazard?: boolean };
  activeLayerMode?: 'final' | 'year' | 'month' | 'day';
  useTrueNorth?: boolean;
  properties?: any[];
  onSelectTarget?: (lat: number, lon: number) => void;
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

function InvalidateMapSize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);
    
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [map]);

  return null;
}

function ZoomListener({ onChangeZoom }: { onChangeZoom: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onChangeZoom(map.getZoom());
    const handleZoom = () => {
      onChangeZoom(map.getZoom());
    };
    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [map, onChangeZoom]);

  return null;
}



function ClickEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MagneticMapInner({
  lat, lon, declination, intensity = 50000, vectors, layers, honmeiStar, kpIndex, ansLoad = 0,
  hudLayers = { terrain: true, weather: true, bio: true, hazard: false },
  activeLayerMode = 'final',
  useTrueNorth = false,
  properties = [],
  onSelectTarget
}: MapInnerProps) {
  const [mounted, setMounted] = React.useState(false);
  const [clickedPos, setClickedPos] = React.useState<[number, number] | null>(null);
  const [zoom, setZoom] = React.useState(13);
  useEffect(() => {
    setMounted(true);
  }, []);

  const center = React.useMemo<[number, number]>(() => [lat, lon], [lat, lon]);

  // Calculate bearings based on TRUE NORTH (0) + Magnetic Declination
  const magNorthBearing = React.useMemo(() => useTrueNorth ? 0 : declination, [declination, useTrueNorth]);

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

  // 1. Memoize boundaries
  const boundaries = React.useMemo(() => {
    return [15, 75, 105, 165, 195, 255, 285, 345];
  }, []);

  // 2. Memoize vector styles based on status and kpIndex
  const getStyleForVector = React.useCallback((status: string) => {
    const baseKp = kpIndex || 0;
    const weight = status.startsWith('NOISE') ? (baseKp >= 4 ? 2 : 1) : 0.5;

    let style;
    let dashArray;
    switch (status) {
      case 'OPTIMAL': style = { color: "#10b981", opacity: 0.4 }; dashArray = undefined; break;
      case 'OPTIMAL_REGULAR': style = { color: "#34d399", opacity: 0.3 }; dashArray = "5,2"; break;
      case 'SAFE': style = { color: "#3b82f6", opacity: 0.1 }; dashArray = undefined; break;
      case 'NOISE_GOU': style = { color: "#ef4444", opacity: 0.6 }; dashArray = "10,5"; break;
      case 'NOISE_ANKEN': style = { color: "#f43f5e", opacity: 0.6 }; dashArray = "5,5"; break;
      case 'NOISE_HA': style = { color: "#f43f5e", opacity: 0.6 }; dashArray = "3,3"; break;
      case 'NOISE_HONMEI': style = { color: "#d946ef", opacity: 0.6 }; dashArray = "15,10,5,10"; break;
      case 'NOISE_TEKI': style = { color: "#c026d3", opacity: 0.6 }; dashArray = "15,15"; break;
      case 'NOISE_VOID': style = { color: "#eab308", opacity: 0.4 }; dashArray = "1,5"; break;
      case 'NOISE_NODE': style = { color: "#f59e0b", opacity: 0.4 }; dashArray = "4,4"; break;
      case 'NOISE': style = { color: "#ef4444", opacity: 0.6 }; dashArray = "10,10"; break;
      default: style = { color: "#3f3f46", opacity: 0.2 }; dashArray = "1,4";
    }
    return { ...style, weight: (status === 'SAFE' || status === 'OPTIMAL_REGULAR') ? 0.5 : weight, dashArray };
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

      const { color, opacity, weight, dashArray } = getStyleForVector(displayStatus);
      const baseBearing = magNorthBearing + d.deg;

      const points: [number, number][] = [center];
      const isCorner = ['NE', 'SE', 'SW', 'NW'].includes(d.dir);
      const halfWidth = isCorner ? 30 : 15;
      for (let offset = -halfWidth; offset <= halfWidth; offset += 5) {
        points.push(getDestination(lat, lon, baseBearing + offset, 1000));
      }

      // Calculate label position dynamically based on zoom level
      let labelDistance = 15;
      if (zoom >= 13) labelDistance = 3;
      else if (zoom >= 11) labelDistance = 10;
      else if (zoom >= 9) labelDistance = 35;
      else if (zoom >= 7) labelDistance = 90;
      else if (zoom >= 5) labelDistance = 180;
      else labelDistance = 300;
      const labelPos = getDestination(lat, lon, baseBearing, labelDistance);

      const getStatusLabel = (status: string) => {
        if (status === 'NOISE_GOU') return '五黄';
        if (status === 'NOISE_ANKEN') return '暗剣';
        if (status === 'NOISE_HA') return '破';
        if (status === 'NOISE_HONMEI') return '本命';
        if (status === 'NOISE_TEKI') return '的殺';
        if (status === 'NOISE_VOID') return 'ボイド';
        if (status === 'NOISE_NODE') return '交点';
        if (status === 'OPTIMAL') return '大吉';
        if (status === 'OPTIMAL_REGULAR') return '吉';
        return '';
      };

      const label = getStatusLabel(displayStatus);

      // Tooltip breakdown
      const y = layers?.yearLayer[d.dir] || 'SAFE';
      const m = layers?.monthLayer[d.dir] || 'SAFE';
      const dLayer = layers?.dayLayer[d.dir] || 'SAFE';

      const formatLayer = (s: string) => {
        if (s.startsWith('NOISE_GOU')) return '五黄殺 (大凶)';
        if (s.startsWith('NOISE_ANKEN')) return '暗剣殺 (大凶)';
        if (s.startsWith('NOISE_HA')) return '歳破/月破 (大凶)';
        if (s.startsWith('NOISE_HONMEI')) return '本命殺 (凶)';
        if (s.startsWith('NOISE_TEKI')) return '本命的殺 (凶)';
        if (s.startsWith('NOISE_GETSUMEI')) return '月命殺 (凶)';
        if (s.startsWith('NOISE_GETSUTEKI')) return '月命的殺 (凶)';
        if (s.startsWith('NOISE_VOID')) return '天中殺 (大凶)';
        if (s.startsWith('NOISE_NODE')) return '羅睺/計都 (凶)';
        if (s === 'OPTIMAL') return '大吉方位';
        if (s === 'OPTIMAL_REGULAR') return '吉方位';
        return '平穏 (SAFE)';
      };

      const getActionSuggest = (status: string) => {
        if (status.startsWith('NOISE_GOU')) return '【退避】五黄殺: 自滅や深刻なトラブルを招く致命的な環境エラー域です';
        if (status.startsWith('NOISE_ANKEN')) return '【退避】暗剣殺: 予期せぬ他動的なトラブルを被る致命的な環境エラー域です';
        if (status.startsWith('NOISE_HA')) return '【退避】破れ: 計画が破綻しやすい環境エラー域です';
        if (status.startsWith('NOISE_HONMEI') || status.startsWith('NOISE_TEKI')) return '【警戒】健康被害や目的阻害など、主観的エラーが頻発する帯域です';
        if (status.includes('VOID')) return '【警告】天中殺: 基盤が崩れやすい空間。重大な決断は保留してください';
        if (status.includes('NODE')) return '【警告】交点軸: 宿命的な磁気ストレスがあります。重大な決断は保留してください';
        if (status === 'OPTIMAL') return '【推奨】大吉方位。環境と生体波長が完全に一致した最適化ゾーンです';
        if (status === 'OPTIMAL_REGULAR') return '【推奨】吉方位。運気を後押しする良好なゾーンです';
        return '【中立】干渉のない平穏な環境です';
      };

      return (
        <React.Fragment key={`sector-group-${d.dir}-${activeLayerMode}`}>
          <Polygon
            positions={points}
            color={color}
            fillColor={color}
            fillOpacity={opacity}
            weight={weight}
            dashArray={dashArray}
            pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight, dashArray }}
          >
            <Tooltip className="custom-map-tooltip">
              <div className="bg-zinc-950 text-zinc-200 p-2 font-mono text-[10px] border border-zinc-800 shadow-xl max-w-[200px]">
                <div className="text-blue-400 border-b border-zinc-800 mb-1 pb-1 uppercase tracking-widest flex justify-between items-center">
                  <span>{d.dir} Sector</span>
                  <span className="text-zinc-600 font-normal">Analysis {(dashArray ? '(破線)' : '(実線)')}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">環境:</span>
                    <span className={y.includes('NOISE') || m.includes('NOISE') || dLayer.includes('NOISE') ? 'text-red-500' : 'text-emerald-500'}>
                      {formatLayer(y)} / {formatLayer(m)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-zinc-500">個人:</span>
                    <span className={d.status.includes('HONMEI') || d.status.includes('TEKI') ? 'text-[#a855f7]' : 'text-emerald-500'}>
                      {formatLayer(dLayer)}
                    </span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-zinc-800 text-[9px] flex flex-col gap-1">
                    <div className="flex gap-2">
                      <span className="text-zinc-400">STATUS: </span>
                      <span className={(color.includes('10b981') || color.includes('34d399')) ? 'text-emerald-500' : color.includes('ef4444') || color.includes('f43f5e') ? 'text-red-500' : color.includes('d946ef') || color.includes('c026d3') ? 'text-[#d946ef]' : color.includes('eab308') || color.includes('f59e0b') ? 'text-[#eab308]' : 'text-blue-500'}>
                        {d.status}
                      </span>
                    </div>
                    <div className="text-zinc-300 font-bold bg-zinc-900/50 p-1 border-l-2 border-zinc-600 mt-1">
                      {getActionSuggest(d.status)}
                    </div>
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
                html: `<div style="color: ${color}; text-shadow: 0 0 4px black; font-weight: bold; font-family: monospace; font-size: 11px; white-space: nowrap;">${label}</div>`,
                iconSize: [40, 20],
                iconAnchor: [20, 10]
              })}
              interactive={false}
            />
          )}
        </React.Fragment>
      );
    });
  }, [sectors, getStyleForVector, magNorthBearing, center, lat, lon, layers, hudLayers, activeLayerMode, zoom]);

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

  // 4. Mock Hazard Layer (Phase 2 GIS Integration)
  const hazardLayer = React.useMemo(() => {
    if (!hudLayers.hazard) return null;

    // Create some mock hazard zones (e.g., fault lines, flood zones) around the center
    return (
      <React.Fragment>
        {/* Mock Fault Line */}
        <Polyline
          positions={[
            getDestination(lat, lon, 45, 100),
            getDestination(lat, lon, 225, 100)
          ]}
          color="#ef4444"
          weight={2}
          dashArray="5,5"
          opacity={0.6}
        />
        <Marker
          position={getDestination(lat, lon, 45, 100)}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="color: #ef4444; background: rgba(0,0,0,0.5); padding: 2px; text-shadow: 0 0 4px black; font-weight: bold; font-family: monospace; font-size: 9px;">[HZD] Fault Line</div>`,
            iconSize: [80, 20],
            iconAnchor: [0, 10]
          })}
          interactive={false}
        />
      </React.Fragment>
    );
  }, [hudLayers.hazard, lat, lon]);

  // Concentric Rings for Shield Attenuation Theory (in meters)
  const attenuationRings: number[] = [250000, 500000, 1000000];

  if (!mounted) {
    return (
      <div className="w-full h-full bg-zinc-950 flex shadow-inner border border-zinc-900 items-center justify-center font-mono text-[10px] text-zinc-800">
        [ SYNCING SPATIAL... ]
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-sm overflow-hidden border border-zinc-800/80">
      <MapContainer key="magnetic-map-container" center={center} zoom={13} maxZoom={20} className="w-full h-full bg-zinc-950" zoomControl={false} preferCanvas={true}>
        <SyncMapCenter lat={lat} lon={lon} />
        <InvalidateMapSize />
        <ZoomListener onChangeZoom={setZoom} />
        <ClickEvents onMapClick={(lat, lng) => {
          setClickedPos([lat, lng]);
          onSelectTarget?.(lat, lng);
        }} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={20}
          maxNativeZoom={19}
        />

        {clickedPos && (
          <Marker position={clickedPos}>
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <div className="font-mono text-[10px] text-zinc-800 font-bold">Selected Target</div>
            </Tooltip>
          </Marker>
        )}

        <Marker position={center} />

        {/* Draw Dynamic Sectors (Stars/Vectors) */}
        {vectorLayer}

        {/* Draw Danger Zones (Red) at Boundaries */}
        {dangerLayer}

        {/* Draw Hazard / GIS Overlay if enabled */}
        {hazardLayer}

        {/* Draw True North Line (Geographic) */}
        <Polyline
          positions={[center, getDestination(lat, lon, 0, 1000)]}
          color="#10b981"
          weight={3}
          dashArray="8,8"
          opacity={0.9}
        />

        {/* Draw Magnetic North Line */}
        <Polyline
          positions={[center, getDestination(lat, lon, magNorthBearing, 1000)]}
          color="#3b82f6"
          weight={3}
          opacity={0.9}
        />

        {/* Concentric Distance Rings for Attenuation */}
        {attenuationRings.map((radiusMeters, i) => (
          <Circle
            key={`ring-${radiusMeters}`}
            center={center}
            radius={radiusMeters}
            pathOptions={{ color: '#71717a', weight: 1, dashArray: '2,10', fill: false, opacity: 0.3 - (i * 0.05) }}
          />
        ))}

        {/* Real Estate Properties */}
        {properties?.map((prop: any) => (
          prop.lat && prop.lon ? (
            <CircleMarker
              key={prop.id || prop.url}
              center={[prop.lat, prop.lon]}
              radius={prop.is_new_build ? 5 : 3}
              pathOptions={{
                color: prop.is_new_build ? '#10b981' : '#3b82f6',
                fillColor: prop.is_new_build ? '#10b981' : '#3b82f6',
                fillOpacity: 0.8,
                weight: 1
              }}
              eventHandlers={{
                click: () => {
                  setClickedPos([prop.lat, prop.lon]);
                  onSelectTarget?.(prop.lat, prop.lon);
                }
              }}
            >
              <Tooltip>
                <div className="font-mono text-xs text-zinc-800 p-1">
                  <div className="font-bold">{prop.property_name}</div>
                  {prop.is_new_build && <div className="text-emerald-600 font-bold">[新築]</div>}
                  <div>家賃: {prop.rent ? `${(prop.rent / 10000).toFixed(1)}万円` : '不明'}</div>
                  <div>{prop.address}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          ) : null
        ))}
      </MapContainer>

      {/* UI Overlay */}
      <div className="absolute top-16 right-4 z-[1000] pointer-events-none">
        <div className="bg-zinc-950/90 md:backdrop-blur-md px-3 py-2 border border-blue-500/30 rounded-sm shadow-lg flex flex-col gap-1 items-end text-right">
          <div className="flex items-center gap-2 mb-1 justify-end">
            <div className="text-[10px] uppercase font-mono tracking-widest text-emerald-400">真北 (Geographic North)</div>
            <div className="w-4 border-t-2 border-emerald-500 border-dashed"></div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <div className="text-[10px] uppercase font-mono tracking-widest text-blue-400">磁北 (Magnetic North)</div>
            <div className="w-4 border-t-[3px] border-blue-500"></div>
          </div>
          <div className="text-xs font-mono text-zinc-300 mt-1 pt-1 border-t border-zinc-800 w-full">
            現在地偏角 (WMM2020): {declination > 0 ? '東偏' : '西偏'}{Math.abs(declination).toFixed(2)}°
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5 leading-tight max-w-[200px]">
            ※占術・気学の吉凶評価は、すべて「磁北」を基準に補正計算されています。
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-[1000] pointer-events-none">
        <div className="bg-zinc-950/90 md:backdrop-blur-md px-3 py-2 border border-zinc-800 rounded-sm text-[9px] flex flex-col gap-1.5 shadow-xl">
          <div className="text-zinc-500 font-mono uppercase tracking-widest border-b border-zinc-800 pb-1 flex justify-between gap-4">
            <span>Legend</span>
            <span className="text-emerald-500">[{activeLayerMode.toUpperCase()}]</span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
              <span className="text-zinc-300">大吉 (Optimal)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
              <span className="text-zinc-300">危険 (Noise)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>
              <span className="text-zinc-300">通常 (Safe)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#d946ef]"></span>
              <span className="text-zinc-300">個人不調 (Bio)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#eab308]"></span>
              <span className="text-zinc-300">特異点 (Void)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 border-t border-dashed border-zinc-500"></div>
              <span className="text-zinc-500">距離リング</span>
            </div>
          </div>

          {honmeiStar && (
            <div className="text-[8px] text-[#a855f7] border-t border-zinc-900 pt-1 mt-1 font-mono">
              HARDWARE SYNC: {honmeiStar.physical}
            </div>
          )}
        </div>
      </div>

      {/* UI Overlay - Clicked Position */}
      {clickedPos && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
          <div className="bg-zinc-950/90 md:backdrop-blur-md px-3 py-2 border border-emerald-500/50 rounded-sm shadow-xl flex flex-col gap-1.5 animate-fade-in-up">
            <div className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest border-b border-zinc-800 pb-1 flex justify-between gap-4">
              <span>Target Coordinates</span>
              <button
                onClick={() => setClickedPos(null)}
                className="text-zinc-500 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col text-[10px] font-mono text-zinc-300">
                <span>Lat: {clickedPos[0].toFixed(5)}</span>
                <span>Lon: {clickedPos[1].toFixed(5)}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${clickedPos[0].toFixed(5)},${clickedPos[1].toFixed(5)}`);
                  alert(`座標をコピーしました: ${clickedPos[0].toFixed(5)},${clickedPos[1].toFixed(5)}`);
                }}
                className="bg-emerald-900/40 text-emerald-400 border border-emerald-500/50 px-2 py-1.5 text-[9px] uppercase tracking-widest hover:bg-emerald-800/60 transition-colors"
              >
                📋 COPY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
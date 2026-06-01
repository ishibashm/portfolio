"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Circle, CircleMarker, useMap, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { scaleLinear } from "d3-scale";
import { AstroGridCalendar } from "./realestate/AstroGridCalendar";

// Fix Leaflet default icon problem in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface ScoredProperty {
  id: string;
  property_name: string;
  rent: number | null;
  management_fee: number | null;
  layout: string | null;
  size_sqm: any | null;
  is_new_build: boolean | null;
  minutes_to_station: number | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  building_age: number | null;
  floor: string | null;
  url: string | null;
  totalRent: number;
  propSqmRent: number;
  distanceKm: number | null;
  direction: string | null;
  astrologyStatus: string;
  astrologyScore: number;
  yieldScore: number;
  arbitrageScore: number;
  isTendo?: boolean;
  dateScores?: any[];
}

interface ArbitrageMapInnerProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  useTrueNorth: boolean;
  layerMode: string;
  radiusKm?: string;
  prefecture?: string;
  isTransitioningDate?: boolean;
  onDateChange?: (date: string) => void;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number; zoom: number }) => void;
}

// マップピンの5色塗り分けとカラーコードの取得
const getPropertyPinColors = (prop: any) => {
  const targetDay = prop.dateScores?.[3];
  const isUltra = targetDay?.isUltraLucky;
  
  const isHeavyBad = [
    'NOISE_GOU', 
    'NOISE_ANKEN', 
    'NOISE_HA', 
    'NOISE_HONMEI', 
    'NOISE_TEKI'
  ].includes(prop.astrologyStatus);

  if (isHeavyBad) {
    // 🟥 赤（警告）
    return {
      fillColor: "#ef4444",
      borderColor: "#7f1d1d",
      textClass: "text-red-500 dark:text-red-400",
      bgClass: "bg-red-500/10 border-red-500/30",
      label: "大凶"
    };
  }

  const details = targetDay?.scoreDetails;
  const hasLightBad = (details && (details.doyouPenalty < 0 || details.voidPenalty < 0)) || 
                      ['NOISE_VOID', 'NOISE_NODE', 'NOISE_GETSUMEI', 'NOISE_GETSUTEKI'].includes(prop.astrologyStatus);
  const hasLucky = prop.isTendo || ['OPTIMAL', 'SAFE'].includes(prop.astrologyStatus) || prop.astroFlags?.some((f: string) => f.endsWith('_LINE'));

  if (isUltra) {
    // 🌟 ゴールド（超吉）
    return {
      fillColor: "#fbbf24",
      borderColor: "#b45309",
      textClass: "text-amber-500 dark:text-amber-400 font-bold",
      bgClass: "bg-amber-500/10 border-amber-500/30",
      label: "超吉"
    };
  }

  if (hasLucky && !hasLightBad) {
    // 🟩 緑（吉）
    return {
      fillColor: "#10b981",
      borderColor: "#065f46",
      textClass: "text-emerald-500 dark:text-emerald-400",
      bgClass: "bg-emerald-500/10 border-emerald-500/30",
      label: "吉"
    };
  }

  if (hasLightBad) {
    // 🟨 黄（注意）
    return {
      fillColor: "#f59e0b",
      borderColor: "#78350f",
      textClass: "text-amber-600 dark:text-amber-500",
      bgClass: "bg-amber-500/5 border-amber-500/20",
      label: "注意"
    };
  }

  // ⬜ グレー（通常・ネイビーグレー）➔ 地図と同化しないように境界線を濃く
  return {
    fillColor: "#475569", // slate-600
    borderColor: "#1e293b", // slate-900
    textClass: "text-slate-500 dark:text-slate-400",
    bgClass: "bg-slate-500/10 border-slate-500/30",
    label: "通常"
  };
};

// Helper to calculate coordinates of a point at a certain distance and bearing from origin
function getDestination(lat: number, lon: number, bearing: number, distanceKm: number = 10) {
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

// Sync map center component
function SyncMapCenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom() < 12 ? 13 : map.getZoom());
  }, [lat, lon, map]);
  return null;
}

// Invalidate Leaflet map size on load/resize
function InvalidateMapSize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 300);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Automatically fit map bounds to show properties and the center
function AutoFitBounds({ properties, center, prefecture }: { properties: ScoredProperty[]; center: [number, number]; prefecture?: string }) {
  const map = useMap();
  const prevPrefectureRef = useRef<string | undefined>(undefined);
  const prevCenterRef = useRef<[number, number] | null>(null);
  const prevPropsLengthRef = useRef<number>(0);

  useEffect(() => {
    if (properties.length === 0) return;

    const prefectureChanged = prevPrefectureRef.current !== prefecture;
    const centerChanged = !prevCenterRef.current || 
      Math.abs(prevCenterRef.current[0] - center[0]) > 0.01 || 
      Math.abs(prevCenterRef.current[1] - center[1]) > 0.01;
    const propsAdded = prevPropsLengthRef.current === 0 && properties.length > 0;

    if (prefectureChanged || centerChanged || propsAdded) {
      const bounds = L.latLngBounds([center]);
      properties.forEach(p => {
        if (p.lat && p.lon) {
          bounds.extend([p.lat, p.lon]);
        }
      });
      
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      
      prevPrefectureRef.current = prefecture;
      prevCenterRef.current = center;
    }
    
    prevPropsLengthRef.current = properties.length;
  }, [properties, center, prefecture, map]);

  return null;
}

// Track map viewport bounds
function BoundsListener({ onBoundsChange }: { onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number; zoom: number }) => void }) {
  const map = useMapEvents({
    moveend() {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouthWest().lat,
        maxLat: bounds.getNorthEast().lat,
        minLon: bounds.getSouthWest().lng,
        maxLon: bounds.getNorthEast().lng,
        zoom: map.getZoom()
      });
    },
    zoomend() {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouthWest().lat,
        maxLat: bounds.getNorthEast().lat,
        minLon: bounds.getSouthWest().lng,
        maxLon: bounds.getNorthEast().lng,
        zoom: map.getZoom()
      });
    }
  });

  return null;
}

function getMunicipality(address: string | null): string {
  if (!address) return "その他";
  const cleanAddr = address.replace(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/, '');
  const cityDistrictMatch = cleanAddr.match(/^([^市]+市[^区]+区)/);
  if (cityDistrictMatch) return cityDistrictMatch[1];
  const cityMatch = cleanAddr.match(/^([^市]+市)/);
  if (cityMatch) return cityMatch[1];
  const gunMatch = cleanAddr.match(/^([^郡]+郡[^町]+町|[^郡]+郡[^村]+村)/);
  if (gunMatch) return gunMatch[1];
  const wardMatch = cleanAddr.match(/^([^区]+区)/);
  if (wardMatch) return wardMatch[1];
  const townMatch = cleanAddr.match(/^([^町]+町|[^村]+村)/);
  if (townMatch) return townMatch[1];
  return cleanAddr.substring(0, 8);
}

export default function ArbitrageMapInner({
  properties,
  baseLat,
  baseLon,
  useTrueNorth,
  layerMode,
  radiusKm,
  prefecture,
  isTransitioningDate = false,
  onDateChange,
  onBoundsChange
}: ArbitrageMapInnerProps) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(13);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleBoundsChange = useCallback((b: { minLat: number; maxLat: number; minLon: number; maxLon: number; zoom: number }) => {
    setZoom(b.zoom);
    if (onBoundsChange) {
      onBoundsChange(b);
    }
  }, [onBoundsChange]);

  const center = useMemo<[number, number]>(() => [baseLat, baseLon], [baseLat, baseLon]);
  const declination = -8.2; // Tokyo magnetic declination
  const rotationAngle = useTrueNorth ? 0 : declination;

  // 市区町村ごとの集計データ (広域表示用)
  const municipalityData = useMemo(() => {
    if (zoom >= 10) return [];

    const groups: Record<string, {
      name: string;
      latSum: number;
      lonSum: number;
      count: number;
      scoreSum: number;
      properties: ScoredProperty[];
    }> = {};

    properties.forEach(p => {
      if (!p.lat || !p.lon) return;
      const muni = getMunicipality(p.address);
      if (!groups[muni]) {
        groups[muni] = {
          name: muni,
          latSum: 0,
          lonSum: 0,
          count: 0,
          scoreSum: 0,
          properties: []
        };
      }
      groups[muni].latSum += p.lat;
      groups[muni].lonSum += p.lon;
      groups[muni].count += 1;
      groups[muni].scoreSum += p.arbitrageScore;
      groups[muni].properties.push(p);
    });

    return Object.values(groups).map(g => ({
      name: g.name,
      lat: g.latSum / g.count,
      lon: g.lonSum / g.count,
      count: g.count,
      avgScore: g.scoreSum / g.count,
      properties: g.properties
    }));
  }, [properties, zoom]);

  // Directions mapping
  const sectors = useMemo(() => {
    const dirMap = [
      { dir: "N", deg: 0 },
      { dir: "NE", deg: 45 },
      { dir: "E", deg: 90 },
      { dir: "SE", deg: 135 },
      { dir: "S", deg: 180 },
      { dir: "SW", deg: 225 },
      { dir: "W", deg: 270 },
      { dir: "NW", deg: 315 }
    ];

    // Determine status of each direction from properties in that direction
    return dirMap.map(d => {
      // Find properties in this direction to extract their status (optimal, safe, noise)
      const propsInDir = properties.filter(p => p.direction === d.dir);
      let status = "SAFE";
      if (propsInDir.length > 0) {
        // Find the most common status or use first one
        const optimalCount = propsInDir.filter(p => p.astrologyStatus.includes("OPTIMAL")).length;
        const noiseCount = propsInDir.filter(p => p.astrologyStatus.includes("NOISE")).length;
        if (optimalCount > 0) status = "OPTIMAL";
        else if (noiseCount > propsInDir.length / 2) status = "NOISE";
      }
      return { ...d, status };
    });
  }, [properties]);

  // Color mapping based on score
  const getPropertyColor = useCallback((score: number) => {
    if (score >= 75) return "#10b981"; // Excellent (Emerald)
    if (score >= 60) return "#34d399"; // Good (Mint)
    if (score >= 50) return "#3b82f6"; // Moderate (Blue)
    if (score >= 40) return "#f59e0b"; // Warning (Amber)
    return "#ef4444"; // Bad (Red)
  }, []);

  // Kigaku Vector Styles
  const getStyleForVector = useCallback((status: string) => {
    let color = "#3b82f6";
    let opacity = 0.05;
    let dashArray = undefined;

    if (status.includes("OPTIMAL")) {
      color = "#10b981";
      opacity = 0.12;
    } else if (status.includes("NOISE")) {
      color = "#ef4444";
      opacity = 0.08;
      dashArray = "5,5";
    } else if (status.includes("VOID") || status.includes("NODE")) {
      color = "#f59e0b";
      opacity = 0.08;
    }

    return { color, opacity, dashArray };
  }, []);

  // Render direction sectors
  const sectorLayers = useMemo(() => {
    return sectors.map(d => {
      const { color, opacity, dashArray } = getStyleForVector(d.status);
      const baseBearing = rotationAngle + d.deg;

      // Draw wedge shape polygon extending 30km
      const points: [number, number][] = [center];
      const isCorner = ["NE", "SE", "SW", "NW"].includes(d.dir);
      const halfWidth = isCorner ? 30 : 15;
      
      for (let offset = -halfWidth; offset <= halfWidth; offset += 5) {
        points.push(getDestination(baseLat, baseLon, baseBearing + offset, 30));
      }

      // Label position (centered in the wedge at 5km distance)
      const labelPos = getDestination(baseLat, baseLon, baseBearing, 4);

      const getStatusText = (status: string) => {
        if (status === "OPTIMAL") return "大吉方位";
        if (status === "NOISE") return "凶方位";
        return "通常吉";
      };

      return (
        <React.Fragment key={`sector-wedge-${d.dir}`}>
          <Polygon
            positions={points}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: opacity,
              weight: d.status === "SAFE" ? 0.5 : 1,
              dashArray: dashArray
            }}
            interactive={false}
          />
          <Marker
            position={labelPos}
            icon={L.divIcon({
              className: "custom-div-icon",
              html: `<div class="px-1.5 py-0.5 rounded bg-zinc-950/80 border border-zinc-800 text-[9px] font-bold text-center pointer-events-none" style="color: ${color}; text-shadow: 0 0 2px rgba(0,0,0,0.8); white-space: nowrap;">
                ${d.dir} (${getStatusText(d.status)})
              </div>`,
              iconSize: [60, 20],
              iconAnchor: [30, 10]
            })}
            interactive={false}
          />
        </React.Fragment>
      );
    });
  }, [sectors, center, baseLat, baseLon, rotationAngle, getStyleForVector]);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-[#050505] flex items-center justify-center font-mono text-xs text-zinc-500">
        [ 地図エンジンの初期化中... ]
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", background: "#0c0c0e" }}
        zoomControl={false}
      >
        <BoundsListener onBoundsChange={handleBoundsChange} />
        <SyncMapCenter lat={baseLat} lon={baseLon} />
        <InvalidateMapSize />
        <AutoFitBounds properties={properties} center={center} prefecture={prefecture} />
        
        {/* OpenStreetMap / CartoDB Dark Matter Tiles */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Base Location Marker (Glowing Center) */}
        <Marker position={center}>
          <Popup>
            <div className="font-sans text-xs text-gray-900 p-1">
              <div className="font-bold text-indigo-600">現在地・スキャン起点</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                経度: {baseLon.toFixed(5)} <br />
                緯度: {baseLat.toFixed(5)}
              </div>
            </div>
          </Popup>
        </Marker>

        {/* Pulsing ring around center (matching scan radius) */}
        {radiusKm && radiusKm !== "all" && (
          <Circle
            center={center}
            radius={Number(radiusKm) * 1000}
            pathOptions={{
              color: "#10b981",
              fillColor: "#10b981",
              fillOpacity: 0.03,
              weight: 1.5,
              dashArray: "4,8"
            }}
          />
        )}

        {/* Direction Sectors */}
        {sectorLayers}

        {/* Viewport content based on Zoom Level */}
        {zoom < 10 ? (
          // 広域表示：市区町村バブル
          municipalityData.map((muni) => {
            const color = getPropertyColor(muni.avgScore);
            const radius = Math.max(10, Math.min(30, 8 + Math.log2(muni.count) * 4));
            
            return (
              <CircleMarker
                key={`muni-${muni.name}`}
                center={[muni.lat, muni.lon]}
                radius={radius}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: color,
                  fillOpacity: 0.85,
                  weight: 1.5
                }}
              >
                <Popup>
                  <div className="font-sans text-xs text-gray-900 p-2 min-w-[150px]">
                    <div className="font-bold text-sm text-gray-900 leading-tight border-b border-gray-100 pb-1 mb-1.5">
                      {muni.name}
                    </div>
                    <div className="space-y-1 text-gray-600">
                      <div className="flex justify-between">
                        <span>検出物件数:</span>
                        <span className="font-bold text-gray-900">{muni.count}件</span>
                      </div>
                      <div className="flex justify-between">
                        <span>平均推奨度:</span>
                        <span className="font-bold text-emerald-600">{muni.avgScore.toFixed(1)}点</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-gray-400 mt-2 text-center">
                      ※ズームインすると詳細物件ピンが表示されます
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })
        ) : (
          // 詳細表示：個別物件ピン
          (() => {
            // 重なり順の制御：最背面（黄、グレー）➔ 中間（緑）➔ 最手前（ゴールド、赤）の順にソートして描画
            const sortedProperties = [...properties].sort((a, b) => {
              const getPriority = (p: any) => {
                const targetDay = p.dateScores?.[3];
                const isUltra = targetDay?.isUltraLucky;
                const isHeavyBad = ['NOISE_GOU', 'NOISE_ANKEN', 'NOISE_HA', 'NOISE_HONMEI', 'NOISE_TEKI'].includes(p.astrologyStatus);
                if (isUltra || isHeavyBad) return 3; // ゴールド、赤 ➔ 最手前
                
                const details = targetDay?.scoreDetails;
                const hasLightBad = (details && (details.doyouPenalty < 0 || details.voidPenalty < 0)) || 
                                    ['NOISE_VOID', 'NOISE_NODE', 'NOISE_GETSUMEI', 'NOISE_GETSUTEKI'].includes(p.astrologyStatus);
                const hasLucky = p.isTendo || ['OPTIMAL', 'SAFE'].includes(p.astrologyStatus) || p.astroFlags?.some((f: string) => f.endsWith('_LINE'));
                
                if (hasLucky && !hasLightBad) return 2; // 緑 ➔ 中間
                return 1; // 黄、グレー ➔ 最背面
              };
              return getPriority(a) - getPriority(b);
            });

            return sortedProperties.map((prop) => {
              if (!prop.lat || !prop.lon) return null;
              
              const pinColors = getPropertyPinColors(prop);
              const isTodayUltra = prop.dateScores?.[3]?.isUltraLucky;
              
              return (
                <CircleMarker
                  key={prop.id}
                  center={[prop.lat, prop.lon]}
                  radius={isTodayUltra ? 8 : 6}
                  pathOptions={{
                    color: pinColors.borderColor,
                    fillColor: pinColors.fillColor,
                    fillOpacity: isTransitioningDate ? 0.3 : 0.9,
                    weight: isTodayUltra ? 2.5 : 1.5
                  }}
                  className={isTransitioningDate ? "animate-pulse" : ""}
                >
                  <Popup className="arbitrage-property-popup">
                    <div className="font-sans text-xs text-gray-900 p-2 min-w-[220px] max-w-[280px]">
                      {/* ポップアップとピンカラーの連動ヘッダー */}
                      <div className={`font-bold text-xs leading-tight p-2 -mx-2 -mt-2 rounded-t-lg border-b ${pinColors.bgClass} ${pinColors.textClass} flex justify-between items-center`}>
                        <span className="line-clamp-1">{prop.property_name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold shrink-0 ml-1">
                          {pinColors.label}
                        </span>
                      </div>
                      
                      {prop.is_new_build && (
                        <span className="inline-block bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded mt-2 mr-1">
                          新築
                        </span>
                      )}
                      {prop.floor && (
                        <span className="inline-block bg-gray-100 text-gray-800 text-[9px] font-medium px-1.5 py-0.5 rounded mt-2">
                          {prop.floor}
                        </span>
                      )}

                      <div className="mt-2.5 border-t border-gray-100 pt-2 space-y-1 text-gray-600 text-[11px]">
                        <div className="flex justify-between">
                          <span>総賃料:</span>
                          <span className="font-bold text-gray-900">
                            {prop.totalRent ? `${(prop.totalRent / 10000).toFixed(1)}万円` : "不明"}
                            {prop.management_fee ? ` (管:${(prop.management_fee / 1000).toFixed(0)}k)` : ""}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>広さ / 間取り:</span>
                          <span className="font-medium text-gray-900">
                            {prop.size_sqm}㎡ / {prop.layout || "不明"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>築年 / 駅徒歩:</span>
                          <span className="font-medium text-gray-900">
                            築{prop.building_age || 0}年 / {prop.minutes_to_station || "不明"}分
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>方位・吉凶:</span>
                          <span className={`font-semibold ${pinColors.textClass}`}>
                            {prop.direction ? `${prop.direction} (${prop.maxAstroFactor})` : '不明'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 bg-gray-50 rounded-lg p-2 flex justify-between items-center text-[10px] border border-gray-100">
                        <div>
                          <div className="text-gray-400">利回り偏差値</div>
                          <div className="font-mono font-bold text-indigo-600 text-xs">
                            {prop.yieldScore.toFixed(1)}
                          </div>
                        </div>
                        <div className="text-right border-l border-gray-200 pl-2">
                          <div className="text-gray-500 font-medium">おすすめ度</div>
                          <div className="flex gap-0.5 text-amber-400 mt-0.5">
                            {(() => {
                              let starCount = 1;
                              if (prop.arbitrageScore >= 80) starCount = 5;
                              else if (prop.arbitrageScore >= 70) starCount = 4;
                              else if (prop.arbitrageScore >= 60) starCount = 3;
                              else if (prop.arbitrageScore >= 50) starCount = 2;
                              return Array.from({ length: 5 }).map((_, i) => (
                                <span key={i} className={i < starCount ? "opacity-100 text-amber-400" : "opacity-20 text-zinc-600"}>★</span>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <AstroGridCalendar 
                          dateScores={prop.dateScores} 
                          onDateChange={onDateChange}
                          isTransitioning={isTransitioningDate}
                        />
                      </div>

                      {prop.url && (
                        <a
                          href={prop.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 block w-full py-1.5 text-center text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm"
                        >
                          詳細サイトを開く ↗
                        </a>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            });
          })()
        )}
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 right-4 bg-zinc-950/90 text-white px-3.5 py-3 rounded-xl shadow-lg border border-zinc-800 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-2">
        <div className="font-bold border-b border-zinc-800 pb-1 mb-0.5 text-zinc-300">アストロ吉凶（凡例）</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] border border-[#b45309]"></span>
            <span>超吉 (最上吉)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] border border-[#065f46]"></span>
            <span>吉 (相性抜群)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] border border-[#78350f]"></span>
            <span>注意 (軽い凶)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-[#7f1d1d]"></span>
            <span>警告 (大凶方位)</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#475569] border border-[#1e293b]"></span>
            <span>通常 (吉凶なし)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

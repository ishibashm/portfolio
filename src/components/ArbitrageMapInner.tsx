"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polygon, Circle, CircleMarker, useMap, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { scaleLinear } from "d3-scale";

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
}

interface ArbitrageMapInnerProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  useTrueNorth: boolean;
  layerMode: string;
  radiusKm?: string;
  onBoundsChange?: (bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number; zoom: number }) => void;
}

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
function AutoFitBounds({ properties, center }: { properties: ScoredProperty[]; center: [number, number] }) {
  const map = useMap();
  const prevCenterRef = useRef<[number, number] | null>(null);
  const initialFitDoneRef = useRef(false);

  useEffect(() => {
    if (properties.length === 0) return;

    // Check if center changed
    const centerChanged = !prevCenterRef.current || 
      prevCenterRef.current[0] !== center[0] || 
      prevCenterRef.current[1] !== center[1];

    // If center didn't change and we've already done the initial fit, do nothing
    if (!centerChanged && initialFitDoneRef.current) {
      return;
    }

    // Perform fit
    const bounds = L.latLngBounds([center]);
    properties.forEach(p => {
      if (p.lat && p.lon) {
        bounds.extend([p.lat, p.lon]);
      }
    });
    
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    
    // Update refs
    prevCenterRef.current = center;
    initialFitDoneRef.current = true;
  }, [properties, center, map]);

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

export default function ArbitrageMapInner({
  properties,
  baseLat,
  baseLon,
  useTrueNorth,
  layerMode,
  radiusKm,
  onBoundsChange
}: ArbitrageMapInnerProps) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(13);

  useEffect(() => {
    setMounted(true);
  }, []);

  const center = useMemo<[number, number]>(() => [baseLat, baseLon], [baseLat, baseLon]);
  const declination = -8.2; // Tokyo magnetic declination
  const rotationAngle = useTrueNorth ? 0 : declination;

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
        <BoundsListener onBoundsChange={onBoundsChange} />
        <SyncMapCenter lat={baseLat} lon={baseLon} />
        <InvalidateMapSize />
        <AutoFitBounds properties={properties} center={center} />
        
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

        {/* Property Markers */}
        {properties.map((prop) => {
          if (!prop.lat || !prop.lon) return null;
          
          const color = getPropertyColor(prop.arbitrageScore);
          
          return (
            <CircleMarker
              key={prop.id}
              center={[prop.lat, prop.lon]}
              radius={6}
              pathOptions={{
                color: "#ffffff",
                fillColor: color,
                fillOpacity: 0.9,
                weight: 1
              }}
            >
              <Popup className="arbitrage-property-popup">
                <div className="font-sans text-xs text-gray-900 p-2 min-w-[220px] max-w-[280px]">
                  <div className="font-bold text-sm text-gray-900 line-clamp-2 leading-tight">
                    {prop.property_name}
                  </div>
                  {prop.is_new_build && (
                    <span className="inline-block bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 mr-1">
                      新築
                    </span>
                  )}
                  {prop.floor && (
                    <span className="inline-block bg-gray-100 text-gray-800 text-[9px] font-medium px-1.5 py-0.5 rounded mt-1">
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
                      <span>方位 (吉凶):</span>
                      <span className={`font-semibold ${prop.astrologyStatus.includes("OPTIMAL") ? "text-emerald-600" : prop.astrologyStatus.includes("NOISE") ? "text-red-500" : "text-blue-600"}`}>
                        {prop.direction} ({prop.astrologyStatus})
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
                    <div>
                      <div className="text-gray-400">運気スコア</div>
                      <div className="font-mono font-bold text-indigo-600 text-xs">
                        {prop.astrologyScore.toFixed(1)}
                      </div>
                    </div>
                    <div className="text-right border-l border-gray-200 pl-2">
                      <div className="text-gray-500 font-medium">総合推奨度</div>
                      <div className="font-mono font-extrabold text-emerald-600 text-sm">
                        {prop.arbitrageScore.toFixed(1)}
                      </div>
                    </div>
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
        })}
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 right-4 bg-zinc-950/90 text-white px-3.5 py-3 rounded-xl shadow-lg border border-zinc-800 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-2">
        <div className="font-bold border-b border-zinc-800 pb-1 mb-0.5 text-zinc-300">推奨度 (アービトラージ)</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
            <span>大吉 (75+)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]"></span>
            <span>吉 (60-75)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
            <span>普通 (50-60)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></span>
            <span>低 (40-50)</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></span>
            <span>警戒 (&lt;40)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

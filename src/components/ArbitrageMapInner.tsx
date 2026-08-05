"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Circle,
  CircleMarker,
  useMap,
  Popup,
  useMapEvents,
  GeoJSON,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Copy, Check } from "lucide-react";
import { scaleLinear } from "d3-scale";
import { motion, AnimatePresence } from "framer-motion";
import { AstroGridCalendar } from "./realestate/AstroGridCalendar";
import {
  getPropertyPinColors,
  getRecommendationStarCount,
} from "@/utils/arbitrageHelpers";

// Fix Leaflet default icon problem in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Map Click Handler to copy coordinates
function MapClickHandler({
  onCopy,
}: {
  onCopy: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      const target = e.originalEvent.target as HTMLElement;
      // Don't trigger if clicking on a control, popup, or marker
      if (
        target.closest(".leaflet-control") ||
        target.closest(".leaflet-popup") ||
        target.closest(".leaflet-marker-icon")
      ) {
        return;
      }
      onCopy(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export interface ScoredProperty {
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
  magneticDirection: string | null;
  astrologyStatus: string;
  astrologyScore: number;
  yieldScore: number;
  arbitrageScore: number;
  totalScore: number;
  isTendo?: boolean;
  maxAstroFactor?: string;
  astroFlags?: string[];
  dateScores?: any[];
}

interface ArbitrageMapInnerProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  mapCenter?: [number, number];
  useTrueNorth: boolean;
  layerMode: string;
  radiusKm?: string;
  prefecture?: string;
  isTransitioningDate?: boolean;
  showListView?: boolean;
  useClassical?: boolean;
  onDateChange?: (date: string) => void;
  onBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
  }) => void;
}

// Helper to calculate coordinates of a point at a certain distance and bearing from origin
function getDestination(
  lat: number,
  lon: number,
  bearing: number,
  distanceKm: number = 10,
) {
  const R = 6371; // Earth radius in km
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (bearing * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceKm / R) +
      Math.cos(lat1) * Math.sin(distanceKm / R) * Math.cos(brng),
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceKm / R) * Math.cos(lat1),
      Math.cos(distanceKm / R) - Math.sin(lat1) * Math.sin(lat2),
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
function AutoFitBounds({
  properties,
  center,
  prefecture,
}: {
  properties: ScoredProperty[];
  center: [number, number];
  prefecture?: string;
}) {
  const map = useMap();
  const prevPrefectureRef = useRef<string | undefined>(undefined);
  const prevCenterRef = useRef<[number, number] | null>(null);
  const prevPropsLengthRef = useRef<number>(0);

  useEffect(() => {
    // If no properties, zoom out to show Japan if not already zoomed out
    if (properties.length === 0) {
      if (prevPropsLengthRef.current > 0 || !prevCenterRef.current) {
        // Center roughly on Japan with a wide zoom
        map.setView([38.0, 137.0], 5);
        prevCenterRef.current = [38.0, 137.0];
      }
      prevPropsLengthRef.current = 0;
      return;
    }

    const prefectureChanged = prevPrefectureRef.current !== prefecture;
    const centerChanged =
      !prevCenterRef.current ||
      Math.abs(prevCenterRef.current[0] - center[0]) > 0.01 ||
      Math.abs(prevCenterRef.current[1] - center[1]) > 0.01;
    const propsAdded =
      prevPropsLengthRef.current === 0 && properties.length > 0;

    if (prefectureChanged || centerChanged || propsAdded) {
      // If prefecture is 'all' or undefined, keep the wide Japan view unless center was explicitly moved
      if ((!prefecture || prefecture === "all") && !centerChanged) {
        map.setView([38.0, 137.0], 5);
      } else {
        const bounds = L.latLngBounds([center]);
        properties.forEach((p) => {
          if (p.lat && p.lon) {
            bounds.extend([p.lat, p.lon]);
          }
        });

        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      }

      prevPrefectureRef.current = prefecture;
      prevCenterRef.current = center;
    }

    prevPropsLengthRef.current = properties.length;
  }, [properties, center, prefecture, map]);

  return null;
}

// Track map viewport bounds
function BoundsListener({
  onBoundsChange,
}: {
  onBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
  }) => void;
}) {
  const map = useMapEvents({
    moveend() {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouthWest().lat,
        maxLat: bounds.getNorthEast().lat,
        minLon: bounds.getSouthWest().lng,
        maxLon: bounds.getNorthEast().lng,
        zoom: map.getZoom(),
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
        zoom: map.getZoom(),
      });
    },
  });

  return null;
}

function getMunicipality(address: string | null): string {
  if (!address) return "その他";
  const cleanAddr = address.replace(
    /^(東京都|北海道|京都府|大阪府|.{2,3}県)/,
    "",
  );
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
  mapCenter,
  useTrueNorth,
  layerMode,
  radiusKm,
  prefecture,
  isTransitioningDate = false,
  showListView = false,
  useClassical = false,
  onDateChange,
  onBoundsChange,
}: ArbitrageMapInnerProps) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(5);
  const [currentBounds, setCurrentBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);
  const [mapTheme, setMapTheme] = useState<"dark" | "light">("light");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "info" = "success") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 2500);
    },
    [],
  );

  const copyCoordinates = useCallback(
    (lat: number, lon: number, label?: string) => {
      const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`${label ? label + "の" : ""}座標をコピーしました: ${text}`);
      });
    },
    [showToast],
  );

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("map_theme") as "dark" | "light";
    if (saved) setMapTheme(saved);

    const handleThemeChange = () => {
      const current = localStorage.getItem("map_theme") as "dark" | "light";
      if (current) setMapTheme(current);
    };
    window.addEventListener("mapThemeChanged", handleThemeChange);

    fetch("/prefectures.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load prefectures.geojson");
        return res.json();
      })
      .then((data) => setGeoData(data))
      .catch((err) => console.error("Error loading prefectures.geojson:", err));

    return () =>
      window.removeEventListener("mapThemeChanged", handleThemeChange);
  }, []);

  const prefCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    properties.forEach((p) => {
      if (!p.address) return;
      const match = p.address.match(/^(東京都|北海道|京都府|大阪府|.{2,3}県)/);
      if (match) {
        const pref = match[1];
        counts[pref] = (counts[pref] || 0) + 1;
      }
    });
    return counts;
  }, [properties]);

  const handleBoundsChange = useCallback(
    (b: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
      zoom: number;
    }) => {
      setZoom(b.zoom);
      setCurrentBounds({
        minLat: b.minLat,
        maxLat: b.maxLat,
        minLon: b.minLon,
        maxLon: b.maxLon,
      });
      if (onBoundsChange) {
        onBoundsChange(b);
      }
    },
    [onBoundsChange],
  );

  const visibleProperties = useMemo(() => {
    if (!currentBounds) return properties;
    return properties.filter((p) => {
      if (p.lat === null || p.lon === null) return false;
      return (
        p.lat >= currentBounds.minLat &&
        p.lat <= currentBounds.maxLat &&
        p.lon >= currentBounds.minLon &&
        p.lon <= currentBounds.maxLon
      );
    });
  }, [properties, currentBounds]);

  const visibleCount = visibleProperties.length;

  useEffect(() => {
    if (zoom >= 12) {
      setShowHeatmap(false);
      return;
    }
    if (visibleCount >= 120) {
      setShowHeatmap(true);
    } else if (visibleCount <= 80) {
      setShowHeatmap(false);
    }
  }, [visibleCount, zoom]);

  const center = useMemo<[number, number]>(() => {
    if (mapCenter) return mapCenter;
    return [baseLat, baseLon];
  }, [baseLat, baseLon, mapCenter]);
  const declination = -8.2; // Tokyo magnetic declination
  const rotationAngle = useTrueNorth ? 0 : declination;

  // 市区町村ごとの集計データ (広域表示用)
  const municipalityData = useMemo(() => {
    if (!showHeatmap && zoom >= 10) return [];

    const groups: Record<
      string,
      {
        name: string;
        latSum: number;
        lonSum: number;
        count: number;
        scoreSum: number;
        properties: ScoredProperty[];
      }
    > = {};

    properties.forEach((p) => {
      if (!p.lat || !p.lon) return;
      const muni = getMunicipality(p.address);
      if (!groups[muni]) {
        groups[muni] = {
          name: muni,
          latSum: 0,
          lonSum: 0,
          count: 0,
          scoreSum: 0,
          properties: [],
        };
      }
      groups[muni].latSum += p.lat;
      groups[muni].lonSum += p.lon;
      groups[muni].count += 1;
      groups[muni].scoreSum += p.arbitrageScore;
      groups[muni].properties.push(p);
    });

    return Object.values(groups).map((g) => ({
      name: g.name,
      lat: g.latSum / g.count,
      lon: g.lonSum / g.count,
      count: g.count,
      avgScore: g.scoreSum / g.count,
      properties: g.properties,
    }));
  }, [properties, zoom]);

  const maxPrefOrBubbleCount = useMemo(() => {
    let max = 0;
    if (zoom < 10) {
      Object.values(prefCounts).forEach((c) => {
        if (c > max) max = c;
      });
    } else {
      municipalityData.forEach((m) => {
        if (m.count > max) max = m.count;
      });
    }
    return Math.max(max, 20); // Minimum scale denominator of 20
  }, [prefCounts, municipalityData, zoom]);

  const getDensityColor = useCallback(
    (count: number) => {
      if (count === 0) return "#818cf8"; // Purple/Indigo
      const ratio = Math.min(1, count / maxPrefOrBubbleCount);
      // Gradient: Purple (260) -> Blue -> Teal -> Green -> Yellow -> Red (0)
      const hue = (1 - ratio) * 260;
      return `hsl(${hue}, 90%, 60%)`;
    },
    [maxPrefOrBubbleCount],
  );

  const clusters = useMemo(() => {
    // Only cluster when visibleCount <= 100 AND list view is not fully expanded AND zoom is moderate
    if (visibleCount > 100 || showListView || zoom >= 15) return [];

    const grouped: {
      latSum: number;
      lonSum: number;
      properties: ScoredProperty[];
    }[] = [];

    // Distance threshold in degrees based on zoom level
    const distThreshold = Math.max(0.0015, 0.04 / Math.pow(2, zoom - 10));

    properties.forEach((p) => {
      if (p.lat === null || p.lon === null) return;

      if (currentBounds) {
        if (
          p.lat < currentBounds.minLat ||
          p.lat > currentBounds.maxLat ||
          p.lon < currentBounds.minLon ||
          p.lon > currentBounds.maxLon
        ) {
          return;
        }
      }

      let merged = false;
      for (const group of grouped) {
        const avgLat = group.latSum / group.properties.length;
        const avgLon = group.lonSum / group.properties.length;

        const dLat = Math.abs(avgLat - p.lat);
        const dLon = Math.abs(avgLon - p.lon);
        if (dLat < distThreshold && dLon < distThreshold) {
          group.properties.push(p);
          group.latSum += p.lat;
          group.lonSum += p.lon;
          merged = true;
          break;
        }
      }

      if (!merged) {
        grouped.push({
          latSum: p.lat,
          lonSum: p.lon,
          properties: [p],
        });
      }
    });

    return grouped.map((g) => ({
      lat: g.latSum / g.properties.length,
      lon: g.lonSum / g.properties.length,
      count: g.properties.length,
      properties: g.properties,
    }));
  }, [properties, currentBounds, zoom, visibleCount, showListView]);

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
      { dir: "NW", deg: 315 },
    ];

    // Determine status of each direction from properties in that direction
    return dirMap.map((d) => {
      // Find properties in this direction to extract their status (optimal, safe, noise)
      const propsInDir = properties.filter((p) => p.direction === d.dir);
      let status = "SAFE";
      if (propsInDir.length > 0) {
        // Find the most common status or use first one
        const optimalCount = propsInDir.filter((p) =>
          p.astrologyStatus.includes("OPTIMAL"),
        ).length;
        const noiseCount = propsInDir.filter((p) =>
          p.astrologyStatus.includes("NOISE"),
        ).length;
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
    return sectors.map((d) => {
      const { color, opacity, dashArray } = getStyleForVector(d.status);
      const baseBearing = rotationAngle + d.deg;

      // Draw wedge shape polygon extending 30km
      const points: [number, number][] = [[baseLat, baseLon]];
      const isCorner = ["NE", "SE", "SW", "NW"].includes(d.dir);
      const halfWidth = useClassical ? (isCorner ? 30 : 15) : 22.5;

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
              dashArray: dashArray,
            }}
            interactive={false}
          />
          <Marker
            position={labelPos}
            icon={L.divIcon({
              className: "custom-div-icon",
              html: `<div class="px-1.5 py-0.5 rounded bg-white/80 border border-stone-200 text-[9px] font-bold text-center pointer-events-none" style="color: ${color}; text-shadow: 0 0 2px rgba(0,0,0,0.8); white-space: nowrap;">
                ${d.dir} (${getStatusText(d.status)})
              </div>`,
              iconSize: [60, 20],
              iconAnchor: [30, 10],
            })}
            interactive={false}
          />
        </React.Fragment>
      );
    });
  }, [
    sectors,
    center,
    baseLat,
    baseLon,
    rotationAngle,
    getStyleForVector,
    useClassical,
  ]);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-stone-100 flex items-center justify-center font-mono text-xs text-stone-500">
        [ 地図エンジンの初期化中... ]
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-stone-200">
      <MapContainer
        center={center}
        zoom={zoom}
        maxZoom={20}
        style={{ height: "100%", width: "100%", background: "#0c0c0e" }}
        zoomControl={false}
      >
        <BoundsListener onBoundsChange={handleBoundsChange} />
        <MapClickHandler onCopy={copyCoordinates} />
        <SyncMapCenter lat={center[0]} lon={center[1]} />
        <InvalidateMapSize />
        <AutoFitBounds
          properties={properties}
          center={center}
          prefecture={prefecture}
        />

        {/* OpenStreetMap / CartoDB Tiles (Theme Switchable) */}
        <TileLayer
          key={`tile-layer-${mapTheme}`}
          url={
            mapTheme === "dark"
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={20}
          maxNativeZoom={19}
        />

        {/* Theme Switcher Button */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto">
          <button
            onClick={() => {
              const nextTheme = mapTheme === "dark" ? "light" : "dark";
              setMapTheme(nextTheme);
              localStorage.setItem("map_theme", nextTheme);
              window.dispatchEvent(new Event("mapThemeChanged"));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[9px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
          >
            {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
          </button>
        </div>

        {/* Base Location Marker (Glowing Center) */}
        {zoom >= 10 && (
          <Marker position={[baseLat, baseLon]}>
            <Popup>
              <div className="font-sans text-xs text-gray-900 p-1">
                <div className="font-bold text-indigo-600">
                  現在地・スキャン起点
                </div>
                <div
                  className="text-[10px] text-stone-400 mt-1 cursor-pointer hover:bg-zinc-100 p-1 rounded-md border border-transparent hover:border-zinc-200 transition-all group flex items-center justify-between"
                  onClick={() => copyCoordinates(baseLat, baseLon, "起点")}
                  title="クリックで座標をコピー"
                >
                  <div>
                    経度: {baseLon.toFixed(5)} <br />
                    緯度: {baseLat.toFixed(5)}
                  </div>
                  <Copy className="w-3 h-3 text-stone-600 group-hover:text-stone-400 ml-2" />
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Pulsing ring around center (matching scan radius) */}
        {zoom >= 10 && radiusKm && radiusKm !== "all" && (
          <Circle
            center={[baseLat, baseLon]}
            radius={Number(radiusKm) * 1000}
            pathOptions={{
              color: "#10b981",
              fillColor: "#10b981",
              fillOpacity: 0.03,
              weight: 1.5,
              dashArray: "4,8",
            }}
          />
        )}

        {/* 都道府県ポリゴン (zoom < 10) */}
        {zoom < 10 && geoData && (
          <GeoJSON
            data={geoData}
            style={(feature) => {
              const prefName = feature?.properties?.name || "";
              const count = prefCounts[prefName] || 0;
              const color = getDensityColor(count);
              return {
                fillColor: color,
                fillOpacity: count > 0 ? 0.65 : 0.1,
                color: "#1e293b",
                weight: 1.2,
                opacity: 0.6,
              };
            }}
            onEachFeature={(feature, layer) => {
              const prefName = feature?.properties?.name || "";
              const count = prefCounts[prefName] || 0;
              layer.bindPopup(
                `<div class="font-sans text-xs text-gray-900 p-2 min-w-[120px]">
                  <div class="font-bold text-sm border-b border-gray-100 pb-1 mb-1.5">${prefName}</div>
                  <div>スキャン物件数: <b class="text-indigo-600 text-sm">${count.toLocaleString()}</b> 件</div>
                  <div class="text-[9px] text-stone-500 mt-1.5">※ズームインするとより詳細な情報が表示されます</div>
                </div>`,
              );
            }}
          />
        )}

        {/* Direction Sectors - Only shown when zoom >= 10 and we are showing individual pins */}
        {zoom >= 10 &&
          (visibleCount > 100 || zoom >= 15 || showListView) &&
          !showHeatmap &&
          sectorLayers}

        {/* Viewport content based on Zoom and Heatmap/Cluster/Pin State */}
        {zoom >= 10 &&
          (showHeatmap && visibleCount > 100
            ? // 1. 広域表示：市区町村バブル (温度計と連動)
              municipalityData.map((muni) => {
                const color = getDensityColor(muni.count);
                const coreRadius = Math.max(
                  8,
                  Math.min(25, 6 + Math.log2(muni.count) * 3),
                );
                const glowRadius = coreRadius * 2.2;
                const hasGlow = muni.count > 10;

                return (
                  <React.Fragment key={`muni-${muni.name}`}>
                    {hasGlow && (
                      <CircleMarker
                        center={[muni.lat, muni.lon]}
                        radius={glowRadius}
                        pathOptions={{
                          stroke: false,
                          fillColor: color,
                          fillOpacity: 0.18,
                        }}
                        interactive={false}
                      />
                    )}
                    <CircleMarker
                      center={[muni.lat, muni.lon]}
                      radius={coreRadius}
                      pathOptions={{
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8,
                        weight: 2.5,
                        opacity: 0.6,
                      }}
                    >
                      <Popup>
                        <div className="font-sans text-xs text-gray-900 p-2 min-w-[150px]">
                          <div className="font-bold text-sm text-gray-900 leading-tight border-b border-gray-100 pb-1 mb-1.5">
                            {muni.name}
                          </div>
                          <div className="space-y-1 text-stone-400">
                            <div className="flex justify-between">
                              <span>検出物件数:</span>
                              <span className="font-bold text-gray-900">
                                {muni.count}件
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>平均推奨度:</span>
                              <span className="font-bold text-emerald-600">
                                {muni.avgScore.toFixed(1)}点
                              </span>
                            </div>
                          </div>
                          <div className="text-[9px] text-stone-500 mt-2 text-center">
                            ※ズームインすると詳細物件ピンが表示されます
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  </React.Fragment>
                );
              })
            : visibleCount <= 100 && !showListView && zoom < 15
              ? // 2. 100件以下で、かつ一覧ボタンが押されていない状態：物理距離クラスター（白丸バッジ）
                clusters.map((cluster, idx) => {
                  return (
                    <Marker
                      key={`cluster-${idx}`}
                      position={[cluster.lat, cluster.lon]}
                      icon={L.divIcon({
                        className: "custom-cluster-icon",
                        html: `<div class="w-8 h-8 rounded-full bg-white border-2 border-indigo-500 shadow-[0_2.5px_8px_rgba(79,70,229,0.35)] text-indigo-600 font-extrabold text-xs flex items-center justify-center transition-transform hover:scale-105 pointer-events-auto">
                      ${cluster.count}
                    </div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                      })}
                      eventHandlers={{
                        click: (e) => {
                          const map = e.target._map;
                          map.setView(
                            [cluster.lat, cluster.lon],
                            Math.min(16, map.getZoom() + 2),
                          );
                        },
                      }}
                    />
                  );
                })
              : // 3. 詳細表示：個別物件ピン
                (() => {
                  const sortedProperties = [...properties].sort((a, b) => {
                    const getPriority = (p: any) => {
                      const targetDay = p.dateScores?.[3];
                      const isUltra = targetDay?.isUltraLucky;
                      const isHeavyBad = [
                        "NOISE_GOU",
                        "NOISE_ANKEN",
                        "NOISE_HA",
                        "NOISE_HONMEI",
                        "NOISE_TEKI",
                      ].includes(p.astrologyStatus);
                      if (isUltra || isHeavyBad) return 3;

                      const details = targetDay?.scoreDetails;
                      const hasLightBad =
                        (details &&
                          (details.doyouPenalty < 0 ||
                            details.voidPenalty < 0)) ||
                        [
                          "NOISE_VOID",
                          "NOISE_NODE",
                          "NOISE_GETSUMEI",
                          "NOISE_GETSUTEKI",
                        ].includes(p.astrologyStatus);
                      const hasLucky =
                        p.isTendo ||
                        ["OPTIMAL", "SAFE"].includes(p.astrologyStatus) ||
                        p.astroFlags?.some((f: string) => f.endsWith("_LINE"));

                      if (hasLucky && !hasLightBad) return 2;
                      return 1;
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
                          weight: isTodayUltra ? 2.5 : 1.5,
                        }}
                        className={isTransitioningDate ? "animate-pulse" : ""}
                      >
                        <Popup className="arbitrage-property-popup">
                          <div className="font-sans text-xs text-gray-900 p-2 min-w-[220px] max-w-[280px]">
                            <div
                              className={`font-bold text-xs leading-tight p-2 -mx-2 -mt-2 rounded-t-lg border-b ${pinColors.bgClass} ${pinColors.textClass} flex justify-between items-center`}
                            >
                              <span className="line-clamp-1">
                                {prop.property_name}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/70 dark:bg-stone-200/70 font-bold shrink-0 ml-1">
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

                            <div className="mt-2.5 border-t border-gray-100 pt-2 space-y-1 text-stone-400 text-[11px]">
                              <div className="flex justify-between">
                                <span>総賃料:</span>
                                <span className="font-bold text-gray-900">
                                  {prop.totalRent
                                    ? `${(prop.totalRent / 10000).toFixed(1)}万円`
                                    : "不明"}
                                  {prop.management_fee
                                    ? ` (管:${(prop.management_fee / 1000).toFixed(0)}k)`
                                    : ""}
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
                                  築{prop.building_age || 0}年 /{" "}
                                  {prop.minutes_to_station || "不明"}分
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>方位・吉凶:</span>
                                <span
                                  className={`font-semibold ${pinColors.textClass}`}
                                >
                                  {prop.direction
                                    ? `${prop.direction} (${prop.maxAstroFactor})`
                                    : "不明"}
                                </span>
                              </div>
                              <div
                                className="flex justify-between items-center mt-1 cursor-pointer hover:bg-gray-100 p-0.5 rounded transition-colors group"
                                onClick={() =>
                                  copyCoordinates(
                                    prop.lat!,
                                    prop.lon!,
                                    prop.property_name,
                                  )
                                }
                                title="クリックで座標をコピー"
                              >
                                <span>緯度経度:</span>
                                <span className="font-mono text-[9px] text-stone-500 flex items-center gap-1 group-hover:text-stone-400">
                                  {prop.lat!.toFixed(5)}, {prop.lon!.toFixed(5)}
                                  <Copy className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 bg-gray-50 rounded-lg p-2 flex justify-between items-center text-[10px] border border-gray-100">
                              <div>
                                <div className="text-stone-500">
                                  利回り偏差値
                                </div>
                                <div className="font-mono font-bold text-indigo-600 text-xs">
                                  {prop.yieldScore.toFixed(1)}
                                </div>
                              </div>
                              <div className="text-right border-l border-gray-200 pl-2">
                                <div className="text-stone-400 font-medium">
                                  おすすめ度
                                </div>
                                <div className="flex gap-0.5 text-amber-600 mt-0.5">
                                  {(() => {
                                    const starCount =
                                      getRecommendationStarCount(
                                        prop.totalScore,
                                        prop.astrologyStatus,
                                      );
                                    return Array.from({ length: 5 }).map(
                                      (_, i) => (
                                        <span
                                          key={i}
                                          className={
                                            i < starCount
                                              ? "opacity-100 text-amber-600"
                                              : "opacity-20 text-stone-400"
                                          }
                                        >
                                          ★
                                        </span>
                                      ),
                                    );
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
                                className="mt-3 block w-full py-1.5 text-center text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-stone-900 rounded-lg transition-colors shadow-sm"
                              >
                                詳細サイトを開く ↗
                              </a>
                            )}
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  });
                })())}
      </MapContainer>

      {/* Thermometer Legend Overlay (Top Left) */}
      <div className="absolute top-4 left-4 bg-white/80 text-stone-900 px-3 py-3.5 rounded-2xl shadow-xl border border-stone-200 backdrop-blur text-[10px] pointer-events-auto z-[1000] flex flex-col gap-1.5 w-18 items-center">
        <div className="font-bold text-[9px] text-stone-600 tracking-tight text-center pb-0.5 border-b border-stone-200 w-full">
          件数
        </div>
        <div className="flex items-stretch h-36 gap-2 w-full justify-center pt-1">
          <div className="w-2.5 rounded-full bg-gradient-to-t from-[#818cf8] via-[#10b981] via-[#fbbf24] to-[#ef4444] border border-stone-200" />
          <div className="flex flex-col justify-between text-[7.5px] font-mono text-stone-500 select-none">
            <span>{maxPrefOrBubbleCount.toLocaleString()}</span>
            <span>
              {Math.round(maxPrefOrBubbleCount * 0.75).toLocaleString()}
            </span>
            <span>
              {Math.round(maxPrefOrBubbleCount * 0.5).toLocaleString()}
            </span>
            <span>
              {Math.round(maxPrefOrBubbleCount * 0.25).toLocaleString()}
            </span>
            <span>0</span>
          </div>
        </div>
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 right-4 bg-white/80 text-stone-900 px-3.5 py-3 rounded-xl shadow-lg border border-stone-200 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-2">
        <div className="font-bold border-b border-stone-200 pb-1 mb-0.5 text-stone-600">
          アストロ吉凶（凡例）
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5 col-span-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] border border-[#b45309] shadow-[0_0_8px_rgba(251,191,36,0.6)]"></span>
            <span className="font-bold text-amber-600">
              超大吉 (木星ライン特選)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] border border-[#b45309]"></span>
            <span>超吉 (最上吉)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] border border-[#065f46]"></span>
            <span>吉 (相性抜群)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] border border-[#7c2d12]"></span>
            <span>警告・調整方位</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] border border-[#78350f]"></span>
            <span>注意 (軽い凶)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-[#7f1d1d]"></span>
            <span>大凶 (大凶方位)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#475569] border border-[#1e293b]"></span>
            <span>通常 (吉凶なし)</span>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="absolute top-20 left-1/2 z-[2000]"
          >
            <div className="bg-white/80 text-stone-800 px-4 py-2 rounded-full border border-stone-300 shadow-2xl flex items-center gap-2 backdrop-blur-md">
              {toast.type === "success" ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4 text-indigo-600" />
              )}
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {toast.message}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

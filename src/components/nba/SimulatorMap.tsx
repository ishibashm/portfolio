"use client";

import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import "leaflet/dist/leaflet.css";
import { CurrentLocationControl } from "@/components/map/CurrentLocationControl";
import { useMapTheme } from "@/lib/useMapTheme";
import { StandardBaseTile } from "@/components/map/StandardBaseTile";

// Fix Leaflet marker icons in Next.js
applyLeafletDefaultIcon();

// Custom Icons for Source and Step coordinates
const startIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const stepIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const activeStepIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Component to dynamically fit bounds of the map to display all markers in the chain
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [positions, map]);
  return null;
}

interface SimulatorStep {
  fromName: string;
  fromLat: number;
  fromLon: number;
  toName: string;
  toLat: number;
  toLon: number;
  departureDate: string;
  purpose: "MIGRATION" | "TRAVEL";
  notes: string | null;
  evaluation?: {
    status: string;
    rating: string;
    color: string;
  };
}

interface SimulatorMapProps {
  startLat: number;
  startLon: number;
  steps: SimulatorStep[];
  activeStepIndex: number | null;
  onStartLocationChange: (lat: number, lon: number, name?: string) => void;
  onStepDestinationChange: (
    index: number,
    lat: number,
    lon: number,
    name?: string,
  ) => void;
  detourPolygons: [number, number][][]; // Polygons representing detour zones
}

export default function SimulatorMap({
  startLat,
  startLon,
  steps,
  activeStepIndex,
  onStartLocationChange,
  onStepDestinationChange,
  detourPolygons,
}: SimulatorMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const { mapTheme, toggleMapTheme } = useMapTheme();

  /* 明暗の読み出しと購読は useMapTheme に寄せた（5 か所に同じ 15 行が
     写されていた）。ここに残るのは「描画に入ったか」だけ。 */
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const startPos: [number, number] = useMemo(
    () => [
      isNaN(startLat) || startLat === null || startLat === undefined ? 35.6895 : (startLat || 35.6895),
      isNaN(startLon) || startLon === null || startLon === undefined ? 139.6917 : (startLon || 139.6917),
    ],
    [startLat, startLon],
  );

  // Combine starting position and all destination positions for boundary fitting
  const allPositions: [number, number][] = useMemo(() => {
    const list: [number, number][] = [startPos];
    steps.forEach((s) => {
      if (
        s.toLat !== undefined && s.toLon !== undefined &&
        s.toLat !== null && s.toLon !== null &&
        !isNaN(s.toLat) && !isNaN(s.toLon)
      ) {
        list.push([s.toLat, s.toLon]);
      }
    });
    return list;
  }, [startPos, steps]);

  const handleGeocodeSearch = async (query: string) => {
    if (!query) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        // If active step is selected, update that step's destination. Otherwise, update start position.
        if (activeStepIndex !== null && activeStepIndex >= 0) {
          onStepDestinationChange(
            activeStepIndex,
            data.lat,
            data.lon,
            data.name,
          );
        } else {
          onStartLocationChange(data.lat, data.lon, data.name);
        }
      } else {
        alert("指定された地名が見つかりませんでした。");
      }
    } catch (e) {
      console.error("Geocoding failed:", e);
      alert("地名検索中にエラーが発生しました。");
    } finally {
      setIsSearching(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="w-full h-full min-h-[400px] bg-white/80 border border-stone-200 rounded-3xl flex items-center justify-center font-mono text-xs text-stone-600 backdrop-blur-md">
        [ LOADING SIMULATOR MAP ENGINE... ]
      </div>
    );
  }

  /*
    isolate を外さないこと。`relative` は z-index が auto なので重ね合わせ
    文脈を作らず、Leaflet の枠（.leaflet-pane 400・コントロール 1000）と
    この器に重ねている札（z-[1000]）が頁全体まですり抜ける。メニューは
    z-[46] なので地図が前に出て、開いたメニューを覆う（#694 の Android 報告）。
  */
  return (
    <div className="isolate w-full h-full min-h-[400px] flex flex-col gap-4 relative">
      {/* Geocoding search HUD overlay */}
      <div className="absolute top-4 left-4 right-4 z-[1000] max-w-md pointer-events-auto">
        <div className="relative shadow-2xl">
          <input
            type="text"
            placeholder={
              activeStepIndex !== null
                ? `ステップ ${activeStepIndex + 1} の目的地を検索...`
                : "スタート地（初期拠点）を検索..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              (e.preventDefault(), handleGeocodeSearch(searchQuery))
            }
            className="w-full pl-9 pr-20 py-2.5 bg-white/70 border border-stone-200 rounded-2xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-200 transition-all backdrop-blur-md"
          />
          <span className="w-4 h-4 text-stone-600 absolute left-3 top-3.5 flex items-center justify-center">
            🔍
          </span>
          <button
            type="button"
            onClick={() => handleGeocodeSearch(searchQuery)}
            disabled={isSearching}
            className="absolute right-2 top-2 px-3 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-200 active:scale-95 transition-all"
          >
            {isSearching ? "検索中..." : "検索"}
          </button>
        </div>
      </div>

      <div className="w-full flex-1 min-h-[400px] border border-stone-200 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
        <MapContainer
          key="relocation-simulator-leaflet"
          center={startPos}
          zoom={6}
          maxZoom={20}
          style={{
            height: "100%",
            width: "100%",
            background: "#09090b",
            zIndex: 0,
          }}
        >
          <StandardBaseTile />

          {/* Fit map view dynamically */}
          <FitBounds positions={allPositions} />
          {/* 現在地。地点をドラッグで置くときの目印になる。
              表示だけで、判定には入らない。 */}
          <CurrentLocationControl corner="bottomright" />

          {/* Start Location Marker (Gold) */}
          <Marker
            position={startPos}
            icon={startIcon}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const position = e.target.getLatLng();
                onStartLocationChange(position.lat, position.lng);
              },
            }}
          />

          {/* Render Step Destination Markers */}
          {steps.map((step, idx) => {
            if (
              step.toLat === undefined ||
              step.toLon === undefined ||
              step.toLat === null ||
              step.toLon === null ||
              isNaN(step.toLat) ||
              isNaN(step.toLon)
            ) {
              return null;
            }
            const isSelected = activeStepIndex === idx;
            const pos: [number, number] = [step.toLat, step.toLon];
            return (
              <Marker
                key={idx}
                position={pos}
                icon={isSelected ? activeStepIcon : stepIcon}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const position = e.target.getLatLng();
                    onStepDestinationChange(idx, position.lat, position.lng);
                  },
                }}
              />
            );
          })}

          {/* Render Connecting Polyline Vectors */}
          {steps.map((step, idx) => {
            const prevPos: [number, number] =
              idx === 0
                ? startPos
                : [steps[idx - 1].toLat, steps[idx - 1].toLon];
            const currentPos: [number, number] = [step.toLat, step.toLon];

            if (
              isNaN(prevPos[0]) || isNaN(prevPos[1]) ||
              isNaN(currentPos[0]) || isNaN(currentPos[1]) ||
              prevPos[0] === undefined || prevPos[1] === undefined ||
              currentPos[0] === undefined || currentPos[1] === undefined ||
              prevPos[0] === null || prevPos[1] === null ||
              currentPos[0] === null || currentPos[1] === null
            ) {
              return null;
            }

            const rating = step.evaluation?.rating || "普通";
            let lineColor = "#a1a1aa"; // default gray (SAFE/N/A)
            if (rating === "大吉" || rating === "吉")
              lineColor = "#10b981"; // green
            else if (rating === "凶")
              lineColor = "#f59e0b"; // orange
            else if (rating === "大凶") lineColor = "#ef4444"; // red

            return (
              <Polyline
                key={`line-${idx}`}
                positions={[prevPos, currentPos]}
                color={lineColor}
                weight={idx === activeStepIndex ? 4 : 2}
                dashArray={step.purpose === "TRAVEL" ? "5, 8" : undefined}
              />
            );
          })}

          {/* Render Kari-kippou Detour Zone Polygons */}
          {detourPolygons.map((poly, idx) => (
            <Polygon
              key={`poly-${idx}`}
              positions={poly}
              pathOptions={{
                color: "#6366f1",
                fillColor: "#818cf8",
                fillOpacity: 0.15,
                weight: 1.5,
                dashArray: "3, 6",
              }}
            />
          ))}
        </MapContainer>

        {/* Theme Switcher Button */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto">
          <button
            onClick={() => {
              toggleMapTheme();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/70 text-stone-700 border border-stone-200 hover:bg-white transition-colors shadow-lg text-[9px] font-mono font-bold cursor-pointer"
          >
            {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
          </button>
        </div>

        {/* Legend Overlay HUD */}
        <div className="absolute bottom-4 left-4 z-[1000] p-3 bg-white/70 border border-stone-200 rounded-2xl backdrop-blur-md flex flex-col gap-1.5 shadow-2xl pointer-events-none text-[9px] font-mono leading-none text-stone-500">
          <div className="flex items-center gap-2 font-bold text-amber-600">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></span>{" "}
            出発起点 (ゴールド)
          </div>
          <div className="flex items-center gap-2 font-bold text-indigo-600 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50"></span>{" "}
            経由地 (青)
          </div>
          <div className="flex items-center gap-2 font-bold text-rose-600 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50"></span>{" "}
            選択中の目的地 (赤)
          </div>
          <div className="border-t border-stone-200 my-1"></div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-emerald-500 inline-block"></span> 吉 /
            大吉 方位ベクトル
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-red-500 inline-block"></span> 凶 /
            大凶 方位ベクトル
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 bg-zinc-500 border border-dashed border-zinc-400 inline-block"></span>{" "}
            旅行（TRAVEL）ステップ
          </div>
          {detourPolygons.length > 0 && (
            <div className="flex items-center gap-2 text-indigo-600 font-bold mt-0.5">
              <span className="w-3.5 h-2.5 bg-indigo-500/20 border border-dashed border-indigo-200 inline-block"></span>{" "}
              吉方位迂回ゾーン (仮吉方領域)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

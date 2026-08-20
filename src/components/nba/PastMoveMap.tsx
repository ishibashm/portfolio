"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import "leaflet/dist/leaflet.css";
import { Search } from "lucide-react";

// Fix Leaflet marker icons in Next.js
applyLeafletDefaultIcon();

// Custom Icons for Source and Destination to differentiate them easily
const fromIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const toIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Component to dynamically fit bounds of the map to display both From and To markers
function FitBounds({
  fromPos,
  toPos,
}: {
  fromPos: [number, number];
  toPos: [number, number];
}) {
  const map = useMap();
  useEffect(() => {
    if (fromPos && toPos) {
      const bounds = L.latLngBounds([fromPos, toPos]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }, [fromPos, toPos, map]);
  return null;
}

interface PastMoveMapProps {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  onFromChange: (lat: number, lon: number, name?: string) => void;
  onToChange: (lat: number, lon: number, name?: string) => void;
}

export default function PastMoveMap({
  fromLat,
  fromLon,
  toLat,
  toLon,
  onFromChange,
  onToChange,
}: PastMoveMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [searchFromQuery, setSearchFromQuery] = useState("");
  const [searchToQuery, setSearchToQuery] = useState("");
  const [isSearchingFrom, setIsSearchingFrom] = useState(false);
  const [isSearchingTo, setIsSearchingTo] = useState(false);
  const [mapTheme, setMapTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem("map_theme") as "dark" | "light";
    if (saved) setMapTheme(saved);

    const handleThemeChange = () => {
      const current = localStorage.getItem("map_theme") as "dark" | "light";
      if (current) setMapTheme(current);
    };
    window.addEventListener("mapThemeChanged", handleThemeChange);
    return () =>
      window.removeEventListener("mapThemeChanged", handleThemeChange);
  }, []);

  const fromPos: [number, number] = useMemo(
    () => [fromLat || 35.6895, fromLon || 139.6917],
    [fromLat, fromLon],
  );
  const toPos: [number, number] = useMemo(
    () => [toLat || 35.0116, toLon || 135.7681],
    [toLat, toLon],
  );

  const handleGeocode = async (type: "from" | "to", query: string) => {
    if (!query) return;

    if (type === "from") setIsSearchingFrom(true);
    else setIsSearchingTo(true);

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);

      if (res.ok) {
        const data = await res.json();
        const lat = data.lat;
        const lon = data.lon;
        const name = data.name;

        if (type === "from") {
          onFromChange(lat, lon, name);
        } else {
          onToChange(lat, lon, name);
        }
      } else {
        alert("指定された地名が見つかりませんでした。");
      }
    } catch (e) {
      console.error("Geocoding failed:", e);
      alert("地名検索中にエラーが発生しました。再度お試しください。");
    } finally {
      if (type === "from") setIsSearchingFrom(false);
      else setIsSearchingTo(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="w-full h-[400px] bg-white/80 border border-stone-200 rounded-3xl flex items-center justify-center font-mono text-xs text-stone-600 backdrop-blur-md">
        [ LOADING INTERACTIVE MAP ENGINE... ]
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Geocoding Controls - Side by Side inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Departure Geocoding */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">
            出発地を住所/地名で検索 (Geocode)
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="例: 東京都港区麻布十番..."
              value={searchFromQuery}
              onChange={(e) => setSearchFromQuery(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                (e.preventDefault(), handleGeocode("from", searchFromQuery))
              }
              className="w-full pl-9 pr-20 py-2.5 bg-white/70 border border-indigo-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-inner"
            />
            <Search className="w-4 h-4 text-stone-600 absolute left-3 top-3.5" />
            <button
              type="button"
              onClick={() => handleGeocode("from", searchFromQuery)}
              disabled={isSearchingFrom}
              className="absolute right-2 top-2 px-3 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-200 active:scale-95 transition-all"
            >
              {isSearchingFrom ? "検索中..." : "検索"}
            </button>
          </div>
        </div>

        {/* Destination Geocoding */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-red-600 tracking-wider">
            目的地を住所/地名で検索 (Geocode)
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="例: 京都府京都市中京区..."
              value={searchToQuery}
              onChange={(e) => setSearchToQuery(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                (e.preventDefault(), handleGeocode("to", searchToQuery))
              }
              className="w-full pl-9 pr-20 py-2.5 bg-white/70 border border-red-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-red-200 focus:ring-1 focus:ring-red-500/50 transition-all shadow-inner"
            />
            <Search className="w-4 h-4 text-stone-600 absolute left-3 top-3.5" />
            <button
              type="button"
              onClick={() => handleGeocode("to", searchToQuery)}
              disabled={isSearchingTo}
              className="absolute right-2 top-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-600 text-[10px] font-bold rounded-lg border border-red-200 active:scale-95 transition-all"
            >
              {isSearchingTo ? "検索中..." : "検索"}
            </button>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="w-full h-[320px] relative border border-stone-200 rounded-3xl overflow-hidden shadow-2xl">
        <MapContainer
          key="past-moves-map-leaflet"
          center={fromPos}
          zoom={5}
          maxZoom={20}
          style={{
            height: "100%",
            width: "100%",
            background: "#09090b",
            zIndex: 0,
          }}
        >
          <TileLayer
            key={`tile-layer-${mapTheme}`}
            url={
              mapTheme === "dark"
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            }
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={20}
            maxNativeZoom={19}
          />
          {/* Fit map view to show both coordinates dynamically */}
          <FitBounds fromPos={fromPos} toPos={toPos} />

          {/* Draggable From Marker (Blue) */}
          <Marker
            position={fromPos}
            icon={fromIcon}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                onFromChange(position.lat, position.lng);
              },
            }}
          />

          {/* Draggable To Marker (Red) */}
          <Marker
            position={toPos}
            icon={toIcon}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                onToChange(position.lat, position.lng);
              },
            }}
          />

          {/* Drawing bearing line vector between From & To */}
          <Polyline
            positions={[fromPos, toPos]}
            color="#6366f1"
            weight={2}
            dashArray="5, 10"
          />
        </MapContainer>

        {/* Theme Switcher Button */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto">
          <button
            onClick={() => {
              const nextTheme = mapTheme === "dark" ? "light" : "dark";
              setMapTheme(nextTheme);
              localStorage.setItem("map_theme", nextTheme);
              window.dispatchEvent(new Event("mapThemeChanged"));
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/70 text-stone-700 border border-stone-200 hover:bg-white transition-colors shadow-lg text-[9px] font-mono font-bold cursor-pointer"
          >
            {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
          </button>
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] p-3 bg-white/70 border border-stone-200 rounded-2xl backdrop-blur-md flex flex-col gap-1 shadow-2xl pointer-events-none text-[9px] font-mono leading-none">
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span> 出発地
            (青): ドラッグして微調整
          </div>
          <div className="flex items-center gap-2 text-red-600 font-bold mt-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> 目的地
            (赤): ドラッグして微調整
          </div>
        </div>
      </div>
    </div>
  );
}

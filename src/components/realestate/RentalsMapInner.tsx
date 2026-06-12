"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Home,
  ExternalLink,
  Calendar,
  MapPin,
  Clock,
  Star,
  StarOff,
  Compass,
} from "lucide-react";
import type { RentalProperty } from "@/app/rentals/page";

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

// Custom SVG Icons for markers
const createCustomIcon = (isFavorite: boolean) => {
  const pinColor = isFavorite ? "#fbbf24" : "#10b981"; // gold vs emerald
  const glowColor = isFavorite
    ? "rgba(251, 191, 36, 0.4)"
    : "rgba(16, 185, 129, 0.4)";
  const innerSymbol = isFavorite
    ? `<polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="#000" stroke="#000" stroke-width="1" transform="scale(0.5) translate(12, 12)" />`
    : `<circle cx="12" cy="12" r="4" fill="#000" />`;

  const html = `
    <div class="relative flex items-center justify-center" style="width: 36px; height: 36px;">
      <!-- Pulse/Glow effect -->
      <div class="absolute w-8 h-8 rounded-full animate-ping opacity-25" style="background-color: ${pinColor};"></div>
      
      <!-- SVG Pin -->
      <svg width="30" height="36" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 6px ${glowColor}); z-index: 10;">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 30 12 30C12 30 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="${pinColor}" />
        <circle cx="12" cy="12" r="8" fill="#ffffff" />
        ${innerSymbol}
      </svg>
    </div>
  `;

  return L.divIcon({
    className: "custom-map-pin",
    html: html,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -32],
  });
};

// Component to handle map re-centering / flying to hovered property
function SyncHoveredProperty({
  properties,
  hoveredPropertyId,
}: {
  properties: RentalProperty[];
  hoveredPropertyId: string | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!hoveredPropertyId) return;
    const prop = properties.find((p) => p.id === hoveredPropertyId);
    if (prop && prop.lat !== null && prop.lon !== null) {
      map.flyTo([prop.lat, prop.lon], 15, { duration: 1.0 });
    }
  }, [hoveredPropertyId, properties, map]);

  return null;
}

// Component to auto-fit map bounds to show all plotted properties
function AutoFitBounds({ properties }: { properties: RentalProperty[] }) {
  const map = useMap();
  const prevPropsLength = useRef(0);

  useEffect(() => {
    // Only auto-fit if the property list changed from empty or length changed significantly
    const validProps = properties.filter(
      (p) => p.lat !== null && p.lon !== null,
    );
    if (validProps.length === 0) return;

    if (prevPropsLength.current !== validProps.length) {
      const bounds = L.latLngBounds(validProps.map((p) => [p.lat!, p.lon!]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      prevPropsLength.current = validProps.length;
    }
  }, [properties, map]);

  return null;
}

// Map Size Invalidation Helper
function InvalidateMapSize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

interface RentalsMapInnerProps {
  properties: RentalProperty[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  hoveredPropertyId: string | null;
  metaphysicalProperties?: Record<
    string,
    {
      distance: number;
      bearing: number;
      direction: string;
      rating: string;
      color: string;
      score: number;
    }
  >;
}

export default function RentalsMapInner({
  properties,
  favorites,
  onToggleFavorite,
  hoveredPropertyId,
  metaphysicalProperties,
}: RentalsMapInnerProps) {
  const [mapTheme, setMapTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    // Detect theme or sync with tailwind/site preferences
    const savedTheme = localStorage.getItem("map_theme") as "dark" | "light";
    if (savedTheme) {
      setMapTheme(savedTheme);
    }
  }, []);

  // Filter properties that have valid latitude & longitude
  const mapProperties = useMemo(() => {
    return properties.filter((p) => p.lat !== null && p.lon !== null);
  }, [properties]);

  // Compute center of map
  const defaultCenter = useMemo<[number, number]>(() => {
    if (mapProperties.length > 0) {
      const latSum = mapProperties.reduce((sum, p) => sum + p.lat!, 0);
      const lonSum = mapProperties.reduce((sum, p) => sum + p.lon!, 0);
      return [latSum / mapProperties.length, lonSum / mapProperties.length];
    }
    return [35.6895, 139.6917]; // Tokyo
  }, [mapProperties]);

  return (
    <div className="w-full h-full min-h-[450px] relative rounded-2xl overflow-hidden border border-zinc-900 shadow-2xl">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        maxZoom={19}
        style={{ height: "100%", width: "100%", background: "#0c0c0e" }}
        zoomControl={false}
      >
        <SyncHoveredProperty
          properties={properties}
          hoveredPropertyId={hoveredPropertyId}
        />
        <AutoFitBounds properties={mapProperties} />
        <InvalidateMapSize />

        {/* Tile Layers based on Theme */}
        <TileLayer
          key={`tile-layer-${mapTheme}`}
          url={
            mapTheme === "dark"
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OpenStreetMap</a>'
        />

        {/* Theme Toggler Overlay */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto">
          <button
            onClick={() => {
              const nextTheme = mapTheme === "dark" ? "light" : "dark";
              setMapTheme(nextTheme);
              localStorage.setItem("map_theme", nextTheme);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950/90 hover:bg-zinc-900 text-zinc-300 hover:text-zinc-100 font-mono text-[10px] font-bold shadow-xl active:scale-95 transition-all cursor-pointer"
          >
            {mapTheme === "dark" ? "☀️ LIGHT MAP" : "🌙 DARK MAP"}
          </button>
        </div>

        {/* Property Markers */}
        {mapProperties.map((prop) => {
          const isFav = favorites.includes(prop.id);
          const customIcon = createCustomIcon(isFav);
          const totalRent = (prop.rent || 0) + (prop.management_fee || 0);

          return (
            <Marker
              key={prop.id}
              position={[prop.lat!, prop.lon!]}
              icon={customIcon}
            >
              <Popup className="custom-leaflet-popup">
                <div className="font-sans text-xs text-zinc-100 p-2 space-y-3 min-w-[200px] bg-zinc-950 border border-zinc-850 rounded-xl">
                  {/* Property Title */}
                  <div className="space-y-1">
                    {prop.url ? (
                      <a
                        href={prop.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 leading-snug transition-colors text-sm hover:underline"
                      >
                        {prop.property_name}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="font-bold text-zinc-100 text-sm leading-snug">
                        {prop.property_name}
                      </span>
                    )}

                    {prop.area && (
                      <div className="flex items-center gap-1 text-zinc-400 text-[10px] font-mono">
                        <MapPin className="w-3 h-3 text-zinc-500" />
                        <span>{prop.area}</span>
                      </div>
                    )}
                  </div>

                  {/* Rent Summary */}
                  <div className="bg-zinc-900/60 border border-zinc-900 p-2 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-[8px] text-zinc-500 block uppercase tracking-wider">
                        月額総家賃
                      </span>
                      <span className="font-extrabold text-zinc-200 text-sm font-mono">
                        ¥{totalRent.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right text-[8px] text-zinc-500 font-mono">
                      <span>
                        家賃: ¥{prop.rent ? prop.rent.toLocaleString() : "0"}
                      </span>
                      <span className="block">
                        共益費: ¥
                        {prop.management_fee
                          ? prop.management_fee.toLocaleString()
                          : "0"}
                      </span>
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center font-mono">
                    <div className="bg-[#0b0b0d] border border-zinc-900 p-1.5 rounded-md">
                      <span className="text-[7px] text-zinc-500 block">
                        間取り
                      </span>
                      <span className="font-bold text-zinc-300">
                        {prop.layout || "-"}
                      </span>
                    </div>
                    <div className="bg-[#0b0b0d] border border-zinc-900 p-1.5 rounded-md">
                      <span className="text-[7px] text-zinc-500 block">
                        面積
                      </span>
                      <span className="font-bold text-zinc-300">
                        {prop.size_sqm ? `${prop.size_sqm}m²` : "-"}
                      </span>
                    </div>
                    <div className="bg-[#0b0b0d] border border-zinc-900 p-1.5 rounded-md">
                      <span className="text-[7px] text-zinc-500 block">
                        駅徒歩
                      </span>
                      <span className="font-bold text-zinc-300">
                        {prop.minutes_to_station !== null
                          ? `${prop.minutes_to_station}分`
                          : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Metaphysical compatibility section */}
                  {(() => {
                    const meta = metaphysicalProperties?.[prop.id];
                    if (!meta) return null;
                    return (
                      <div className="bg-purple-950/10 border border-purple-900/20 p-2 rounded-lg flex items-center justify-between text-[10px]">
                        <div className="space-y-0.5">
                          <span className="text-[7px] text-purple-400 font-mono uppercase tracking-wider block">
                            方位適合度
                          </span>
                          <span className="font-bold text-zinc-200 flex items-center gap-1 font-mono">
                            <Compass className="w-3 h-3 text-purple-400 shrink-0 animate-pulse" />
                            {meta.direction} ({meta.distance} km)
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-1 rounded text-[8px] font-bold ${meta.color}`}
                          >
                            {meta.rating}
                          </span>
                          <a
                            href={`/relocation/simulator?toLat=${prop.lat}&toLon=${prop.lon}&toName=${encodeURIComponent(prop.property_name)}`}
                            className="text-[8px] text-purple-400 hover:text-purple-300 font-bold hover:underline flex items-center gap-0.5"
                          >
                            シミュレート
                            <ExternalLink className="w-2 h-2" />
                          </a>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Footer Info */}
                  <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono border-t border-zinc-900 pt-2">
                    <span>
                      築年数:{" "}
                      {prop.building_age !== null
                        ? `${prop.building_age}年`
                        : "不明"}
                    </span>
                    <span>{prop.is_new_build ? "新築" : ""}</span>
                  </div>

                  {/* Star Toggle Button */}
                  <button
                    onClick={() => onToggleFavorite(prop.id)}
                    className={`w-full py-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isFav
                        ? "bg-amber-950/20 text-amber-400 border-amber-500/30 hover:bg-amber-950/40"
                        : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    {isFav ? (
                      <>
                        <StarOff className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                        お気に入り解除
                      </>
                    ) : (
                      <>
                        <Star className="w-3.5 h-3.5 text-zinc-400" />
                        お気に入り登録
                      </>
                    )}
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

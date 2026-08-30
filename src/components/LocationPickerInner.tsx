"use client";

import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import { BASE_MAPS, DARK_TILE_CLASS } from "@/lib/baseMapLayers";
import "leaflet/dist/leaflet.css";
import { CurrentLocationControl } from "@/components/map/CurrentLocationControl";
import { useMapTheme } from "@/lib/useMapTheme";

// Fix typical Leaflet icon issue
applyLeafletDefaultIcon();

function MapEvents({
  onSelect,
}: {
  onSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function SyncMapCenter({ markerPos }: { markerPos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (markerPos) {
      map.setView(markerPos, map.getZoom() < 6 ? 6 : map.getZoom());
    }
  }, [markerPos, map]);
  return null;
}

interface LocationPickerInnerProps {
  initialLat: number;
  initialLon: number;
  onSelect: (lat: number, lng: number) => void;
}

export default function LocationPickerInner({
  initialLat,
  initialLon,
  onSelect,
}: LocationPickerInnerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    initialLat !== 0 || initialLon !== 0 ? [initialLat, initialLon] : null,
  );
  const { mapTheme, toggleMapTheme } = useMapTheme();

  /* 明暗の読み出しと購読は useMapTheme に寄せた（5 か所に同じ 15 行が
     写されていた）。ここに残るのは「描画に入ったか」だけ。 */
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSelect = (lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    onSelect(lat, lng);
  };

  if (!isMounted) {
    return (
      <div className="w-full h-full bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-600">
        [ LOADING MAP ENGINE... ]
      </div>
    );
  }

  const initialCenter = markerPos || [35.6812, 139.7671];
  const initialZoom = markerPos ? 6 : 4;

  /*
    isolate を外さないこと。`relative` は z-index が auto なので重ね合わせ
    文脈を作らず、Leaflet の枠（.leaflet-pane 400・コントロール 1000）と
    この器に重ねている札（z-[1000]）が頁全体まですり抜ける。メニューは
    z-[46] なので地図が前に出て、開いたメニューを覆う（#694 の Android 報告）。
  */
  return (
    <div className="isolate w-full h-full relative border border-stone-300 rounded overflow-hidden">
      <MapContainer
        key="location-picker-map"
        center={initialCenter}
        zoom={initialZoom}
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
          url={BASE_MAPS.std.url}
          /* ダークは CSS の反転で作る。CARTO の dark_all は鍵なしの
             ラスタ配信に「API key required」の透かしが入るようになった
             （lib/baseMapLayers の経緯を見ること）。 */
          className={mapTheme === "dark" ? DARK_TILE_CLASS : undefined}
          attribution={BASE_MAPS.std.attribution}
          maxZoom={BASE_MAPS.std.maxZoom}
          maxNativeZoom={BASE_MAPS.std.maxNativeZoom}
        />
        <SyncMapCenter markerPos={markerPos} />
        <MapEvents onSelect={handleSelect} />
        {/* 現在地。**自動では座標を入れない。**入れてしまうと、測位の
            たびに利用者が選んだ地点が上書きされる。今どこに居るかを
            見て、そこを地図で指してもらう。 */}
        <CurrentLocationControl corner="bottomright" />
        {markerPos && <Marker position={markerPos} />}
      </MapContainer>
      <div className="absolute top-2 left-2 z-[1000] pointer-events-none p-1 bg-white/70 border border-stone-200 text-[9px] font-mono text-emerald-600 backdrop-blur-sm">
        [CLICK ON MAP TO SET TARGET]
      </div>
      <div className="absolute top-2 right-2 z-[1000] pointer-events-auto">
        <button
          onClick={() => {
            toggleMapTheme();
          }}
          className="flex items-center gap-1 px-1.5 py-1 rounded bg-white/70 text-stone-600 border border-stone-200 hover:bg-white transition-colors shadow-lg text-[9px] font-mono font-bold cursor-pointer"
        >
          {mapTheme === "dark" ? "☀️ ライト" : "🌙 ダーク"}
        </button>
      </div>
    </div>
  );
}

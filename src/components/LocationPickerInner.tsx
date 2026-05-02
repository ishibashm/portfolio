"use client";

import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix typical Leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapEvents({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
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

export default function LocationPickerInner({ initialLat, initialLon, onSelect }: LocationPickerInnerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    (initialLat !== 0 || initialLon !== 0) ? [initialLat, initialLon] : null
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSelect = (lat: number, lng: number) => {
    setMarkerPos([lat, lng]);
    onSelect(lat, lng);
  };

  if (!isMounted) {
    return (
      <div className="w-full h-full bg-zinc-950 border border-zinc-800 flex items-center justify-center font-mono text-xs text-zinc-600">
        [ LOADING MAP ENGINE... ]
      </div>
    );
  }

  const initialCenter = markerPos || [35.6812, 139.7671];
  const initialZoom = markerPos ? 6 : 4;

  return (
    <div className="w-full h-full relative border border-zinc-700 rounded overflow-hidden">
      <MapContainer 
        key="location-picker-map"
        center={initialCenter} 
        zoom={initialZoom} 
        style={{ height: '100%', width: '100%', background: '#09090b', zIndex: 0 }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <SyncMapCenter markerPos={markerPos} />
        <MapEvents onSelect={handleSelect} />
        {markerPos && <Marker position={markerPos} />}
      </MapContainer>
      <div className="absolute top-2 left-2 z-[1000] pointer-events-none p-1 bg-black/70 border border-zinc-800 text-[9px] font-mono text-emerald-400 backdrop-blur-sm">
        [CLICK ON MAP TO SET TARGET]
      </div>
    </div>
  );
}

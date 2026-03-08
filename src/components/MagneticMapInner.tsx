"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Circle, useMap } from "react-leaflet";
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

function Recenter({ lat, lon }: { lat: number, lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);

  return null;
}

export default function MagneticMapInner({ lat, lon, declination }: MapInnerProps) {
  const [isMounted, setIsMounted] = React.useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const center: [number, number] = [lat, lon];
  
  // Calculate bearings based on TRUE NORTH (0) + Magnetic Declination
  // e.g., if declination is -7.5 (West), magnetic north is at azimuth 352.5 degrees (true).
  // Thus to draw a line pointing Magnetic North, bearing = declination. (Leaflet uses True North 0).
  
  const magNorthBearing = declination;
  
  // Draw Safe Zones (e.g. SouthEast from Magnetic North)
  // East = 90 + declination, SouthEast = 135 + declination
  // Safe zone = +/- 10 degrees from the center line
  
  // We return the safe zone to +/- 10 degrees from center line
  const createSector = (baseBearing: number, radiusKm: number, color: string) => {
    const pCenter = center;
    const pLeft = getDestination(lat, lon, baseBearing - 10, radiusKm);
    const pRight = getDestination(lat, lon, baseBearing + 10, radiusKm);
    return (
      <Polygon 
        positions={[pCenter, pLeft, pRight]} 
        color={color} 
        fillColor={color} 
        fillOpacity={0.2} 
        weight={1} 
      />
    );
  };

  const createRedZone = (baseBearing: number, radiusKm: number) => {
      // Border zones are 15 degrees around the 45 degree boundary lines (22.5 from center)
      // Actually Boundaries are at 22.5, 67.5, 112.5 etc.
      // E.g., boundary between E and SE is 112.5. We make it +/- 7.5 deg.
      const pCenter = center;
      const pLeft = getDestination(lat, lon, baseBearing - 7.5, radiusKm);
      const pRight = getDestination(lat, lon, baseBearing + 7.5, radiusKm);
      return (
        <Polygon 
          positions={[pCenter, pLeft, pRight]} 
          color="#ef4444" 
          fillColor="#ef4444" 
          fillOpacity={0.4} 
          weight={0} 
          dashArray="4"
        />
      );
  }

  // Focus: East (90), SE (135), South (180). We draw green zones for SE and NE for example.
  // We'll draw all 8 directions just as a base wireframe, highlight SE and NE as green safe zones.
  const directions = [
    { name: 'N', deg: 0 }, { name: 'NE', deg: 45 }, { name: 'E', deg: 90 },
    { name: 'SE', deg: 135 }, { name: 'S', deg: 180 }, { name: 'SW', deg: 225 },
    { name: 'W', deg: 270 }, { name: 'NW', deg: 315 }
  ];

  // Boundaries at exactly exactly 22.5 offset from 0, 45, 90 etc.
  const boundaries = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

  // We'll mark 4 main safe zones (N, E, S, W) optionally, but let's highlight NE, SE, NW, SW as green spaces.
  const safeZones = [45, 135, 225, 315];

  // Concentric Rings for Shield Attenuation Theory (in meters)
  const attenuationRings: number[] = [100000, 500000, 1000000, 2500000, 5000000]; // 100km, 500km, 1000km, 2500km, 5000km

  return (
    <div className="w-full h-full relative rounded-sm overflow-hidden border border-zinc-800/80 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
      {isMounted && (
        <MapContainer center={center} zoom={13} className="w-full h-full bg-zinc-950" zoomControl={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <Recenter lat={lat} lon={lon} />
        
        <Marker position={center} />
        
        {/* Draw True North Line (Geographic) */}
        <Polyline 
           positions={[center, getDestination(lat, lon, 0, 5000)]} 
           color="#10b981" 
           weight={3} 
           dashArray="10,10" 
           opacity={0.8}
        />

        {/* Draw Magnetic North Line */}
        <Polyline 
          positions={[center, getDestination(lat, lon, magNorthBearing, 5000)]} 
          color="#3b82f6" 
          weight={4} 
        />

        {/* Draw Safe Zones (Green) - Broadened to +/- 15 deg */}
        {safeZones.map(b => (
           <React.Fragment key={`safe-${b}`}>
              {createSector(magNorthBearing + b, 5000, "#10b981")}
           </React.Fragment>
        ))}

        {/* Draw Danger Zones (Red) at Boundaries */}
        {boundaries.map(b => (
            <React.Fragment key={`danger-${b}`}>
                {createRedZone(magNorthBearing + b, 5000)}
            </React.Fragment>
        ))}

        {/* Concentric Distance Rings for Attenuation */}
        {attenuationRings.map((radiusMeters, i) => (
           <Circle 
             key={`ring-${radiusMeters}`}
             center={center}
             radius={radiusMeters}
             pathOptions={{ color: '#f59e0b', weight: 1, dashArray: '4,8', fill: false, opacity: 0.5 - (i * 0.1) }}
           />
        ))}
      </MapContainer>
      )}
      
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-1000 pointer-events-none">
        <div className="bg-zinc-950/80 backdrop-blur-md px-3 py-2 border border-blue-500/30 rounded-sm">
          <div className="text-[9px] uppercase font-mono tracking-widest text-blue-400">Magnetic North</div>
          <div className="text-xs font-mono text-zinc-300">D: {declination.toFixed(2)}° Offset</div>
        </div>
      </div>
      
      <div className="absolute bottom-4 right-4 z-1000 pointer-events-none">
        <div className="bg-zinc-950/80 backdrop-blur-md px-3 py-2 border border-emerald-500/30 rounded-sm text-right">
          <div className="text-[9px] uppercase font-mono tracking-widest text-emerald-400">Safe Zones (Green)</div>
          <div className="text-[8px] font-sans text-zinc-400">NE/SE/SW/NW (Magnetic Base ±10°)</div>
          <div className="text-[9px] uppercase font-mono tracking-widest text-[#ef4444] mt-1 pt-1 border-t border-zinc-800">Noise Borders (Red)</div>
          <div className="text-[8px] font-sans text-zinc-400">Boundary Intersect (±7.5°)</div>
          <div className="text-[9px] uppercase font-mono tracking-widest text-amber-500 mt-1 pt-1 border-t border-zinc-800">Attenuation Rings</div>
          <div className="text-[8px] font-sans text-zinc-400">100km, 500km, 1000km+</div>
        </div>
      </div>
    </div>
  );
}

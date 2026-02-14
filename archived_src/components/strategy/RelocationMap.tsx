'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet Icon
const iconBase = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/';

const homeIcon = new L.Icon({
  iconUrl: iconBase + 'marker-icon-blue.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const goodIcon = new L.Icon({
  iconUrl: iconBase + 'marker-icon-green.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const badIcon = new L.Icon({
  iconUrl: iconBase + 'marker-icon-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Calculate Destination Point
function getDestination(lat: number, lon: number, brng: number, dist: number): [number, number] {
  const R = 6371; // Earth Radius km
  const brngRad = brng * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  
  const lat2 = Math.asin( Math.sin(latRad)*Math.cos(dist/R) + Math.cos(latRad)*Math.sin(dist/R)*Math.cos(brngRad) );
  const lon2 = lonRad + Math.atan2(Math.sin(brngRad)*Math.sin(dist/R)*Math.cos(latRad), Math.cos(dist/R)-Math.sin(latRad)*Math.sin(lat2));
  
  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

export default function RelocationMap() {
  const center: [number, number] = [34.99238, 135.71853]; // Nishikyogoku
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <div className="h-[500px] w-full bg-gray-900 rounded-xl flex items-center justify-center text-gray-500">Loading Map...</div>;

  // Sector Calculation
  const p1 = getDestination(center[0], center[1], 22.5, 60);
  const p2 = getDestination(center[0], center[1], 67.5, 60);

  return (
    <div className="h-[600px] w-full rounded-xl overflow-hidden shadow-2xl border border-white/10 z-0 relative">
      <MapContainer center={[35.15, 135.9]} zoom={11} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Sectors */}
        <Polygon positions={[center, p1, p2, center]} pathOptions={{ color: 'green', fillColor: '#90EE90', fillOpacity: 0.2 }}>
            <Popup><b>North-East (Great Luck)</b><br/>Safe Zone for 2026</Popup>
        </Polygon>

        {/* Markers */}
        <Marker position={center} icon={homeIcon}>
          <Popup><b>Nishikyogoku (Current)</b><br/>Starting Point</Popup>
        </Marker>

        <Marker position={[35.03028, 135.77278]} icon={goodIcon}>
          <Popup><b>Sakyo-ku (Demachinyagi)</b><br/>Great Luck (NE)<br/>Commute: Keihan (Seated)</Popup>
        </Marker>

        <Marker position={[35.07046, 135.87827]} icon={goodIcon}>
          <Popup><b>Hieizan Sakamoto</b><br/>Great Luck (NE)<br/>Commute: JR Kosei Line</Popup>
        </Marker>

        <Marker position={[35.31472, 136.29000]} icon={goodIcon}>
          <Popup><b>Maibara</b><br/>Great Luck (NE)<br/>Commute: Shinkansen</Popup>
        </Marker>

        <Marker position={[34.702485, 135.495951]} icon={badIcon}>
          <Popup><b>Osaka (Umeda)</b><br/>Bad Luck (SW)<br/>Work Only</Popup>
        </Marker>

        {/* Lines */}
        <Polyline positions={[center, [35.03028, 135.77278]]} pathOptions={{ color: 'blue', dashArray: '5, 5', weight: 2 }} />
        <Polyline positions={[center, [35.07046, 135.87827]]} pathOptions={{ color: 'blue', dashArray: '5, 5', weight: 2 }} />

      </MapContainer>
    </div>
  );
}

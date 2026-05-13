"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";

const geoUrl = "https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson";

interface MunicipalityData {
  id: string;
  areaCode: string;
  areaName: string;
  incomePerCapita: number;
  lat: number | null;
  lon: number | null;
  astrologyScore: number;
  astrologyStatus: string;
  direction: string | null;
  magneticDirection?: string | null;
  trueBearing?: number | null;
  magneticBearing?: number | null;
}

interface WealthMapProps {
  data: MunicipalityData[];
  baseLat?: number;
  baseLon?: number;
  useTrueNorth?: boolean;
}

export function WealthMap({ data, baseLat = 35.6895, baseLon = 139.6917, useTrueNorth = false }: WealthMapProps) {
  const [tooltipContent, setTooltipContent] = useState("");

  // Create color scale for income
  const colorScale = useMemo(() => {
    const incomes = data.map(d => d.incomePerCapita);
    const min = Math.min(...incomes.length ? incomes : [0]);
    const max = Math.max(...incomes.length ? incomes : [10000000]);
    
    return scaleLinear<string>()
      .domain([min, max])
      .range(["#818cf8", "#f43f5e"]); // Indigo to Rose
  }, [data]);

  return (
    <div className="w-full h-full relative bg-gray-900 rounded-2xl overflow-hidden border border-gray-800">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 2500,
          center: [137, 38] // Center on Japan
        }}
        width={800}
        height={600}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup zoom={1} maxZoom={10} center={[137, 38]}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1f2937" // gray-800
                  stroke="#374151" // gray-700
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#374151" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Render Base Location */}
          <Marker coordinates={[baseLon, baseLat]}>
            <circle r={6} fill="#10b981" />
            <circle r={12} fill="#10b981" fillOpacity={0.3} className="animate-ping" />
            <text
              textAnchor="middle"
              y={-15}
              style={{ fontFamily: "sans-serif", fill: "#10b981", fontSize: "10px", fontWeight: "bold" }}
            >
              現在地
            </text>
          </Marker>

          {/* Render Municipalities */}
          {data.map((m) => {
            if (!m.lon || !m.lat) return null;
            
            // Highlight optimal directions
            const isOptimal = m.astrologyStatus.includes('OPTIMAL');
            const isSafe = m.astrologyStatus.includes('SAFE');
            const isNoise = m.astrologyStatus?.includes('NOISE') && !m.astrologyStatus?.includes('WARNING');
            const hasWarning = m.astrologyStatus.includes('DECLINATION_WARNING');
            
            if (isNoise) return null; // Hide bad directions to reduce clutter
            
            const radius = isOptimal ? 6 : isSafe ? 4 : hasWarning ? 3 : 2;
            const opacity = isOptimal ? 0.9 : 0.6;
            
            return (
              <Marker 
                key={m.id} 
                coordinates={[m.lon, m.lat]}
                onMouseEnter={() => {
                  const dirStr = useTrueNorth 
                    ? `${m.direction}(真北)` 
                    : (m.direction !== m.magneticDirection ? `${m.direction}(真)→${m.magneticDirection}(磁)` : `${m.direction}(一致)`);
                  setTooltipContent(`${m.areaName}: ${Math.round(m.incomePerCapita/10000)}万円 (${dirStr} - ${m.astrologyStatus})`);
                }}
                onMouseLeave={() => {
                  setTooltipContent("");
                }}
              >
                <circle
                  r={radius}
                  fill={hasWarning ? "#fbbf24" : colorScale(m.incomePerCapita)}
                  fillOpacity={opacity}
                  stroke={isOptimal ? "#fff" : hasWarning ? "#f59e0b" : "none"}
                  strokeWidth={isOptimal || hasWarning ? 1 : 0}
                  className="transition-all duration-300 hover:r-8 cursor-pointer"
                />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
      
      {/* Legend / Tooltip Overlay */}
      {tooltipContent && (
        <div className="absolute top-4 left-4 bg-black/80 text-white px-3 py-2 rounded shadow-lg backdrop-blur text-sm pointer-events-none z-10 max-w-sm whitespace-pre-wrap">
          {tooltipContent}
        </div>
      )}
      
      <div className="absolute bottom-4 right-4 bg-black/80 text-white px-4 py-3 rounded-xl shadow-lg backdrop-blur text-xs pointer-events-none border border-gray-800 z-10 flex flex-col gap-2">
        <div className="font-bold border-b border-gray-700 pb-1 mb-1">一人当たり所得</div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500"></span> 高い
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-indigo-400"></span> 低い
        </div>
        <div className="font-bold border-b border-gray-700 pb-1 mb-1 mt-2">吉凶ステータス</div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border border-white bg-rose-500"></span> 大吉 (OPTIMAL)
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span> 吉 (SAFE)
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full border border-amber-500 bg-amber-400"></span> 偏角警告 (磁北ズレ)
        </div>
      </div>
    </div>
  );
}

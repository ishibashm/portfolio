"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import {
  resolveWealthMarker,
  WEALTH_LEGEND_NOTES,
  WEALTH_LEGEND_SAMPLES,
} from "@/lib/wealthMapPresentation";

const geoUrl =
  "https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson";

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

export function WealthMap({
  data,
  baseLat = 35.6895,
  baseLon = 139.6917,
  useTrueNorth = false,
}: WealthMapProps) {
  const [tooltipContent, setTooltipContent] = useState("");

  // Create color scale for income
  const colorScale = useMemo(() => {
    const incomes = data.map((d) => d.incomePerCapita);
    const min = Math.min(...(incomes.length ? incomes : [0]));
    const max = Math.max(...(incomes.length ? incomes : [10000000]));

    return scaleLinear<string>()
      .domain([min, max])
      .range(["#818cf8", "#f43f5e"]); // Indigo to Rose
  }, [data]);

  return (
    <div className="w-full h-full relative bg-white rounded-2xl overflow-hidden border border-stone-200">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 2500,
          center: [137, 38], // Center on Japan
        }}
        width={800}
        height={600}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup zoom={1} maxZoom={10} center={[137, 38]}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#e7e5e4" // stone-200
                  stroke="#fafaf9" // stone-50
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#d6d3d1" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Render Base Location */}
          <Marker coordinates={[baseLon, baseLat]}>
            <circle r={6} fill="#10b981" />
            <circle
              r={12}
              fill="#10b981"
              fillOpacity={0.3}
              className="animate-ping"
            />
            <text
              textAnchor="middle"
              y={-15}
              style={{
                fontFamily: "sans-serif",
                fill: "#10b981",
                fontSize: "10px",
                fontWeight: "bold",
              }}
            >
              現在地
            </text>
          </Marker>

          {/* Render Municipalities */}
          {data.map((m) => {
            if (!m.lon || !m.lat) return null;

            // 見た目は凡例と同じ表から引く（@/lib/wealthMapPresentation）。
            // null は凶方位＝地図に出さない。
            const marker = resolveWealthMarker(m.astrologyStatus);
            if (!marker) return null;

            return (
              <Marker
                key={m.id}
                coordinates={[m.lon, m.lat]}
                onMouseEnter={() => {
                  const dirStr = useTrueNorth
                    ? `${m.direction}(真北)`
                    : m.direction !== m.magneticDirection
                      ? `${m.direction}(真)→${m.magneticDirection}(磁)`
                      : `${m.direction}(一致)`;
                  setTooltipContent(
                    `${m.areaName}: ${Math.round(m.incomePerCapita / 10000)}万円 (${dirStr} - ${m.astrologyStatus})`,
                  );
                }}
                onMouseLeave={() => {
                  setTooltipContent("");
                }}
              >
                <circle
                  r={marker.radius}
                  fill={
                    marker.fill === "income"
                      ? colorScale(m.incomePerCapita)
                      : marker.fill
                  }
                  fillOpacity={marker.opacity}
                  stroke={marker.stroke ?? "none"}
                  strokeWidth={marker.strokeWidth}
                  className="transition-all duration-300 hover:r-8 cursor-pointer"
                />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Legend / Tooltip Overlay */}
      {tooltipContent && (
        <div className="absolute top-4 left-4 bg-white/70 text-stone-900 px-3 py-2 rounded shadow-lg backdrop-blur text-sm pointer-events-none z-10 max-w-sm whitespace-pre-wrap">
          {tooltipContent}
        </div>
      )}

      <div className="absolute bottom-4 right-4 bg-white/70 text-stone-900 px-4 py-3 rounded-xl shadow-lg backdrop-blur text-xs pointer-events-none border border-stone-200 z-10 flex flex-col gap-2">
        <div className="font-bold border-b border-stone-300 pb-1 mb-1">
          一人当たり所得
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500"></span> 高い
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-indigo-400"></span> 低い
        </div>
        <div className="font-bold border-b border-stone-300 pb-1 mb-1 mt-2">
          吉凶ステータス
        </div>
        {WEALTH_LEGEND_SAMPLES.map((item) => {
          // 見本の丸は、地図の点とまったく同じ関数から作る。
          const marker = resolveWealthMarker(item.sample);
          if (!marker) return null;
          return (
            <div key={item.sample} className="flex items-center gap-2">
              <svg width={14} height={14} className="shrink-0">
                <circle
                  cx={7}
                  cy={7}
                  r={marker.radius}
                  fill={marker.fill === "income" ? "#f43f5e" : marker.fill}
                  fillOpacity={marker.opacity}
                  stroke={marker.stroke ?? "none"}
                  strokeWidth={marker.strokeWidth}
                />
              </svg>
              {item.label}
            </div>
          );
        })}
        {WEALTH_LEGEND_NOTES.map((note) => (
          <div key={note} className="text-[10px] text-stone-500 max-w-[13rem]">
            ※{note}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import { Minus, Plus, LocateFixed } from "lucide-react";
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
import type { MunicipalityWealthItem } from "@/lib/municipalityWealth";

const geoUrl =
  "https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson";

/**
 * この地図が読む項目だけ。名前と型は集約先（lib/municipalityWealth）から引く。
 *
 * 以前はここに同じ形を書き写していた。応答の形は 1 つなのに宣言が
 * 3 か所（この地図・移住比較のページ・SolarTimeClock の any）に散って
 * おり、実際に SolarTimeClock 側が存在しない項目名を読んでいた（#231）。
 *
 * areaCode・astrologyScore・trueBearing・magneticBearing も宣言して
 * いたが、この地図はどれも読んでいないので受け口から外した。
 */
type MunicipalityData = Pick<
  MunicipalityWealthItem,
  | "id"
  | "areaName"
  | "incomePerCapita"
  | "lat"
  | "lon"
  | "astrologyStatus"
  | "direction"
  | "magneticDirection"
>;

interface WealthMapProps {
  data: MunicipalityData[];
  baseLat?: number;
  baseLon?: number;
  useTrueNorth?: boolean;
}

/** 拡大の上限。市区町村の点が重ならずに見分けられるところまで。 */
const MAX_ZOOM = 16;

/*
  ## 拡大しても点と文字が一緒に大きくならないように（2026-09-28）

  利用者の指摘「地図でフォーカスしようとしてもできない」（iPad）。
  ZoomableGroup は中身を SVG の scale でまとめて拡大する。点の半径も
  「現在地」の文字も同じ倍率で大きくなるので、拡大すると点どうしが
  重なって地図を覆い、狙った街に寄れなかった（スクリーンショットでは
  「現在地」が見出しより大きく、点が画面を埋めていた）。

  - 倍率を state に持ち、点の半径・線の太さ・文字の大きさを倍率で割る
    （画面上の大きさを一定に保つ）
  - 拡大・縮小・出発地へ戻すボタンを置く（ピンチが効きにくい端末でも寄れる）
  - 点を押すと吹き出しを出す（以前は mouseenter だけで、指では出なかった）
  - 最初の中心は出発地（以前は日本の中央に固定）
*/
export function WealthMap({
  data,
  baseLat = 35.6895,
  baseLon = 139.6917,
  useTrueNorth = false,
}: WealthMapProps) {
  const [tooltipContent, setTooltipContent] = useState("");
  const [view, setView] = useState<{
    center: [number, number];
    zoom: number;
  }>({ center: [baseLon, baseLat], zoom: 1 });
  /* 出発地は後から届く（頁が API の応答で渡し直す）。届いたら中心を
     そこへ移す。effect で setState せず、描画中に前の値と比べる */
  const baseKey = `${baseLon},${baseLat}`;
  const [seenBase, setSeenBase] = useState(baseKey);
  if (seenBase !== baseKey) {
    setSeenBase(baseKey);
    setView({ center: [baseLon, baseLat], zoom: 1 });
  }
  const k = view.zoom;
  const zoomBy = (factor: number) =>
    setView((v) => ({
      ...v,
      zoom: Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor)),
    }));

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
        <ZoomableGroup
          zoom={view.zoom}
          center={view.center}
          maxZoom={MAX_ZOOM}
          onMoveEnd={({ coordinates, zoom }) =>
            setView({ center: coordinates, zoom })
          }
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#e7e5e4" // stone-200
                  stroke="#fafaf9" // stone-50
                  strokeWidth={0.5 / k}
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
            <circle r={6 / k} fill="#10b981" />
            <circle
              r={12 / k}
              fill="#10b981"
              fillOpacity={0.3}
              className="animate-ping"
            />
            <text
              textAnchor="middle"
              y={-15 / k}
              style={{
                fontFamily: "sans-serif",
                fill: "#10b981",
                fontSize: `${10 / k}px`,
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

            const describe = () => {
              const dirStr = useTrueNorth
                ? `${m.direction}(真北)`
                : m.direction !== m.magneticDirection
                  ? `${m.direction}(真)→${m.magneticDirection}(磁)`
                  : `${m.direction}(一致)`;
              setTooltipContent(
                `${m.areaName}: ${Math.round(m.incomePerCapita / 10000)}万円 (${dirStr} - ${m.astrologyStatus})`,
              );
            };
            return (
              <Marker
                key={m.id}
                coordinates={[m.lon, m.lat]}
                onMouseEnter={describe}
                onClick={describe}
                onMouseLeave={() => {
                  setTooltipContent("");
                }}
              >
                <circle
                  r={marker.radius / k}
                  fill={
                    marker.fill === "income"
                      ? colorScale(m.incomePerCapita)
                      : marker.fill
                  }
                  fillOpacity={marker.opacity}
                  stroke={marker.stroke ?? "none"}
                  strokeWidth={marker.strokeWidth / k}
                  className="cursor-pointer"
                />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
        <button
          type="button"
          aria-label="拡大"
          onClick={() => zoomBy(2)}
          disabled={k >= MAX_ZOOM}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white/90 text-stone-700 shadow hover:bg-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="縮小"
          onClick={() => zoomBy(0.5)}
          disabled={k <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white/90 text-stone-700 shadow hover:bg-white disabled:opacity-40"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="出発地へ戻す"
          onClick={() => setView({ center: [baseLon, baseLat], zoom: 4 })}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white/90 text-stone-700 shadow hover:bg-white"
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
        </button>
      </div>

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

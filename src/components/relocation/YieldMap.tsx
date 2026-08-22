"use client";

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import type { YieldCell } from "@/utils/yieldStats";
import { YIELD_LEGEND, formatYield, yieldColor } from "@/lib/yieldPresentation";

/**
 * 区画ごとの表面利回りを日本地図に置く。
 *
 * ## 色は自分で決めない
 *
 * 目盛りも凡例も lib/yieldPresentation から引く。地図と凡例が別々に
 * 色を決めると、同じ利回りが場所によって違う色になる（#485〜#487 で
 * 実際に起きた）。
 *
 * ## 印は正方形にする
 *
 * 区画は 0.05 度四方（約 5km）の升目なので、丸ではなく正方形で置く。
 * 丸だと「点の集まり」に見えて、**升目を敷き詰めたものだと伝わらない。**
 *
 * 大きさは画面上の px で固定する。拡大しても升目が実寸で広がらないが、
 * 縮小したときに潰れて消えるほうが困る。全国を一望したときに
 * 「どこに記録があるか」が読めることを優先した。
 *
 * ## 白いところの意味
 *
 * 記録が無い場所は地の色（stone-200）のまま。**これは「成約価格が
 * 無い」ではなく「賃貸を集めていない」。**実測で、賃貸が 5 件以上ある
 * 区画の 98.9% は成約側もそろっていた。読む人は逆に受け取りやすいので、
 * 頁の側に断りを出すこと。
 */

const geoUrl =
  "https://raw.githubusercontent.com/dataofjapan/land/master/japan.topojson";

/** 升目の一辺（画面上の px）。 */
const CELL_PX = 4;

interface YieldMapProps {
  cells: YieldCell[];
}

export function YieldMap({ cells }: YieldMapProps) {
  const [hovered, setHovered] = useState<YieldCell | null>(null);

  return (
    <div className="relative w-full">
      <div className="w-full overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 2500, center: [137, 38] }}
          width={800}
          height={600}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup zoom={1} maxZoom={12} center={[137, 38]}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#e7e5e4"
                    stroke="#fafaf9"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {cells.map((cell) => {
              if (cell.grossYield === null) return null;
              return (
                <Marker key={cell.cell} coordinates={[cell.lon, cell.lat]}>
                  <rect
                    x={-CELL_PX / 2}
                    y={-CELL_PX / 2}
                    width={CELL_PX}
                    height={CELL_PX}
                    fill={yieldColor(cell.grossYield)}
                    onMouseEnter={() => setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "pointer" }}
                  />
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/*
        凡例。色は必ず YIELD_LEGEND から引く。ここに色を書き写すと、
        目盛りを変えたときに凡例だけ取り残される。
      */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[11px] font-bold text-stone-700">
          表面利回り（年）
        </span>
        <div className="flex items-center gap-1">
          {YIELD_LEGEND.map((entry) => (
            <div key={entry.value} className="flex flex-col items-center gap-1">
              <span
                className="block h-4 w-8 rounded-sm border border-stone-300"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[10px] font-mono text-stone-600">
                {entry.label}
              </span>
            </div>
          ))}
        </div>
        <span className="text-[11px] text-stone-500">
          薄いほど低く、濃いほど高い。目盛りは固定なので、週ごとの更新で色の意味は変わりません。
        </span>
      </div>

      {/*
        触れた升目の中身。**片側の件数まで出す。**中央値だけ見せると、
        5 件で出した値と 300 件で出した値の区別がつかない。
      */}
      <div className="mt-3 min-h-[4.5rem] rounded-xl border border-stone-200 bg-stone-50 p-3">
        {hovered && hovered.grossYield !== null ? (
          <div className="space-y-1">
            <p className="text-sm font-bold text-stone-900">
              表面利回り {formatYield(hovered.grossYield)}
            </p>
            <p className="text-[11px] text-stone-600">
              賃貸 {hovered.rental?.n ?? 0} 件（
              {Math.round(
                hovered.rental?.medianPerSqm ?? 0,
              ).toLocaleString()}{" "}
              円/㎡/月） ÷ 中古マンション {hovered.purchase?.n ?? 0} 件（
              {Math.round(
                hovered.purchase?.medianPerSqm ?? 0,
              ).toLocaleString()}{" "}
              円/㎡）
            </p>
            <p className="text-[11px] font-mono text-stone-500">
              {hovered.lat.toFixed(3)}, {hovered.lon.toFixed(3)}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-stone-500">
            升目に触れると、その区画の内訳（賃貸と中古マンションの件数・㎡単価）が出ます。
          </p>
        )}
      </div>
    </div>
  );
}

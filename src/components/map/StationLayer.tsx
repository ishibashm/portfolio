"use client";

import { useEffect, useState } from "react";
import {
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { clusterByTile } from "@/lib/mapClusters";
import {
  loadStations,
  STATION_CLUSTER_BELOW_ZOOM,
  STATIONS_ATTRIBUTION,
  type StationView,
} from "@/lib/stations";
import { spotFromBase } from "@/lib/powerSpots";
import { nearestMunicipality, nearestPlaceLabel } from "@/lib/nearestPlace";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import type { DirectionCell } from "@/components/relocation/SpotVerdict";

/**
 * 駅（国土数値情報 N02）の層。**共有部品**（CLAUDE.md 3 節）。
 *
 * - 一覧（1 万駅・数百 KB）は押されてから読む。既定は非表示
 * - z11 未満は物件と同じ clusterByTile で升目にまとめる。1 万点を
 *   全国俯瞰に置くと描画が止まる
 * - 帰属表示は層が出ている間だけ足す（出典の明示が利用条件）
 * - 判定は名所・登録地点と同じ spotFromBase。別に計算しない
 */

const STATION_STYLE = {
  color: "#1e3a8a",
  fillColor: "#3b82f6",
  fillOpacity: 0.85,
  weight: 1.2,
  opacity: 0.9,
};

export interface StationLayerProps {
  enabled: boolean;
  zoom?: number;
  baseLat: number | null | undefined;
  baseLon: number | null | undefined;
  useClassical: boolean;
  dirKigaku?: Record<string, DirectionCell>;
  onInspect?: (lat: number, lon: number) => void;
  noBoardNote?: string | null;
}

export function StationLayer({
  enabled,
  zoom,
  baseLat,
  baseLon,
  useClassical,
  dirKigaku,
  onInspect,
  noBoardNote = "段階は生年月日と出発地を入れると出ます。",
}: StationLayerProps) {
  const [stations, setStations] = useState<StationView[] | null>(null);
  const map = useMap();
  const [ownZoom, setOwnZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setOwnZoom(map.getZoom()) });
  const effectiveZoom = zoom ?? ownZoom;

  useEffect(() => {
    if (!enabled || stations) return;
    let alive = true;
    loadStations().then((list) => {
      if (alive) setStations(list);
    });
    return () => {
      alive = false;
    };
  }, [enabled, stations]);

  /* 帰属表示。層が出ている間だけ（外部の状態＝Leaflet の控えを同期する効果） */
  useEffect(() => {
    if (!enabled) return;
    const ctrl = map.attributionControl;
    if (!ctrl) return;
    ctrl.addAttribution(STATIONS_ATTRIBUTION);
    return () => {
      ctrl.removeAttribution(STATIONS_ATTRIBUTION);
    };
  }, [enabled, map]);

  if (!enabled || !stations) return null;

  const hasBase =
    typeof baseLat === "number" &&
    typeof baseLon === "number" &&
    Number.isFinite(baseLat) &&
    Number.isFinite(baseLon);

  if (effectiveZoom < STATION_CLUSTER_BELOW_ZOOM) {
    return (
      <>
        {clusterByTile(stations, effectiveZoom).map((c) => {
          const r = Math.max(4, Math.min(16, 3 + Math.log2(c.count) * 2));
          return (
            <CircleMarker
              key={`st-${c.lat.toFixed(3)}-${c.lon.toFixed(3)}`}
              center={[c.lat, c.lon]}
              radius={r}
              pathOptions={{ ...STATION_STYLE, fillOpacity: 0.45, weight: 0.8 }}
            >
              <Tooltip direction="top" offset={[0, -r]}>
                {c.count === 1
                  ? c.items[0].name
                  : `駅 ${c.count}（拡大すると分かれます）`}
              </Tooltip>
            </CircleMarker>
          );
        })}
      </>
    );
  }

  return (
    <>
      {stations.map((s) => {
        const from = hasBase
          ? spotFromBase(baseLat, baseLon, s, useClassical, dirKigaku)
          : null;
        const tier = from?.cell?.tier as DayTier | undefined;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={5}
            pathOptions={STATION_STYLE}
          >
            <Tooltip direction="top" offset={[0, -5]}>
              {s.name}
            </Tooltip>
            <Popup>
              <div className="font-sans text-xs text-gray-900 p-2 min-w-[180px]">
                <div className="font-bold text-sm">🚉 {s.name}</div>
                <div className="text-stone-600 mt-0.5">
                  {nearestPlaceLabel(nearestMunicipality(s.lat, s.lon)) ?? ""}
                </div>
                {s.lines.length > 0 && (
                  <ul className="mt-1 text-[10px] text-stone-600 space-y-0.5">
                    {s.lines.slice(0, 6).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                    {s.lines.length > 6 && (
                      <li>ほか {s.lines.length - 6} 路線</li>
                    )}
                  </ul>
                )}
                {from && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between gap-3">
                      <span className="text-stone-600">出発地から:</span>
                      <span className="font-bold">
                        {from.directionLabel} {Math.round(from.distanceKm)}km
                      </span>
                    </div>
                    {from.cell ? (
                      <div className="flex justify-between gap-3 items-center">
                        <span className="text-stone-600">この日の段階:</span>
                        <span
                          className={`px-1.5 py-0.5 rounded border font-bold ${
                            (tier && TIER_BADGE_CLASS[tier]) ??
                            "bg-stone-100 border-stone-300 text-stone-700"
                          }`}
                        >
                          {(tier && TIER_LABELS[tier]) ?? from.cell.tier}
                        </span>
                      </div>
                    ) : noBoardNote ? (
                      <div className="text-[10px] text-stone-500">
                        {noBoardNote}
                      </div>
                    ) : null}
                    {from.unstableNote && (
                      <div className="text-[10px] text-amber-700">
                        {from.unstableNote}
                      </div>
                    )}
                  </div>
                )}
                {onInspect && (
                  <button
                    type="button"
                    onClick={() => onInspect(s.lat, s.lon)}
                    className="mt-2 w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    この地点を判定へ
                  </button>
                )}
                <div className="text-[9px] text-stone-500 mt-2 leading-snug">
                  {
                    "出典: 国土数値情報（鉄道データ）（国土交通省）2025 年版。駅の位置は線分の中点です。"
                  }
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

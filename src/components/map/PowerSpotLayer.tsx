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
  loadPowerSpots,
  spotFromBase,
  POWER_SPOT_CLUSTER_BELOW_ZOOM,
  type PowerSpot,
} from "@/lib/powerSpots";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import type { DirectionCell } from "@/components/relocation/SpotVerdict";

/**
 * パワースポット（一宮・名勝）の層。**共有部品**（CLAUDE.md 3 節。地図は
 * 5 つあり、写すと必ず食い違う）。
 *
 * - 一覧は押されてから読む（`loadPowerSpots`）。既定は非表示
 * - 遠景では升目にまとめる（`clusterByTile`。物件の升目と同じ関数）
 * - 吹き出しには「一宮／名勝である」という事実と、出発地から見た方位・距離・
 *   その日の段階だけを出す。**効果や利益は書かない**
 * - 「この地点を判定へ」は地図クリックと同じ受け口（onInspect）へ渡す。
 *   判定の画面を別に作らない
 */

/**
 * 根拠ごとの色。神社（一宮）は琥珀、名勝は緑。**色の意味は 2 つだけ**に
 * 留める（この地図には方位の吉凶・候補の件数の色が既に乗っている）。
 * 根拠の文字列は scripts/import_spots.ts の DESIGNATIONS と同じ。
 */
const SPOT_STYLE_SHRINE = {
  color: "#7c2d12",
  fillColor: "#f59e0b",
  fillOpacity: 0.85,
  weight: 1.5,
  opacity: 0.9,
};
const SPOT_STYLE_SCENIC = {
  color: "#14532d",
  fillColor: "#22c55e",
  fillOpacity: 0.85,
  weight: 1.5,
  opacity: 0.9,
};
function styleFor(basis: string) {
  return basis.includes("名勝") ? SPOT_STYLE_SCENIC : SPOT_STYLE_SHRINE;
}
/** 升目にまとめたときの色（混在するので中立） */
const SPOT_STYLE_CLUSTER = {
  color: "#57534e",
  fillColor: "#a8a29e",
  fillOpacity: 0.55,
  weight: 1.5,
  opacity: 0.9,
};

export interface PowerSpotLayerProps {
  enabled: boolean;
  /**
   * 地図のズーム。呼び出し側が既に追っていれば渡す（物件検索・
   * ダッシュボード）。渡さなければ層が自分で追う（試算頁のように
   * ズームを持たない地図）。
   */
  zoom?: number;
  baseLat: number | null | undefined;
  baseLon: number | null | undefined;
  useClassical: boolean;
  dirKigaku?: Record<string, DirectionCell>;
  onInspect?: (lat: number, lon: number) => void;
  /**
   * 盤が無いときに吹き出しへ出す 1 行。既定は「生年月日と出発地を
   * 入れると出ます」。**盤をそもそも持たない地図**（試算頁）では、
   * 入れても出ないので null を渡して消す。
   */
  noBoardNote?: string | null;
}

export function PowerSpotLayer({
  enabled,
  zoom,
  baseLat,
  baseLon,
  useClassical,
  dirKigaku,
  onInspect,
  noBoardNote = "段階は生年月日と出発地を入れると出ます。",
}: PowerSpotLayerProps) {
  const [spots, setSpots] = useState<PowerSpot[] | null>(null);
  /* ズームを渡されなかったときだけ自分で追う。イベントの中で setState
     する（効果の中ではない）。 */
  const map = useMap();
  const [ownZoom, setOwnZoom] = useState(() => map.getZoom());
  useMapEvents({
    zoomend: () => setOwnZoom(map.getZoom()),
  });
  const effectiveZoom = zoom ?? ownZoom;

  useEffect(() => {
    if (!enabled || spots) return;
    let alive = true;
    loadPowerSpots().then((list) => {
      if (alive) setSpots(list);
    });
    return () => {
      alive = false;
    };
  }, [enabled, spots]);

  if (!enabled || !spots) return null;

  const hasBase =
    typeof baseLat === "number" &&
    typeof baseLon === "number" &&
    Number.isFinite(baseLat) &&
    Number.isFinite(baseLon);

  if (effectiveZoom < POWER_SPOT_CLUSTER_BELOW_ZOOM) {
    return (
      <>
        {clusterByTile(spots, effectiveZoom).map((c) => {
          if (c.count === 1) {
            return (
              <SpotMarker
                key={c.items[0].id}
                spot={c.items[0]}
                hasBase={hasBase}
                baseLat={baseLat as number}
                baseLon={baseLon as number}
                useClassical={useClassical}
                dirKigaku={dirKigaku}
                onInspect={onInspect}
                noBoardNote={noBoardNote}
              />
            );
          }
          const r = Math.max(7, Math.min(18, 5 + Math.log2(c.count) * 3));
          return (
            <CircleMarker
              key={`spots-${c.lat.toFixed(3)}-${c.lon.toFixed(3)}`}
              center={[c.lat, c.lon]}
              radius={r}
              pathOptions={SPOT_STYLE_CLUSTER}
            >
              <Tooltip direction="top" offset={[0, -r]}>
                {`名所 ${c.count} 件（拡大すると分かれます）`}
              </Tooltip>
              <Popup>
                <div className="font-sans text-xs text-gray-900 p-2 min-w-[160px] max-h-60 overflow-y-auto">
                  <div className="font-bold">このあたりの名所 {c.count} 件</div>
                  <ul className="mt-1 space-y-0.5">
                    {c.items.map((s) => (
                      <li key={s.id}>
                        {s.name}
                        <span className="text-stone-500">
                          （{s.pref}
                          {s.city}・{s.basis}）
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-[9px] text-stone-500 mt-2 leading-snug">
                    {"ズームすると 1 件ずつ選べます。"}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </>
    );
  }

  return (
    <>
      {spots.map((s) => (
        <SpotMarker
          key={s.id}
          spot={s}
          hasBase={hasBase}
          baseLat={baseLat as number}
          baseLon={baseLon as number}
          useClassical={useClassical}
          dirKigaku={dirKigaku}
          onInspect={onInspect}
          noBoardNote={noBoardNote}
        />
      ))}
    </>
  );
}

function SpotMarker({
  spot,
  hasBase,
  baseLat,
  baseLon,
  useClassical,
  dirKigaku,
  onInspect,
  noBoardNote,
}: {
  spot: PowerSpot;
  hasBase: boolean;
  baseLat: number;
  baseLon: number;
  useClassical: boolean;
  dirKigaku?: Record<string, DirectionCell>;
  onInspect?: (lat: number, lon: number) => void;
  noBoardNote: string | null;
}) {
  const from = hasBase
    ? spotFromBase(baseLat, baseLon, spot, useClassical, dirKigaku)
    : null;
  const tier = from?.cell?.tier as DayTier | undefined;
  return (
    <CircleMarker
      center={[spot.lat, spot.lon]}
      radius={6}
      pathOptions={styleFor(spot.basis)}
    >
      <Tooltip direction="top" offset={[0, -6]}>
        {spot.name}
      </Tooltip>
      <Popup>
        <div className="font-sans text-xs text-gray-900 p-2 min-w-[180px]">
          <div className="font-bold text-sm">{spot.name}</div>
          <div className="text-stone-600 mt-0.5">
            {spot.pref}
            {spot.city}・{spot.basis}
          </div>
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
                <div className="text-[10px] text-stone-500">{noBoardNote}</div>
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
              onClick={() => onInspect(spot.lat, spot.lon)}
              className="mt-2 w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
            >
              この地点を判定へ
            </button>
          )}
          <div className="text-[9px] text-stone-500 mt-2 leading-snug">
            {
              "一覧は Wikidata（CC0）の指定（一宮・名勝）。所在地は座標から引いた最寄りの市区町村です。"
            }
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

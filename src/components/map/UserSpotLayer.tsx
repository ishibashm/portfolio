"use client";

import { CircleMarker, Popup, Tooltip } from "react-leaflet";
import { useUserSpots, removeUserSpot } from "@/lib/userSpots";
import { spotFromBase } from "@/lib/powerSpots";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import type { DirectionCell } from "@/components/relocation/SpotVerdict";

/**
 * 利用者が登録した地点（lib/userSpots。端末の localStorage）の層。
 * **共有部品**（CLAUDE.md 3 節。地図は 5 つある）。
 *
 * - 判定は名所の層と同じ `spotFromBase`（＝ SpotVerdict と同じ経路）。
 *   ここで別に計算しない
 * - 常に出す。登録は多くて 50 件で、切り替えを要るほど重くない
 * - 削除は吹き出しから。確認は挟まない（端末の中だけの記録で、
 *   もう一度「保存」すれば戻る）
 */

const USER_SPOT_STYLE = {
  color: "#4c1d95",
  fillColor: "#8b5cf6",
  fillOpacity: 0.9,
  weight: 1.5,
  opacity: 0.95,
};

export interface UserSpotLayerProps {
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

export function UserSpotLayer({
  baseLat,
  baseLon,
  useClassical,
  dirKigaku,
  onInspect,
  noBoardNote = "段階は生年月日と出発地を入れると出ます。",
}: UserSpotLayerProps) {
  const spots = useUserSpots();
  if (spots.length === 0) return null;
  const hasBase =
    typeof baseLat === "number" &&
    typeof baseLon === "number" &&
    Number.isFinite(baseLat) &&
    Number.isFinite(baseLon);

  return (
    <>
      {spots.map((s) => {
        const from = hasBase
          ? spotFromBase(baseLat, baseLon, s, useClassical, dirKigaku)
          : null;
        const tier = from?.cell?.tier as DayTier | undefined;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={7}
            pathOptions={USER_SPOT_STYLE}
          >
            <Tooltip direction="top" offset={[0, -7]}>
              {`★ ${s.name}`}
            </Tooltip>
            <Popup>
              <div className="font-sans text-xs text-gray-900 p-2 min-w-[180px]">
                <div className="font-bold text-sm">★ {s.name}</div>
                <div className="text-stone-500 mt-0.5 font-mono text-[10px]">
                  {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
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
                <div className="mt-2 flex gap-2">
                  {onInspect && (
                    <button
                      type="button"
                      onClick={() => onInspect(s.lat, s.lon)}
                      className="flex-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                    >
                      この地点を判定へ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeUserSpot(s.id)}
                    className="rounded border border-stone-300 bg-white px-2 py-1 text-[10px] font-bold text-stone-600 hover:bg-stone-100"
                  >
                    削除
                  </button>
                </div>
                <div className="text-[9px] text-stone-500 mt-2 leading-snug">
                  {"この端末だけに保存されています（サーバーには送りません）。"}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

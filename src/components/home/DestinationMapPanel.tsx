"use client";

/**
 * ホームの「2. 目的地/健康」タブの後半（タブ分割 3/3）。
 * Spatial Targeting（目的地の方位評価）・時期ヒートマップ・戦術地図・
 * 方位の手引きを持つ。
 *
 * SolarTimeClock から移しただけで、計算・表示は 1 つも変えていない。
 * 参照している値はすべて props で受ける。状態の持ち主は今までどおり
 * SolarTimeClock（タブを離れても値を保つ従来挙動のため）。
 */

import React from "react";
import dynamic from "next/dynamic";
import type { MapProperty } from "@/lib/mapProperty";
import type { SpaceWeatherData } from "../../utils/spaceWeather";
import type { GeomagneticData } from "../../utils/geomagnetism";
import type { LayerMode } from "@/utils/directionStatus";
import type {
  ActionIntent,
  Direction,
  getHonmeiStar,
} from "../../utils/ephemerisEngine";
import type { Layers } from "./ConsultPanel";
import type { HeatmapColumn, TrendCell } from "../SolarTimeClock";

/**
 * 地図と地点選択。移動元（SolarTimeClock）と同じく、描画されるまで
 * 読み込まない。使うのがこのタブだけになったので定義ごと移した。
 */
const TacticalMagneticMap = dynamic(
  () => import("../TacticalMagneticMap").then((mod) => mod.TacticalMagneticMap),
  { ssr: false },
);

const LocationPickerInner = dynamic(() => import("../LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-600">
      [ INITIALIZING MAP INTERFACE... ]
    </div>
  ),
});

/** 目的地の方位（真北基準と磁北基準）。無ければ null。 */
export interface TargetDirectionInfo {
  trueDirection: Direction;
  magneticDirection: Direction;
}

export interface DestinationMapPanelProps {
  lat: number;
  lon: number;
  baseTime: Date | null;
  birthDate: string;
  evalDate: Date;
  timeOffsetDays: number;
  setTimeOffsetDays: React.Dispatch<React.SetStateAction<number>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playSpeedDays: number;
  setPlaySpeedDays: React.Dispatch<React.SetStateAction<number>>;
  targetLat: number | null;
  setTargetLat: React.Dispatch<React.SetStateAction<number | null>>;
  targetLon: number | null;
  setTargetLon: React.Dispatch<React.SetStateAction<number | null>>;
  targetElevation: number | null;
  setTargetElevation: React.Dispatch<React.SetStateAction<number | null>>;
  targetDirInfo: TargetDirectionInfo | null;
  targetDirection: Direction | null;
  targetVectorStatus: string | null;
  showMapPicker: boolean;
  setShowMapPicker: React.Dispatch<React.SetStateAction<boolean>>;
  actionIntent: ActionIntent;
  setActionIntent: React.Dispatch<React.SetStateAction<ActionIntent>>;
  useClassicalBoard: boolean;
  setUseClassicalBoard: React.Dispatch<React.SetStateAction<boolean>>;
  useTrueNorth: boolean;
  setUseTrueNorth: React.Dispatch<React.SetStateAction<boolean>>;
  physicalMonthMode: "coupled" | "independent";
  setPhysicalMonthMode: React.Dispatch<
    React.SetStateAction<"coupled" | "independent">
  >;
  activeLayerMode: LayerMode;
  setActiveLayerMode: React.Dispatch<React.SetStateAction<LayerMode>>;
  directionFilterMode: string;
  setDirectionFilterMode: React.Dispatch<React.SetStateAction<string>>;
  heatmapMode: "none" | "30days" | "12months";
  toggleHeatmapMode: (mode: "30days" | "12months") => void;
  heatmapData: HeatmapColumn[];
  selectedTrendCell: TrendCell | null;
  setSelectedTrendCell: React.Dispatch<React.SetStateAction<TrendCell | null>>;
  focusedDirection: string | null;
  setFocusedDirection: React.Dispatch<React.SetStateAction<string | null>>;
  highlightDirection: string | null;
  moveTargetToDirection: (dir: string) => void;
  handleAutoSearch: () => void;
  isAutoSearching: boolean;
  physicalLayers: Layers | null;
  classicalLayers: Layers | null;
  honmeiStar: ReturnType<typeof getHonmeiStar> | null;
  geoData: GeomagneticData | null;
  spaceWeather: SpaceWeatherData | null;
  ansLoad: number;
  shieldCapacity: number;
  mapProperties: MapProperty[];
  showProperties: boolean;
  setShowProperties: React.Dispatch<React.SetStateAction<boolean>>;
  showOnlyNewBuild: boolean;
  setShowOnlyNewBuild: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesLoading: boolean;
  propertiesError: string | null;
  hudLayers: {
    terrain: boolean;
    weather: boolean;
    bio: boolean;
    hazard: boolean;
  };
  setHudLayers: React.Dispatch<
    React.SetStateAction<{
      terrain: boolean;
      weather: boolean;
      bio: boolean;
      hazard: boolean;
    }>
  >;
}

export default function DestinationMapPanel({
  lat,
  lon,
  baseTime,
  birthDate,
  evalDate,
  timeOffsetDays,
  setTimeOffsetDays,
  isPlaying,
  setIsPlaying,
  playSpeedDays,
  setPlaySpeedDays,
  targetLat,
  setTargetLat,
  targetLon,
  setTargetLon,
  targetElevation,
  setTargetElevation,
  targetDirInfo,
  targetDirection,
  targetVectorStatus,
  showMapPicker,
  setShowMapPicker,
  actionIntent,
  setActionIntent,
  useClassicalBoard,
  setUseClassicalBoard,
  useTrueNorth,
  setUseTrueNorth,
  physicalMonthMode,
  setPhysicalMonthMode,
  activeLayerMode,
  setActiveLayerMode,
  directionFilterMode,
  setDirectionFilterMode,
  heatmapMode,
  toggleHeatmapMode,
  heatmapData,
  selectedTrendCell,
  setSelectedTrendCell,
  focusedDirection,
  setFocusedDirection,
  highlightDirection,
  moveTargetToDirection,
  handleAutoSearch,
  isAutoSearching,
  physicalLayers,
  classicalLayers,
  honmeiStar,
  geoData,
  spaceWeather,
  ansLoad,
  shieldCapacity,
  mapProperties,
  showProperties,
  setShowProperties,
  showOnlyNewBuild,
  setShowOnlyNewBuild,
  propertiesLoading,
  propertiesError,
  hudLayers,
  setHudLayers,
}: DestinationMapPanelProps) {
  /*
    升目の詳細を Esc で閉じる。画面ぜんぶを覆うモーダルなので、閉じ方が
    × だけだと逃げ場が無い。timing のヒートマップの吹き出しと同じ閉じ方に
    そろえる（外側を押す側は覆いの onClick で受ける）。
  */
  React.useEffect(() => {
    if (!selectedTrendCell) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedTrendCell(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedTrendCell, setSelectedTrendCell]);

  return (
    <div className="w-full flex flex-col items-center space-y-8 mt-8">
      <div className="w-full max-w-[1700px] mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* Spatial Targeting */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div className="flex items-center gap-2 mb-1 border-b border-stone-200 pb-2">
            <span className="text-emerald-500 animate-pulse">▶</span>
            <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest">
              目的地の方位を評価する
            </h3>
          </div>
          <p className="text-[10px] text-stone-600 mb-4 h-8 mt-1">
            目的地の方位の吉凶を、行動の目的（引越し・療養など）に合わせて評価します。
          </p>
          <div className="flex flex-col gap-3 mt-auto">
            {/* 狭い画面では select が幅を取り、左の説明文が 1 文字ずつに
                      折り返される（375px の実測で幅 42px）。縦に積む。 */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-white/70 p-2 border border-stone-200 rounded-xl">
              <div className="flex flex-col min-w-0">
                <label className="text-[10px] font-bold text-stone-700">
                  行動の目的
                </label>
                <span className="text-[10px] text-stone-600">
                  行動の性質により吉凶の計算結果が変わります
                </span>
              </div>
              <select
                value={actionIntent}
                onChange={(e) =>
                  /*
                    ここは cast のまま。下の option が DEFAULT / REST /
                    BUSINESS / MIGRATION の 4 つだけなので、他の値は来ない。
                    parseActionIntent に替えると ephemerisEngine を**値として**
                    import することになり、この client コンポーネントの
                    バンドルに判定エンジンが丸ごと乗る（#177〜#179 で
                    重い依存を遅延させた経緯がある）。
                  */
                  setActionIntent(e.target.value as ActionIntent)
                }
                className="bg-transparent text-emerald-600 font-bold text-[10px] outline-none cursor-pointer text-right"
              >
                <option value="DEFAULT">DEFAULT (通常行動)</option>
                <option value="REST">REST (回復・静養)</option>
                <option value="BUSINESS">BUSINESS (事業・拡張)</option>
                <option value="MIGRATION">MIGRATION (引越し・長期滞在)</option>
              </select>
            </div>

            <div className="flex justify-between items-center bg-white/70 p-2 border border-stone-200 rounded-xl mt-1">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-stone-700">
                  目標日
                </label>
                <span className="text-[10px] text-stone-600">
                  評価する目標日を指定します
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoSearch}
                  disabled={isAutoSearching}
                  className="text-[9px] text-emerald-600 border border-emerald-200 bg-emerald-50 px-2 py-1 rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                >
                  {isAutoSearching ? "検索中..." : "自動検索"}
                </button>
                <input
                  type="date"
                  value={`${evalDate.getFullYear()}-${String(evalDate.getMonth() + 1).padStart(2, "0")}-${String(evalDate.getDate()).padStart(2, "0")}`}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const selectedDate = new Date(e.target.value);
                    const base = baseTime || new Date();
                    selectedDate.setHours(12, 0, 0, 0);
                    const baseCopy = new Date(base.getTime());
                    baseCopy.setHours(12, 0, 0, 0);
                    const diffDays = Math.round(
                      (selectedDate.getTime() - baseCopy.getTime()) / 86400000,
                    );
                    setTimeOffsetDays(diffDays);
                  }}
                  className="w-24 bg-transparent text-emerald-600 font-bold text-[10px] outline-none cursor-pointer text-right [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="flex justify-between items-center mt-1 gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-white/70 p-0.5 border border-stone-200 rounded-xl">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border ${isPlaying ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.2)]" : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-50 shadow-[0_0_8px_rgba(59,130,246,0.2)]"}`}
                >
                  {isPlaying ? "⏸ 一時停止" : "▶ 再生"}
                </button>
                <select
                  value={playSpeedDays}
                  onChange={(e) => setPlaySpeedDays(Number(e.target.value))}
                  disabled={isPlaying}
                  className="bg-transparent text-stone-500 text-[10px] font-mono outline-none cursor-pointer"
                >
                  <option value={1}>1D/tick</option>
                  <option value={7}>1W/tick</option>
                  <option value={30}>1M/tick</option>
                  <option value={365}>1Y/tick</option>
                </select>
              </div>
              <div className="flex justify-end gap-1 flex-wrap items-center">
                <button
                  onClick={() => setTimeOffsetDays((prev) => prev - 1)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"
                  title="Previous Day"
                >
                  ◀
                </button>
                <button
                  onClick={() => setTimeOffsetDays((prev) => prev + 1)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"
                  title="Next Day"
                >
                  ▶
                </button>
                <div className="w-px h-3 bg-stone-100 my-auto mx-0.5"></div>
                <button
                  onClick={() => setTimeOffsetDays(0)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border ${timeOffsetDays === 0 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                >
                  TODAY
                </button>
                <button
                  onClick={() => setTimeOffsetDays(30)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border ${timeOffsetDays === 30 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                >
                  +30D
                </button>
                <button
                  onClick={() => setTimeOffsetDays(90)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border ${timeOffsetDays === 90 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                >
                  +90D
                </button>
                <button
                  onClick={() => setTimeOffsetDays(180)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border ${timeOffsetDays === 180 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                >
                  +180D
                </button>
                <button
                  onClick={() => setTimeOffsetDays(365)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-xl transition-colors border ${timeOffsetDays === 365 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-600 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                >
                  +1Y
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 bg-white/70 p-2 border border-stone-200 rounded-xl mt-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-stone-600 uppercase tracking-widest flex items-center gap-1">
                  目的地座標{" "}
                  <span className="text-[9px] text-stone-600">緯度/経度</span>
                </label>
                <button
                  onClick={() => setShowMapPicker(!showMapPicker)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showMapPicker ? "bg-emerald-500/20 text-emerald-600 border-emerald-200" : "bg-stone-100 text-stone-500 border-stone-300 hover:bg-stone-200"}`}
                >
                  [ 地図検索 ]
                </button>
              </div>
              {showMapPicker && (
                <div className="w-full h-48 sm:h-64 mt-1 mb-1 animate-fade-in z-20">
                  <LocationPickerInner
                    initialLat={targetLat || lat}
                    initialLon={targetLon || lon}
                    onSelect={(newLat: number, newLon: number) => {
                      setTargetLat(Number(newLat.toFixed(5)));
                      setTargetLon(Number(newLon.toFixed(5)));
                    }}
                  />
                </div>
              )}
              <div className="w-full relative z-10 flex gap-1 mb-1">
                <input
                  type="text"
                  placeholder="座標またはGoogleマップのURLを貼り付け... (例: 35.68, 139.76)"
                  className="flex-1 bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-xs px-2 py-1.5 rounded-xl outline-none transition-colors"
                  onChange={(e) => {
                    const val = e.target.value;
                    // Google Mapsの "@lat,lon" と、コピーした単なる "lat,lon" の両方に対応
                    const match = val.match(
                      /(?:@|^|\s)(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
                    );
                    if (match) {
                      setTargetLat(Number(parseFloat(match[1]).toFixed(5)));
                      setTargetLon(Number(parseFloat(match[2]).toFixed(5)));
                      e.target.value = ""; // clear upon success
                    }
                  }}
                />
              </div>
              <div className="flex gap-2 relative z-10 mt-1">
                <input
                  type="number"
                  placeholder="緯度"
                  value={targetLat ?? ""}
                  onChange={(e) =>
                    setTargetLat(e.target.value ? Number(e.target.value) : null)
                  }
                  className="bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-sm px-2 py-1 rounded-xl outline-none w-1/3 transition-colors font-mono"
                />
                <input
                  type="number"
                  placeholder="経度"
                  value={targetLon ?? ""}
                  onChange={(e) =>
                    setTargetLon(e.target.value ? Number(e.target.value) : null)
                  }
                  className="bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-sm px-2 py-1 rounded-xl outline-none w-1/3 transition-colors font-mono"
                />
                <input
                  type="number"
                  placeholder="標高(m)"
                  value={targetElevation ?? ""}
                  onChange={(e) =>
                    setTargetElevation(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-sm px-2 py-1 rounded-xl outline-none w-1/3 transition-colors font-mono"
                />
              </div>
              {targetLat !== null && targetLon !== null && (
                <div className="flex gap-2 relative z-10 mt-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${targetLat},${targetLon}`,
                      );
                      alert(
                        "座標をコピーしました: " + `${targetLat},${targetLon}`,
                      );
                    }}
                    className="flex-1 bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 border border-stone-300 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-xl transition-colors"
                  >
                    📋 座標をコピー
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-800/50 border border-blue-800/50 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-xl transition-colors text-center block"
                  >
                    🗺️ Googleマップで開く
                  </a>
                </div>
              )}{" "}
              {targetDirInfo && targetVectorStatus && (
                <div
                  className={`mt-1 text-[10px] font-mono p-1 border rounded-xl flex items-center justify-between gap-2 ${
                    targetVectorStatus.startsWith("NOISE_VOID")
                      ? "bg-stone-50 border-stone-200 text-stone-600 repeating-linear-gradient-45"
                      : targetVectorStatus.startsWith("NOISE_NODE")
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : targetVectorStatus.startsWith("NOISE")
                          ? "bg-red-500/10 border-red-200 text-red-600"
                          : targetVectorStatus === "OPTIMAL" ||
                              targetVectorStatus === "OPTIMAL_REGULAR"
                            ? "bg-emerald-500/10 border-emerald-200 text-emerald-600"
                            : "bg-blue-500/10 border-blue-200 text-blue-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold border px-1 ${useTrueNorth ? "text-emerald-600 border-emerald-200" : "text-stone-600 border-stone-300"}`}
                      title="真北基準"
                    >
                      真北: {targetDirInfo.trueDirection}
                    </span>
                    <span
                      className={`font-bold border px-1 ${!useTrueNorth ? "text-emerald-600 border-emerald-200" : "text-stone-600 border-stone-300"}`}
                      title="磁北基準"
                    >
                      磁北: {targetDirInfo.magneticDirection}
                    </span>
                    <span>{targetVectorStatus}</span>
                    {(() => {
                      const currentTendo =
                        classicalLayers?.tendoDirection ||
                        physicalLayers?.tendoDirection;
                      const isTargetTendo =
                        currentTendo &&
                        (targetDirInfo.magneticDirection === currentTendo ||
                          targetDirInfo.trueDirection === currentTendo);
                      if (!isTargetTendo) return null;
                      return (
                        <span
                          className="text-[9px] text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded bg-amber-500/20 font-bold font-mono shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse cursor-help"
                          title="【天道回座】目標方位に暦上の最高吉神・天道が巡っています。凶殺やノイズが相殺・大吉補正されます。"
                        >
                          ✨天道回座中
                        </span>
                      );
                    })()}
                    {targetDirInfo.trueDirection !==
                      targetDirInfo.magneticDirection && (
                      <span
                        className="text-[9px] text-amber-700 border border-amber-200 px-1 py-0.5 rounded bg-amber-50 animate-pulse cursor-help font-bold font-mono"
                        title="【境界線偏角アラート】真北と磁北で判定する方位セクターが異なっています。基準北トグルの切り替えにより方位評価が変化します。"
                      >
                        ⚠️偏角ズレ
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-70">TARGET EVAL</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COMMANDER'S BRIEFING HUD (Moved up to side-by-side with targeting) */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-stone-200 p-4 rounded-xl shadow-lg relative overflow-hidden h-full flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-center gap-2 mb-1 border-b border-stone-200 pb-2">
              <span className="text-stone-600 animate-pulse">◆</span>
              <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest">
                ゾーン分類{" "}
                <span className="text-[9px] text-stone-600 font-normal ml-1">
                  / 空間分類
                </span>
              </h3>
            </div>
            <div className="flex flex-col gap-1.5 mb-2 bg-white/70 p-2.5 rounded-xl border border-stone-200 shadow-inner">
              <div className="text-[9px] text-stone-600 font-mono flex justify-between items-center border-b border-stone-200 pb-1">
                <span>基準地</span>
                <span className="text-stone-600 font-bold">
                  {lat?.toFixed(4)}N, {lon?.toFixed(4)}E
                </span>
              </div>
              <div className="text-[9px] text-stone-600 font-mono flex justify-between items-center border-b border-stone-200 pb-1">
                <span>目標日</span>
                <span className="text-emerald-600 font-bold">
                  {evalDate.toLocaleDateString()}{" "}
                  <span className="text-stone-600 font-normal ml-1">
                    (
                    {timeOffsetDays > 0 ? `+${timeOffsetDays}` : timeOffsetDays}
                    d)
                  </span>
                </span>
              </div>
              <div className="text-[9px] text-stone-600 font-mono flex justify-between items-center">
                <span>本命星</span>
                <span className="text-purple-600 font-bold">
                  {honmeiStar
                    ? `本命星 ${useClassicalBoard ? honmeiStar.classical : honmeiStar.physical}`
                    : "Unset"}{" "}
                  <span className="text-stone-600 font-normal ml-1">
                    ({birthDate.split("T")[0]})
                  </span>
                </span>
              </div>
            </div>
            <div className="flex-1 mt-2 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
              {(() => {
                const renderZone = (
                  fv: Partial<Record<Direction, string>> | null | undefined,
                  title: string,
                  subtitle: string,
                  badgeColor: string,
                ) => {
                  if (!fv) return null;
                  const allDirs = [
                    "N",
                    "NE",
                    "E",
                    "SE",
                    "S",
                    "SW",
                    "W",
                    "NW",
                  ] as const;
                  const map: Record<string, string> = {
                    N: "北",
                    NE: "北東",
                    E: "東",
                    SE: "南東",
                    S: "南",
                    SW: "南西",
                    W: "西",
                    NW: "北西",
                  };

                  return (
                    <div className="flex flex-col gap-2">
                      <div
                        className={`text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 ${badgeColor}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                        {title}{" "}
                        <span className="text-[10px] opacity-70 font-normal">
                          {subtitle}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {allDirs.map((dir) => {
                          const val = fv[dir];
                          let bgClass =
                            "bg-blue-50 border-blue-200 text-blue-600";
                          let statusLabel = "SAFE";

                          if (val === "OPTIMAL") {
                            bgClass =
                              "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.15)]";
                            statusLabel = "GO";
                          } else if (val === "OPTIMAL_REGULAR") {
                            bgClass =
                              "bg-emerald-50 border-emerald-600/30 text-emerald-400/80";
                            statusLabel = "OK";
                          } else if (val === "WARNING") {
                            bgClass =
                              "bg-orange-50 border-orange-200 text-orange-600";
                            statusLabel = "WARN";
                          } else if ((val || "").startsWith("NOISE")) {
                            bgClass =
                              "bg-red-50 border-red-200 text-red-400/60";
                            statusLabel = "ALERT";
                          }

                          const isTarget =
                            targetDirInfo &&
                            targetDirInfo.magneticDirection === dir;

                          return (
                            <div
                              key={dir}
                              className={`border p-1.5 rounded flex flex-col items-center justify-center text-center transition-all duration-300 ${
                                isTarget
                                  ? "ring-1.5 ring-emerald-400/70 scale-[1.03] border-emerald-400 z-10 shadow-[0_0_12px_rgba(52,211,153,0.35)] font-bold"
                                  : "hover:scale-[1.02] hover:bg-opacity-80"
                              } ${bgClass}`}
                            >
                              <div className="flex items-center gap-0.5">
                                {isTarget && (
                                  <span className="text-[10px] animate-pulse">
                                    🎯
                                  </span>
                                )}
                                <span className="text-[10px] font-bold tracking-wider">
                                  {map[dir]}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono opacity-80 mt-0.5 whitespace-nowrap">
                                {statusLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                };

                return (() => {
                  let physVectors, classVectors;
                  let titleSuffix = "統合（年・月・日）";

                  if (activeLayerMode === "year") {
                    physVectors = physicalLayers?.yearLayer;
                    classVectors = classicalLayers?.yearLayer;
                    titleSuffix = "年盤";
                  } else if (activeLayerMode === "month") {
                    physVectors = physicalLayers?.monthLayer;
                    classVectors = classicalLayers?.monthLayer;
                    titleSuffix = "月盤";
                  } else if (activeLayerMode === "day") {
                    physVectors = physicalLayers?.dayLayer;
                    classVectors = classicalLayers?.dayLayer;
                    titleSuffix = "日盤";
                  } else {
                    physVectors = physicalLayers?.finalVectors;
                    classVectors = classicalLayers?.finalVectors;
                  }

                  return (
                    <div className="flex flex-col gap-4">
                      <div
                        className={`transition-all duration-300 ${!useClassicalBoard ? "opacity-100" : "opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none"}`}
                      >
                        {renderZone(
                          physVectors,
                          `天体位相 — ${titleSuffix}`,
                          "(天体位相・物理基準)",
                          "text-emerald-500",
                        )}
                      </div>
                      <div className="h-px bg-stone-100/80 w-full my-1"></div>
                      <div
                        className={`transition-all duration-300 ${useClassicalBoard ? "opacity-100" : "opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none"}`}
                      >
                        {renderZone(
                          classVectors,
                          `暦基準 — ${titleSuffix}`,
                          "(節切り・暦基準)",
                          "text-stone-500",
                        )}
                      </div>
                    </div>
                  );
                })();
              })()}
            </div>
          </div>
        </div>

        {/* FULL-WIDTH TREND ANALYTICS SECTION (spans both columns of the grid) */}
        <div className="w-full max-w-[1700px] md:col-span-2 bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rose-100/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-rose-500 font-bold text-base">◆</span>
              <h3 className="text-base font-bold font-serif text-stone-900 flex flex-wrap items-center gap-2">
                時期の傾向
                <span className="text-[10px] bg-amber-500/10 text-amber-600 border border-amber-300 px-2.5 py-0.5 rounded-full font-sans font-semibold whitespace-nowrap">
                  ✨ 天道・時空補正可視化済
                </span>
              </h3>
            </div>

            {/* Range Mode & Multi-Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/80 text-xs font-semibold">
                <button
                  onClick={() => toggleHeatmapMode("30days")}
                  className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                    heatmapMode === "30days"
                      ? "bg-rose-500 text-stone-900 shadow-xs font-bold"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  30日
                </button>
                <button
                  onClick={() => toggleHeatmapMode("12months")}
                  className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                    heatmapMode === "12months"
                      ? "bg-rose-500 text-stone-900 shadow-xs font-bold"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  12ヶ月
                </button>
              </div>

              {/* Multi-combination filtering presets */}
              <div className="flex items-center gap-1.5 bg-rose-50/60 border border-rose-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => {
                    setDirectionFilterMode((prev) =>
                      prev === "optimal_only" ? "composite" : "optimal_only",
                    );
                  }}
                  className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                    directionFilterMode === "optimal_only"
                      ? "bg-gradient-to-r from-amber-400 via-amber-500 to-rose-400 text-stone-900 font-bold shadow-md shadow-amber-200 scale-105"
                      : "bg-white text-stone-700 hover:bg-stone-50 border border-stone-200/80"
                  }`}
                  title="大吉・吉方位日をゴールド強調表示（他の色も保持）"
                >
                  <span>🌟 大吉絞込</span>
                </button>
                <button
                  onClick={() => {
                    setDirectionFilterMode((prev) =>
                      prev === "exclude_noise" ? "composite" : "exclude_noise",
                    );
                  }}
                  className={`px-3 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                    directionFilterMode === "exclude_noise"
                      ? "bg-stone-800 text-stone-900 font-bold shadow-xs"
                      : "bg-white text-stone-700 hover:bg-stone-50 border border-stone-200/80"
                  }`}
                  title="五黄・暗剣・歳破などの大凶をグレー（✕）で除外表示。他の判定色はそのまま"
                >
                  <span>🛡️ 凶除外</span>
                </button>
              </div>
            </div>
          </div>

          {heatmapMode !== "none" && heatmapData.length > 0 && (
            <div className="mt-3 bg-white/70 p-4 border border-rose-100/80 rounded-2xl overflow-x-auto shadow-inner space-y-4">
              {/* Monthly Timeline Player Control Toolbar */}
              <div className="bg-white/90 border border-stone-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (isPlaying && playSpeedDays === 30) {
                        setIsPlaying(false);
                      } else {
                        setPlaySpeedDays(30);
                        setIsPlaying(true);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-all border cursor-pointer ${
                      isPlaying && playSpeedDays === 30
                        ? "bg-rose-500 text-stone-900 border-rose-600 shadow-md shadow-rose-200 animate-pulse"
                        : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    {isPlaying && playSpeedDays === 30
                      ? "⏸ 月次コマ送り一時停止"
                      : "▶ 月次自動再生"}
                  </button>

                  <button
                    onClick={() => setTimeOffsetDays((prev) => prev - 30)}
                    className="px-2.5 py-1.5 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
                    title="1ヶ月巻き戻し"
                  >
                    ◀ 前月
                  </button>
                  <button
                    onClick={() => setTimeOffsetDays((prev) => prev + 30)}
                    className="px-2.5 py-1.5 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-xl cursor-pointer"
                    title="1ヶ月コマ送り"
                  >
                    次月 ▶
                  </button>
                  <button
                    onClick={() => setTimeOffsetDays(0)}
                    className="px-2.5 py-1.5 bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 rounded-xl cursor-pointer font-bold"
                    title="現在月へリセット"
                  >
                    RESET
                  </button>
                </div>

                {/* Live Snapshot Header */}
                <div className="flex items-center gap-2 text-stone-600 bg-white px-3 py-1.5 rounded-xl border border-stone-200 font-medium">
                  <span>
                    📅 表示中:{" "}
                    <strong className="text-rose-600 font-bold">
                      {evalDate.getFullYear()}年{evalDate.getMonth() + 1}月
                    </strong>
                  </span>
                  <span className="text-stone-300">|</span>
                  <span className="text-amber-600 font-bold">
                    ✨ 月の天道:{" "}
                    {(() => {
                      const currentTendo =
                        classicalLayers?.tendoDirection ||
                        physicalLayers?.tendoDirection;
                      const mapDir: Record<string, string> = {
                        N: "北",
                        NE: "北東",
                        E: "東",
                        SE: "南東",
                        S: "南",
                        SW: "南西",
                        W: "西",
                        NW: "北西",
                      };
                      return currentTendo
                        ? `${mapDir[currentTendo] || currentTendo} (${currentTendo})`
                        : "未算出";
                    })()}
                  </span>
                </div>
              </div>

              {/* 地図との連動状態。
                        ヒートマップは 8 方位を等しく並べているだけなので、
                        地図で選んだ目的地がどの行なのかをここで結び付ける。 */}
              <div className="bg-white/90 border border-indigo-100 px-3 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[10px]">
                {targetDirection ? (
                  <span className="flex items-center gap-1.5 text-stone-600">
                    <span>📍</span>
                    <span>
                      地図の目的地は{" "}
                      <strong className="text-indigo-700 font-mono">
                        {targetDirection}
                      </strong>{" "}
                      方位（{useTrueNorth ? "真北" : "磁北"}
                      基準）。同じ行に印を付けています。
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-700">
                    目的地が未設定です。下の「目的地座標」か地図で地点を選ぶと、対応する方位の行に印が付きます。
                  </span>
                )}
                {focusedDirection && (
                  <button
                    onClick={() => setFocusedDirection(null)}
                    className="px-2 py-1 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors"
                    title="地図の強調表示を目的地の方位に戻す"
                  >
                    {focusedDirection} を強調中 — 解除
                  </button>
                )}
              </div>

              {/* Heatmap Grid Table */}
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-stone-100/80">
                    <th className="p-2 border border-stone-200 text-[10px] font-mono text-stone-600 font-bold w-10 bg-stone-100 sticky left-0 z-10">
                      DIR
                    </th>
                    {heatmapData.map((d, i) => {
                      // 地図が描いているのは先頭列だけ。
                      // ここは以前 ±15 日を色付けしていたため、30 列のうち
                      // 前半 16 列が同じ色になり、「地図と同じ日はどれか」が
                      // 分からなかった（地図と連動していないように見える原因）。
                      // 30 日表示の先頭列は、地図が描いている当日そのもの。
                      // 12 ヶ月表示では地図も年盤+月盤へ自動で切り替えるため、
                      // 先頭列の節月と同じ判定を描く。
                      const isActiveCol = i === 0;
                      return (
                        <th
                          key={i}
                          className={`p-1.5 border border-stone-200 text-[9px] font-mono whitespace-nowrap cursor-pointer hover:bg-rose-50 transition-colors ${
                            isActiveCol
                              ? "text-rose-600 bg-rose-50 font-bold border-rose-300"
                              : d.isVoid
                                ? "text-stone-500 bg-amber-500/10"
                                : "text-stone-600 bg-white"
                          }`}
                          onClick={() => setTimeOffsetDays(d.offsetDays)}
                          title={
                            isActiveCol
                              ? heatmapMode === "12months"
                                ? "地図はこの節月（年盤+月盤）を表示しています"
                                : "地図はこの日（年盤+月盤+日盤）を表示しています"
                              : heatmapMode === "12months"
                                ? "クリックでこの節月へ移動（地図も年盤+月盤で切り替わります）"
                                : "クリックでこの日に移動（地図もこの日に切り替わります）"
                          }
                        >
                          {isActiveCol && (
                            <span className="block text-[10px] leading-none text-rose-500">
                              地図
                            </span>
                          )}
                          {d.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const).map(
                    (dir) => (
                      <tr
                        key={dir}
                        className={
                          highlightDirection === dir
                            ? "ring-2 ring-indigo-400/70"
                            : ""
                        }
                      >
                        <td
                          className={`p-1.5 border border-stone-200 text-[10px] font-mono font-bold sticky left-0 z-10 shadow-xs cursor-pointer transition-colors ${
                            highlightDirection === dir
                              ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                              : "bg-stone-50 text-stone-800 hover:bg-indigo-50"
                          }`}
                          title={
                            targetDirection === dir
                              ? "地図で選んだ目的地の方位です。クリックで地図の強調表示を切り替えます"
                              : "クリックするとこの方位を地図上で強調します"
                          }
                          onClick={() =>
                            setFocusedDirection((prev) =>
                              prev === dir ? null : dir,
                            )
                          }
                        >
                          <span className="flex items-center justify-center gap-0.5">
                            {targetDirection === dir && (
                              <span
                                className="text-[9px]"
                                title="地図で選んだ目的地の方位"
                              >
                                📍
                              </span>
                            )}
                            {dir}
                          </span>
                        </td>
                        {heatmapData.map((d, i) => {
                          const st = d.vectors[dir];
                          // 天道が無い列では undefined になっていた。使い道は
                          // 3 か所とも真偽の分岐なので結果は変わらないが、
                          // 押した升目に控える値なので boolean に寄せる。
                          const isTendoActive =
                            !!d.tendoDir && d.tendoDir === dir;
                          // 見出しと同じく、地図が描いている 1 日だけを指す。
                          const isActiveCol = i === 0;
                          const isLuckyFilter =
                            directionFilterMode === "optimal_only";
                          const isExcludeFilter =
                            directionFilterMode === "exclude_noise";
                          const isOptimal =
                            st === "OPTIMAL" || st === "OPTIMAL_REGULAR";
                          const isMajorNoise =
                            st?.startsWith("NOISE_GOU") ||
                            st?.startsWith("NOISE_ANKEN") ||
                            st === "NOISE_HA";
                          // 凶除外モードでは大凶セルを消さずグレーで「除外済み」と明示する
                          const isExcluded = isExcludeFilter && isMajorNoise;

                          let bgClass = "bg-stone-50/50 text-stone-600";
                          if (isExcluded) {
                            bgClass =
                              "bg-stone-300/70 text-stone-500 line-through opacity-70";
                          } else if (isOptimal) {
                            bgClass = isTendoActive
                              ? "bg-gradient-to-br from-amber-400 via-emerald-400 to-amber-500 text-stone-950 font-bold border-2 border-amber-300 ring-2 ring-amber-400 shadow-md shadow-amber-200/50 scale-105 z-10"
                              : "bg-emerald-500 text-stone-900 font-bold shadow-xs border border-emerald-400";
                          } else if (st === "SAFE") {
                            bgClass = isLuckyFilter
                              ? "bg-blue-100/70 text-blue-700"
                              : "bg-blue-100 text-blue-800 font-medium";
                          } else if (isMajorNoise) {
                            bgClass = isLuckyFilter
                              ? "bg-rose-100/70 text-rose-700"
                              : "bg-rose-500 text-stone-900 font-semibold";
                          } else if (
                            st?.startsWith("NOISE_HONMEI") ||
                            st?.startsWith("NOISE_TEKI") ||
                            st?.startsWith("NOISE_GETSUMEI") ||
                            st?.startsWith("NOISE_GETSUTEKI")
                          ) {
                            bgClass = isLuckyFilter
                              ? "bg-purple-100/70 text-purple-700"
                              : "bg-purple-600 text-white font-medium";
                          } else if (
                            st?.startsWith("NOISE_VOID") ||
                            st?.startsWith("NOISE_NODE")
                          ) {
                            bgClass = isLuckyFilter
                              ? "bg-amber-100/70 text-amber-800"
                              : "bg-amber-400 text-amber-950 font-medium";
                          } else if (st === "WARNING") {
                            bgClass = isLuckyFilter
                              ? "bg-orange-100/70 text-orange-800"
                              : "bg-orange-400 text-stone-900 font-medium";
                          }

                          if (isActiveCol && !isOptimal) {
                            bgClass += " ring-1 ring-rose-400/60";
                          }

                          const tendoNote = isTendoActive
                            ? "✨【天道回座中】月の最高吉神・天道の作用により凶殺が補正・相殺されています"
                            : "";

                          return (
                            <td
                              key={i}
                              className={`p-1 border border-stone-200 cursor-pointer hover:scale-110 transition-all ${bgClass}`}
                              title={`${d.label} 方位${dir}: ${st}${isExcluded ? " ／ 大凶のため除外対象" : ""} ${tendoNote} (クリックで層詳細・根拠表示)`}
                              onClick={() => {
                                setTimeOffsetDays(d.offsetDays);
                                // 押した方位を地図でも強調する。
                                // 日付は既に地図のベクトルへ反映されていたが、
                                // 方位は連動しておらず、どのセルを見ているのか
                                // 地図側から分からなかった。
                                setFocusedDirection(dir);
                                setSelectedTrendCell({
                                  label: d.label,
                                  dir,
                                  status: st,
                                  isTendo: isTendoActive,
                                  raw: d.rawVectorData,
                                  tendoDir: d.tendoDir,
                                  offsetDays: d.offsetDays,
                                });
                              }}
                            >
                              <div className="w-6 h-6 mx-auto flex items-center justify-center text-[10px]">
                                {isExcluded ? (
                                  <span className="text-[10px]">✕</span>
                                ) : isTendoActive ? (
                                  <span className="text-[11px] drop-shadow-xs">
                                    ✨
                                  </span>
                                ) : isOptimal ? (
                                  <span className="text-[10px]">★</span>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>

              {heatmapMode === "12months" && (
                <p className="mt-3 text-center text-[9px] text-stone-500 leading-relaxed">
                  12ヶ月表示は<b>節入り基準の月</b>
                  （暦の1日ではなく立春・啓蟄などで替わる月）で刻み、「その月の傾向」を見るため
                  <b>日盤を含めずに年盤＋月盤で判定</b>
                  しています。地図も自動的に年盤＋月盤へ切り替わり、先頭列と同じ判定を表示します。
                </p>
              )}

              {/* Legend Bar */}
              <div className="flex gap-3 mt-3 text-[9px] font-mono text-stone-500 justify-center flex-wrap">
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <span className="text-amber-600 font-bold">✨</span> 天道
                  (Tendou) 回座
                </span>
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <div className="w-2 h-2 bg-emerald-500/80"></div> OPTIMAL
                  (大吉)
                </span>
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <div className="w-2 h-2 bg-blue-500/20 border border-stone-300"></div>{" "}
                  SAFE (吉)
                </span>
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <div className="w-2 h-2 bg-red-500/80"></div> TYPE I
                  (Gou/Anken/Ha)
                </span>
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <div className="w-2 h-2 bg-purple-500/80"></div> TYPE II (Bio)
                </span>
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <div className="w-2 h-2 bg-amber-500/80"></div> VOID/NODE
                </span>
                <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                  <div className="w-2 h-2 bg-orange-500/80"></div> WARNING
                </span>
                {directionFilterMode === "exclude_noise" && (
                  <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-300">
                    <div className="w-2 h-2 bg-stone-300"></div> ✕ 除外
                    (五黄・暗剣・歳破)
                  </span>
                )}
                {directionFilterMode === "optimal_only" && (
                  <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-amber-300">
                    🌟 大吉絞込中: OPTIMAL 以外は淡色化
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trend Cell Detail Breakdown Modal */}
          {selectedTrendCell && (
            /*
              画面ぜんぶを覆うので、閉じ方を × だけにしない。外側を押すか
              Esc で閉じる。timing のヒートマップの吹き出しと**同じ閉じ方**に
              そろえる（同じ「升目を押す」操作なのに、片方は Esc で閉じて
              片方は閉じない、という食い違いだった）。

              形は寄せない。ここは層ごとの根拠まで入るのでモーダルが要り、
              timing は日付と段階だけなので押した升目のそばに出るほうが
              読みやすい。中身の量が違う。
            */
            <div
              role="dialog"
              aria-modal="true"
              onClick={() => setSelectedTrendCell(null)}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150"
            >
              <div
                /* 中身を押しても閉じない。押した先が中身か外かで分ける */
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-sm bg-white border border-stone-300 rounded-2xl p-5 text-stone-900 shadow-2xl space-y-3.5"
              >
                <button
                  onClick={() => setSelectedTrendCell(null)}
                  className="absolute top-3.5 right-3.5 text-stone-500 hover:text-stone-900 p-1 text-sm font-bold"
                >
                  ✕
                </button>

                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl border ${selectedTrendCell.isTendo ? "bg-amber-500/20 text-amber-600 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]" : "bg-indigo-500/20 text-indigo-600 border-indigo-200"}`}
                  >
                    <span className="text-xl">
                      {selectedTrendCell.isTendo ? "✨" : "🎯"}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-stone-800 flex items-center gap-2">
                      {selectedTrendCell.label} 【方位: {selectedTrendCell.dir}
                      】
                    </h3>
                    <p className="text-[11px] text-stone-500 font-mono">
                      総合判定:{" "}
                      <strong className="text-emerald-600 font-bold">
                        {selectedTrendCell.status}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* 選んだセルから地図側を動かす導線。
                            ヒートマップで良い方位・良い時期を見つけても、
                            そこから目的地を設定する手段が無く、座標を手で
                            入れ直す必要があった。 */}
                <div className="flex flex-wrap items-center gap-2 bg-indigo-50/70 border border-indigo-100 rounded-xl px-3 py-2">
                  {targetDirection === selectedTrendCell.dir ? (
                    <span className="text-[10px] text-indigo-700 font-semibold flex items-center gap-1">
                      📍 現在の目的地はこの方位です
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        moveTargetToDirection(selectedTrendCell.dir)
                      }
                      className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      title={
                        targetLat !== null && targetLon !== null
                          ? "現在の目的地までの距離を保ったまま、この方位へ向きだけ変えます"
                          : "出発地から 50km の地点をこの方位に置きます"
                      }
                    >
                      この方位へ目的地を移す
                    </button>
                  )}
                  <span className="text-[9px] text-stone-500">
                    {targetLat !== null && targetLon !== null
                      ? "距離は保ったまま向きだけ変わります"
                      : "目的地が未設定のため、出発地から 50km の地点に置きます"}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs font-mono text-stone-600">
                  {selectedTrendCell.isTendo && (
                    <div className="bg-amber-50 border border-amber-500/60 p-3 rounded-xl text-amber-700 space-y-1">
                      <div className="font-bold text-amber-600 flex items-center gap-1.5">
                        <span>✨</span> 天道 (Tendou) 補正が適用されています
                      </div>
                      <p className="text-[10px] leading-relaxed text-amber-800">
                        この時期、<strong>{selectedTrendCell.dir} 方位</strong>{" "}
                        には暦上の最高吉神「天道」が回座しています。天道の強力な吉パワーにより、本命殺や月命殺等の個人の凶作用が相殺・補正され、総合判定として
                        <strong>大吉（OPTIMAL）</strong>へ昇格評価されています。
                      </p>
                    </div>
                  )}

                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-1.5">
                    <div className="font-bold text-stone-500 border-b border-stone-200 pb-1 text-[10px]">
                      レイヤー（層）別判定ブレイクダウン
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-stone-600">年盤 (Year):</span>
                      <span className="font-semibold text-stone-700">
                        {selectedTrendCell.raw?.yearLayer?.[
                          selectedTrendCell.dir
                        ] || "SAFE"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-stone-600">月盤 (Month):</span>
                      <span className="font-semibold text-stone-700">
                        {selectedTrendCell.raw?.monthLayer?.[
                          selectedTrendCell.dir
                        ] || "SAFE"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-stone-600">日盤 (Day):</span>
                      <span className="font-semibold text-stone-700">
                        {selectedTrendCell.raw?.dayLayer?.[
                          selectedTrendCell.dir
                        ] || "SAFE"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] pt-1 border-t border-stone-200">
                      <span className="text-stone-600">天道作用:</span>
                      <span
                        className={
                          selectedTrendCell.isTendo
                            ? "text-amber-600 font-bold"
                            : "text-stone-600"
                        }
                      >
                        {selectedTrendCell.isTendo
                          ? "✨ 回座中 (Active)"
                          : "対象外"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTrendCell(null)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl transition-colors cursor-pointer"
                >
                  了解
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Module 4: Tactical Magnetic Map */}
      <div className="w-full max-w-[1700px] mt-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 w-full gap-2">
          {/* Cyberpunk Filter Selector */}
          <div className="flex items-center gap-1.5 bg-stone-50 p-1 border border-stone-200 rounded-xl flex-wrap">
            <span className="text-[10px] font-mono text-stone-600 uppercase tracking-wider px-1">
              観点Filter:
            </span>
            <button
              onClick={() => setDirectionFilterMode("composite")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "composite"
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 shadow-[0_0_5px_rgba(16,185,129,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              🪐 総合判定
            </button>
            <button
              onClick={() => setDirectionFilterMode("kigaku_env")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "kigaku_env"
                  ? "bg-purple-50 text-purple-600 border-purple-200 shadow-[0_0_5px_rgba(168,85,247,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              👤+🌍 吉凶+環境
            </button>
            <button
              onClick={() => setDirectionFilterMode("kigaku_bazi")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "kigaku_bazi"
                  ? "bg-indigo-50 text-indigo-600 border-indigo-200 shadow-[0_0_5px_rgba(99,102,241,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              👤+☯ 吉凶+天中殺
            </button>
            <button
              onClick={() => setDirectionFilterMode("bazi_env")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "bazi_env"
                  ? "bg-amber-50 text-amber-600 border-amber-200 shadow-[0_0_5px_rgba(245,158,11,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              ☯+🌍 天中殺+環境
            </button>
            <button
              onClick={() => setDirectionFilterMode("personal_kigaku")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "personal_kigaku"
                  ? "bg-purple-50 text-purple-600 border-purple-200 shadow-[0_0_5px_rgba(168,85,247,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              👤 個人吉凶
            </button>
            <button
              onClick={() => setDirectionFilterMode("personal_bazi")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "personal_bazi"
                  ? "bg-amber-100 text-amber-800 border-amber-300 shadow-[0_0_5px_rgba(180,83,9,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              ☯ 個人天中殺
            </button>
            <button
              onClick={() => setDirectionFilterMode("environmental")}
              className={`px-2 py-0.5 text-[9px] font-mono rounded-xs transition-all border cursor-pointer ${
                directionFilterMode === "environmental"
                  ? "bg-rose-50 text-rose-600 border-rose-200 shadow-[0_0_5px_rgba(244,63,94,0.2)]"
                  : "bg-white/80 text-stone-500 border-transparent hover:border-stone-300"
              }`}
            >
              🌍 環境方位のみ
            </button>
          </div>

          <div className="flex flex-wrap gap-2 self-stretch md:self-auto justify-end">
            {/* 物件ピンの表示。押した人にだけ取りに行く（公開ホームなので
                      開いただけの人に 500 件を引かせない）。絞り込みは出して
                      から出す。空のものを絞り込む選択肢は見せない。 */}
            <button
              onClick={() => setShowProperties(!showProperties)}
              disabled={propertiesLoading}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors disabled:opacity-50 ${showProperties ? "bg-blue-500/20 text-blue-600 border-blue-200 hover:bg-blue-500/30" : "bg-zinc-500/20 text-stone-500 border-zinc-500/50 hover:bg-zinc-500/30"}`}
            >
              {propertiesLoading
                ? "物件を読み込み中…"
                : showProperties
                  ? `☑ 物件を地図に出す (${mapProperties.length})`
                  : "☐ 物件を地図に出す"}
            </button>
            {showProperties && (
              <button
                onClick={() => setShowOnlyNewBuild(!showOnlyNewBuild)}
                className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors ${showOnlyNewBuild ? "bg-emerald-500/20 text-emerald-600 border-emerald-200 hover:bg-emerald-500/30" : "bg-zinc-500/20 text-stone-500 border-zinc-500/50 hover:bg-zinc-500/30"}`}
              >
                {showOnlyNewBuild ? "☑ 新築のみ表示" : "☐ 全物件表示"}
              </button>
            )}
            {propertiesError && (
              <span className="px-2 py-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded">
                {propertiesError}
              </span>
            )}
            {!useClassicalBoard && (
              <button
                onClick={() =>
                  setPhysicalMonthMode(
                    physicalMonthMode === "independent"
                      ? "coupled"
                      : "independent",
                  )
                }
                className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-all bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50"
                title={
                  physicalMonthMode === "independent"
                    ? "物理独立型: 年盤は木星、月盤は太陽の位置から、それぞれ他方に依存せず独立して算出します。"
                    : "伝統連動型: 木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。"
                }
              >
                Month:{" "}
                {physicalMonthMode === "independent" ? "物理独立" : "伝統連動"}
              </button>
            )}
            <button
              onClick={() => setUseClassicalBoard(!useClassicalBoard)}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors ${useClassicalBoard ? "bg-zinc-500/20 text-stone-500 border-zinc-500/50 hover:bg-zinc-500/30" : "bg-emerald-500/20 text-emerald-600 border-emerald-200 hover:bg-emerald-500/30"}`}
            >
              Model:{" "}
              {useClassicalBoard
                ? "Classical (暦基準)"
                : "Physical (木星黄経基準)"}
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        {directionFilterMode !== "composite" && (
          <div
            className={`mb-3 p-2 border text-[10px] font-mono leading-tight flex items-start gap-2 ${
              directionFilterMode.includes("kigaku")
                ? "bg-purple-50 border-purple-200 text-purple-600"
                : directionFilterMode.includes("bazi")
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-rose-50 border-rose-200 text-rose-600"
            }`}
          >
            <span className="text-xs">⚠️</span>
            <div>
              {directionFilterMode === "kigaku_env" && (
                <>
                  <span className="font-bold">
                    【個人吉凶 ＋ 環境方位 複合表示】
                  </span>
                  本命星・月命星による吉凶および空間環境凶殺（五黄/暗剣/破）を合成してマッピングしています。
                </>
              )}
              {directionFilterMode === "kigaku_bazi" && (
                <>
                  <span className="font-bold">
                    【個人吉凶 ＋ 天中殺 複合表示】
                  </span>
                  九星気学の個人吉凶と四柱推命の天中殺（空亡）を重ね合わせてマッピングしています。
                </>
              )}
              {directionFilterMode === "bazi_env" && (
                <>
                  <span className="font-bold">
                    【個人天中殺 ＋ 環境方位 複合表示】
                  </span>
                  四柱推命の天中殺（空亡）と空間環境凶殺（五黄/暗剣/破）を重ね合わせてマッピングしています。
                </>
              )}
              {directionFilterMode === "personal_kigaku" && (
                <>
                  <span className="font-bold">【個人九星気学表示モード】</span>
                  本命星・月命星による吉凶方位のみをマッピングしています。
                </>
              )}
              {directionFilterMode === "personal_bazi" && (
                <>
                  <span className="font-bold">【個人天中殺表示モード】</span>
                  四柱推命の生年月日干支から算出される天中殺方位のみをマッピングしています。
                </>
              )}
              {directionFilterMode === "environmental" && (
                <>
                  <span className="font-bold">【環境方位表示モード】</span>
                  空間全体の定在波（五黄殺・暗剣殺）および「破」などの環境凶殺のみをマッピングしています。
                </>
              )}
            </div>
          </div>
        )}
        <TacticalMagneticMap
          lat={lat || 35.0116}
          lon={lon || 135.7681}
          declination={geoData?.declination || 0}
          inclination={geoData?.inclination || 0}
          intensity={geoData?.intensity || null}
          activeModel={useClassicalBoard ? "classical" : "physical"}
          physicalLayers={physicalLayers}
          classicalLayers={classicalLayers}
          honmeiStar={honmeiStar}
          kpIndex={spaceWeather?.kpIndex || null}
          ansLoad={ansLoad}
          shieldCapacity={shieldCapacity}
          hudLayers={hudLayers}
          toggleLayer={(layer: "terrain" | "weather" | "bio" | "hazard") =>
            setHudLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))
          }
          activeLayerMode={activeLayerMode}
          setActiveLayerMode={setActiveLayerMode}
          properties={
            !showProperties
              ? []
              : showOnlyNewBuild
                ? mapProperties.filter((p) => p.is_new_build)
                : mapProperties
          }
          useTrueNorth={useTrueNorth}
          setUseTrueNorth={setUseTrueNorth}
          targetLat={targetLat}
          targetLon={targetLon}
          onSelectTarget={(newLat, newLon) => {
            setTargetLat(Number(newLat.toFixed(5)));
            setTargetLon(Number(newLon.toFixed(5)));
            // 地図で選び直したらヒートマップ側の焦点も目的地に戻す。
            // 前に押したセルの方位が残っていると、地図とヒートマップで
            // 別々の方位が強調されたままになる。
            setFocusedDirection(null);
          }}
          highlightDirection={highlightDirection}
        />
      </div>

      {/* System Manual / Documentation */}
      <div className="w-full max-w-[1700px] mt-4">
        <details className="bg-white/80 border border-stone-200 rounded-xl p-4 group cursor-pointer">
          <summary className="text-[10px] sm:text-xs font-mono text-stone-500 uppercase tracking-widest flex items-center gap-2 outline-none">
            <span className="text-emerald-500 group-open:rotate-90 transition-transform">
              ▶
            </span>
            [ SYSTEM MANUAL ] 判定基準とモデル・ゾーンの仕様
          </summary>
          <div className="mt-4 text-xs sm:text-sm text-stone-600 font-mono leading-relaxed space-y-6 cursor-text">
            {/* Model Differences */}
            <div className="space-y-2">
              <h3 className="text-emerald-600 font-bold border-b border-stone-200 pb-1">
                ■ 演算モデルの違い (PHYSICAL vs CLASSICAL)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-white/80 p-3 border-l-2 border-emerald-500">
                  <div className="text-emerald-500 font-bold mb-1">
                    PHYSICAL MODEL (天体位相・物理基準)
                  </div>
                  <p className="text-stone-500 text-[10px] sm:text-xs">
                    天体の実際の位置（Swiss
                    Ephemeris）から方位を割り当てます。木星の黄経や太陽・月の位置を使うため、暦の区切りではなく天体の動きに沿って変わります。
                    <br />
                    <br />
                    <span className="text-stone-600">
                      向いている使い方:
                    </span>{" "}
                    日ごとの細かい変化を追いたいとき。暦の区切りで見る古典の盤と見比べたいとき。
                  </p>
                </div>
                <div className="bg-white/80 p-3 border-l-2 border-zinc-500">
                  <div className="text-stone-500 font-bold mb-1">
                    CLASSICAL MODEL (節切り・暦基準)
                  </div>
                  <p className="text-stone-500 text-[10px] sm:text-xs">
                    伝統的な九星気学や東洋占星術のカレンダーを使用。「立春」などの二十四節気を基準とし、過去数千年の統計データや解釈と完全に一致するルールベースのモデルです。
                    <br />
                    <br />
                    <span className="text-stone-600">推奨用途:</span>{" "}
                    対人交渉、引っ越し、大きな契約など、社会的なタイミングやバイオリズムの周期性を読む場合。
                  </p>
                </div>
              </div>
            </div>

            {/* Zone Differences */}
            <div className="space-y-2">
              <h3 className="text-emerald-600 font-bold border-b border-stone-200 pb-1">
                ■ ゾーン分類の定義 (SAFE vs OPTIMAL)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-white/80 p-3 border-l-2 border-emerald-500">
                  <div className="text-emerald-500 font-bold mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    [ GO ] 推奨方位 (OPTIMAL)
                  </div>
                  <p className="text-stone-500 text-[10px] sm:text-xs">
                    凶殺が存在しないことに加え、あなたの「本命星」とその方位の星が『相生（互いを生かし合うとされる関係）』になっています。
                    <br />
                    <br />
                    <span className="text-stone-600">意味:</span>{" "}
                    凶殺がないだけでなく、伝統的に運気を後押しするとされる、この判定でいちばんの推奨方位です。
                  </p>
                </div>
                <div className="bg-white/80 p-3 border-l-2 border-blue-500">
                  <div className="text-blue-500 font-bold mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>[
                    SAFE ] 進入可能方位
                  </div>
                  <p className="text-stone-500 text-[10px] sm:text-xs">
                    五黄殺、暗剣殺、天中殺といった凶殺が存在しない方位です。
                    <br />
                    <br />
                    <span className="text-stone-600">意味:</span>{" "}
                    暦の上で避けるべき凶殺に当たらない方位です。伝統的に、特に吉とも凶ともされない中立の方位とされます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

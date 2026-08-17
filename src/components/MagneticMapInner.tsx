"use client";

import React, { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Polygon,
  Circle,
  CircleMarker,
  useMap,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { InvalidateMapSize } from "@/components/map/InvalidateMapSize";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { statusForLayerMode } from "@/utils/directionStatus";
import { directionLabelShort } from "@/lib/directionLabels";
import {
  COMPASS_DIRECTIONS,
  DIRECTION_BEARINGS,
  directionWedgeHalfWidth,
} from "@/utils/directionGeo";
import type { MapProperty } from "@/lib/mapProperty";

// Fix for default marker icons in Leaflet with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapInnerProps {
  lat: number;
  lon: number;
  declination: number; // Magnetic Declination (D) in degrees
  intensity?: number; // Magnetic Intensity (F) in nT
  vectors?: Record<string, string> | null;
  layers?: {
    yearLayer: Partial<Record<string, string>>;
    monthLayer: Partial<Record<string, string>>;
    dayLayer: Partial<Record<string, string>>;
    finalVectors: Record<string, string>;
  } | null;
  honmeiStar?: { physical: number; classical: number } | null;
  kpIndex?: number | null;
  ansLoad?: number;
  hudLayers?: {
    terrain: boolean;
    weather: boolean;
    bio: boolean;
    hazard?: boolean;
  };
  activeLayerMode?: string;
  useTrueNorth?: boolean;
  properties?: MapProperty[];
  onSelectTarget?: (lat: number, lon: number) => void;
  targetLat?: number | null;
  targetLon?: number | null;
  nodeMapping?: "traditional" | "physical";
  /**
   * 強調表示する方位。ヒートマップで選んだ方位や、目的地の方位を指す。
   *
   * 8 つの扇形が同じ濃さで並んでいると、「今どの方位の話をしているのか」が
   * 地図側に出てこない。ヒートマップのセルを押したときに、対応する扇形が
   * 地図上でも分かるようにする。
   */
  highlightDirection?: string | null;
}

// Function to calculate a point at a certain distance and bearing from origin
function getDestination(
  lat: number,
  lon: number,
  bearing: number,
  distanceKm: number = 5,
) {
  const R = 6371; // Earth radius in km
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (bearing * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceKm / R) +
      Math.cos(lat1) * Math.sin(distanceKm / R) * Math.cos(brng),
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceKm / R) * Math.cos(lat1),
      Math.cos(distanceKm / R) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI] as [number, number];
}

function SyncMapCenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);

  return null;
}

function ZoomListener({
  onChangeZoom,
}: {
  onChangeZoom: (zoom: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onChangeZoom(map.getZoom());
    const handleZoom = () => {
      onChangeZoom(map.getZoom());
    };
    map.on("zoomend", handleZoom);
    return () => {
      map.off("zoomend", handleZoom);
    };
  }, [map, onChangeZoom]);

  return null;
}

function ClickEvents({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MagneticMapInner({
  lat,
  lon,
  declination,
  intensity = 50000,
  vectors,
  layers,
  honmeiStar,
  kpIndex,
  ansLoad = 0,
  hudLayers = { terrain: true, weather: true, bio: true, hazard: false },
  activeLayerMode = "final",
  // useTrueNorth は受け口だけ残す。扇形は必ず真北で描くようになったので
  // ここでは読まない（呼び出し側は今も渡している）。
  properties = [],
  onSelectTarget,
  targetLat,
  targetLon,
  nodeMapping = "traditional",
  highlightDirection = null,
}: MapInnerProps) {
  const [mounted, setMounted] = React.useState(false);
  const [clickedPos, setClickedPos] = React.useState<[number, number] | null>(
    null,
  );
  const [zoom, setZoom] = React.useState(13);
  const [mapTheme, setMapTheme] = React.useState<"dark" | "light">("light");

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("map_theme") as "dark" | "light";
    if (saved) setMapTheme(saved);

    const handleThemeChange = () => {
      const current = localStorage.getItem("map_theme") as "dark" | "light";
      if (current) setMapTheme(current);
    };

    window.addEventListener("mapThemeChanged", handleThemeChange);
    return () =>
      window.removeEventListener("mapThemeChanged", handleThemeChange);
  }, []);

  // Sync clickedPos with targetLat/targetLon from props
  useEffect(() => {
    if (targetLat != null && targetLon != null) {
      setClickedPos([targetLat, targetLon]);
    } else {
      setClickedPos(null);
    }
  }, [targetLat, targetLon]);

  const center = React.useMemo<[number, number]>(() => [lat, lon], [lat, lon]);

  /*
    磁北線を引く方位角。**扇形には使わない。**

    以前はこれを扇形と境界の赤帯にも足していた（`useTrueNorth` が偽の
    ときは偏角のぶん全体が回る）。塗り分けている吉凶は真北基準で出した
    ものなので、真北で出した判定を磁北の位置に置いて描いていたことになる。
    伝統区分の四正は幅 30 度しかなく、偏角（日本でおよそ 5〜9 度）は
    その 4 分の 1 前後にあたる。同じ地点が、ホームの地図では扇形の中
    なのに arbitrage / wealth（directionFromBearing で真北から出す）では
    隣の方位、ということが起きていた。

    磁北は「方位磁針で測るとずれる」注意としてだけ使う（CLAUDE.md 3 節）。
    青い磁北線は偏角そのものなので、`useTrueNorth` では切り替えない。
    切り替えていたせいで、真北表示にすると**磁北線が真北を指していた。**
  */
  const magNorthBearing = declination;

  // Memoize sectors based on activeLayerMode and layers
  const sectors = React.useMemo(() => {
    // 方位角と扇形の幅は utils/directionGeo から引く。ここに一覧を
    // 書き戻さないこと（区切りが 2 か所になると扇形と判定がずれる）。
    return COMPASS_DIRECTIONS.map((dir) => {
      let status = "SAFE";
      if (layers) {
        // 時間軸の畳み方はヒートマップと共有する。ここに個別実装を戻さないこと。
        status = statusForLayerMode(layers, dir, activeLayerMode || "final");
      } else if (vectors && vectors[dir]) {
        status = vectors[dir];
      }
      return { dir, deg: DIRECTION_BEARINGS[dir], status };
    });
  }, [vectors, layers, activeLayerMode]);

  // 1. Memoize boundaries
  const boundaries = React.useMemo(() => {
    return nodeMapping === "physical"
      ? [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]
      : [15, 75, 105, 165, 195, 255, 285, 345];
  }, [nodeMapping]);

  // 2. Memoize vector styles based on status and kpIndex
  const getStyleForVector = React.useCallback(
    (status: string) => {
      const baseKp = kpIndex || 0;
      const weight = status.startsWith("NOISE") ? (baseKp >= 4 ? 2 : 1) : 0.5;

      let style;
      let dashArray;
      switch (status) {
        case "OPTIMAL":
          style = { color: "#10b981", opacity: 0.4 };
          dashArray = undefined;
          break;
        case "OPTIMAL_REGULAR":
          style = { color: "#34d399", opacity: 0.3 };
          dashArray = "5,2";
          break;
        case "SAFE":
          style = { color: "#3b82f6", opacity: 0.1 };
          dashArray = undefined;
          break;
        case "NOISE_GOU":
          style = { color: "#ef4444", opacity: 0.6 };
          dashArray = "10,5";
          break;
        case "NOISE_ANKEN":
          style = { color: "#f43f5e", opacity: 0.6 };
          dashArray = "5,5";
          break;
        case "NOISE_HA":
          style = { color: "#f43f5e", opacity: 0.6 };
          dashArray = "3,3";
          break;
        case "NOISE_HONMEI":
          style = { color: "#d946ef", opacity: 0.6 };
          dashArray = "15,10,5,10";
          break;
        case "NOISE_TEKI":
          style = { color: "#c026d3", opacity: 0.6 };
          dashArray = "15,15";
          break;
        // 月命殺・月命的殺。ヒートマップは本命殺と同じ紫で塗っていたのに、
        // 地図には case が無く default（灰色・ほぼ透明）に落ちていた。
        // 同じ方位が地図では平穏に見え、ヒートマップでは凶に見える原因。
        case "NOISE_GETSUMEI":
          style = { color: "#d946ef", opacity: 0.5 };
          dashArray = "12,8,4,8";
          break;
        case "NOISE_GETSUTEKI":
          style = { color: "#c026d3", opacity: 0.5 };
          dashArray = "12,12";
          break;
        case "NOISE_VOID":
          style = { color: "#eab308", opacity: 0.4 };
          dashArray = "1,5";
          break;
        case "NOISE_NODE":
          style = { color: "#f59e0b", opacity: 0.4 };
          dashArray = "4,4";
          break;
        case "NOISE":
          style = { color: "#ef4444", opacity: 0.6 };
          dashArray = "10,10";
          break;
        default:
          style = { color: "#3f3f46", opacity: 0.2 };
          dashArray = "1,4";
      }
      return {
        ...style,
        weight:
          status === "SAFE" || status === "OPTIMAL_REGULAR" ? 0.5 : weight,
        dashArray,
      };
    },
    [kpIndex],
  );

  // 3. Memoize the entire vector/sector layer to avoid re-calculating points unless inputs change
  const vectorLayer = React.useMemo(() => {
    return sectors.map((d) => {
      // 3D HUD Logic: Calculate status based on ACTIVE layers directly from final status
      const hasTerrainNoise = d.status === "NOISE";
      const hasBioNoise =
        d.status.includes("HONMEI") || d.status.includes("TEKI");
      const hasWeatherNoise =
        d.status.includes("NOISE") && !hasBioNoise && !hasTerrainNoise;

      // Filter logic: If a layer is OFF, ignore its noise contribution for the VISUAL display
      let displayStatus = "SAFE";

      if (hudLayers.terrain && hasTerrainNoise) displayStatus = d.status;
      if (hudLayers.weather && hasWeatherNoise) displayStatus = d.status;
      if (hudLayers.bio && hasBioNoise) {
        displayStatus = d.status; // Bio noise (Honmei/Teki)
      }

      if (!d.status.includes("NOISE")) {
        displayStatus = d.status;
      }

      const { color, opacity, weight, dashArray } =
        getStyleForVector(displayStatus);
      // 真北基準。判定と同じ向きで描く（上の magNorthBearing の注記）。
      const baseBearing = d.deg;

      const points: [number, number][] = [center];
      const halfWidth = directionWedgeHalfWidth(d.dir, nodeMapping);
      for (let offset = -halfWidth; offset <= halfWidth; offset += 5) {
        points.push(getDestination(lat, lon, baseBearing + offset, 1000));
      }

      // Calculate label position dynamically based on zoom level
      let labelDistance = 15;
      if (zoom >= 13) labelDistance = 3;
      else if (zoom >= 11) labelDistance = 10;
      else if (zoom >= 9) labelDistance = 35;
      else if (zoom >= 7) labelDistance = 90;
      else if (zoom >= 5) labelDistance = 180;
      else labelDistance = 300;
      const labelPos = getDestination(lat, lon, baseBearing, labelDistance);

      const getStatusLabel = (status: string) => {
        if (status === "NOISE_GOU") return "五黄";
        if (status === "NOISE_ANKEN") return "暗剣";
        if (status === "NOISE_HA") return "破";
        if (status === "NOISE_HONMEI") return "本命";
        if (status === "NOISE_TEKI") return "的殺";
        if (status === "NOISE_GETSUMEI") return "月命";
        if (status === "NOISE_GETSUTEKI") return "月命的";
        if (status === "NOISE_VOID") return "ボイド";
        if (status === "NOISE_NODE") return "交点";
        if (status === "OPTIMAL") return "大吉";
        if (status === "OPTIMAL_REGULAR") return "吉";
        return "";
      };

      const label = getStatusLabel(displayStatus);

      // Tooltip breakdown
      const y = layers?.yearLayer[d.dir] || "SAFE";
      const m = layers?.monthLayer[d.dir] || "SAFE";
      const dLayer = layers?.dayLayer[d.dir] || "SAFE";

      // 日本語表記は @/lib/directionLabels に集約。ここに表を戻さないこと。
      const formatLayer = directionLabelShort;

      const getActionSuggest = (status: string) => {
        if (status.startsWith("NOISE_GOU"))
          return "【退避】五黄殺: 自滅や深刻なトラブルを招く致命的な環境エラー域です";
        if (status.startsWith("NOISE_ANKEN"))
          return "【退避】暗剣殺: 予期せぬ他動的なトラブルを被る致命的な環境エラー域です";
        if (status.startsWith("NOISE_HA"))
          return "【退避】破れ: 計画が破綻しやすい環境エラー域です";
        if (
          status.startsWith("NOISE_HONMEI") ||
          status.startsWith("NOISE_TEKI")
        )
          return "【警戒】健康被害や目的阻害など、主観的エラーが頻発する帯域です";
        if (status.includes("VOID"))
          return "【警告】天中殺: 基盤が崩れやすい空間。重大な決断は保留してください";
        if (status.includes("NODE"))
          return "【警告】交点軸: 宿命的な磁気ストレスがあります。重大な決断は保留してください";
        if (status === "OPTIMAL")
          return "【推奨】大吉方位。環境と生体波長が完全に一致した最適化ゾーンです";
        if (status === "OPTIMAL_REGULAR")
          return "【推奨】吉方位。運気を後押しする良好なゾーンです";
        return "【中立】干渉のない平穏な環境です";
      };

      const isHighlighted = highlightDirection === d.dir;
      const fillOpacity = isHighlighted ? Math.min(1, opacity + 0.18) : opacity;

      return (
        <React.Fragment key={`sector-group-${d.dir}-${activeLayerMode}`}>
          {/* 選択中の方位の輪郭。扇形の色は吉凶を表しているので塗りは触らず、
              枠線を重ねて「今どの方位の話をしているか」を地図側にも出す。 */}
          {isHighlighted && (
            <Polygon
              positions={points}
              interactive={false}
              pathOptions={{
                color: "#4f46e5",
                weight: 4,
                opacity: 0.95,
                fill: false,
              }}
            />
          )}
          <Polygon
            positions={points}
            color={color}
            fillColor={color}
            fillOpacity={fillOpacity}
            weight={weight}
            dashArray={dashArray}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity,
              weight,
              dashArray,
            }}
          >
            <Tooltip className="custom-map-tooltip">
              <div className="bg-stone-50 text-stone-700 p-2 font-mono text-[10px] border border-stone-200 shadow-xl max-w-[200px]">
                <div className="text-blue-600 border-b border-stone-200 mb-1 pb-1 uppercase tracking-widest flex justify-between items-center">
                  <span>{d.dir} Sector</span>
                  <span className="text-stone-400 font-normal">
                    Analysis {dashArray ? "(破線)" : "(実線)"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-stone-400">環境:</span>
                    <span
                      className={
                        y.includes("NOISE") ||
                        m.includes("NOISE") ||
                        dLayer.includes("NOISE")
                          ? "text-red-500"
                          : "text-emerald-500"
                      }
                    >
                      {formatLayer(y)} / {formatLayer(m)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-stone-400">個人:</span>
                    <span
                      className={
                        d.status.includes("HONMEI") || d.status.includes("TEKI")
                          ? "text-[#a855f7]"
                          : "text-emerald-500"
                      }
                    >
                      {formatLayer(dLayer)}
                    </span>
                  </div>
                  <div className="mt-1 pt-1 border-t border-stone-200 text-[9px] flex flex-col gap-1">
                    <div className="flex gap-2">
                      <span className="text-stone-500">STATUS: </span>
                      <span
                        className={
                          color.includes("10b981") || color.includes("34d399")
                            ? "text-emerald-500"
                            : color.includes("ef4444") ||
                                color.includes("f43f5e")
                              ? "text-red-500"
                              : color.includes("d946ef") ||
                                  color.includes("c026d3")
                                ? "text-[#d946ef]"
                                : color.includes("eab308") ||
                                    color.includes("f59e0b")
                                  ? "text-[#eab308]"
                                  : "text-blue-500"
                        }
                      >
                        {d.status}
                      </span>
                    </div>
                    <div className="text-stone-600 font-bold bg-white/80 p-1 border-l-2 border-zinc-600 mt-1">
                      {getActionSuggest(d.status)}
                    </div>
                  </div>
                </div>
              </div>
            </Tooltip>
          </Polygon>
          {label && (
            <Marker
              position={labelPos}
              icon={L.divIcon({
                className: "custom-div-icon",
                html: `<div style="color: ${color}; text-shadow: 0 0 4px black; font-weight: bold; font-family: monospace; font-size: 11px; white-space: nowrap;">${label}</div>`,
                iconSize: [40, 20],
                iconAnchor: [20, 10],
              })}
              interactive={false}
            />
          )}
        </React.Fragment>
      );
    });
  }, [
    sectors,
    getStyleForVector,
    center,
    lat,
    lon,
    layers,
    hudLayers,
    activeLayerMode,
    zoom,
    nodeMapping,
    // これが無いとヒートマップで方位を選び直しても扇形が再描画されず、
    // 強調表示が前のままになる（連動しているように見えない）。
    highlightDirection,
  ]);

  const dangerLayer = React.useMemo(() => {
    return boundaries.map((b, idx) => {
      // 扇形と同じく真北基準。境界の帯だけ回っていると、扇形の縁と
      // 赤帯が別の場所に出る。
      const baseBearing = b;
      const points: [number, number][] = [center];
      for (let offset = -2; offset <= 2; offset += 1) {
        points.push(getDestination(lat, lon, baseBearing + offset, 1000));
      }
      return (
        <Polygon
          key={`danger-${idx}`}
          positions={points}
          color="#ef4444"
          fillColor="#ef4444"
          fillOpacity={0.4}
          weight={0}
        />
      );
    });
  }, [boundaries, center, lat, lon]);

  // 4. Mock Hazard Layer (Phase 2 GIS Integration)
  const hazardLayer = React.useMemo(() => {
    if (!hudLayers.hazard) return null;

    // Create some mock hazard zones (e.g., fault lines, flood zones) around the center
    return (
      <React.Fragment>
        {/* Mock Fault Line */}
        <Polyline
          positions={[
            getDestination(lat, lon, 45, 100),
            getDestination(lat, lon, 225, 100),
          ]}
          color="#ef4444"
          weight={2}
          dashArray="5,5"
          opacity={0.6}
        />
        <Marker
          position={getDestination(lat, lon, 45, 100)}
          icon={L.divIcon({
            className: "custom-div-icon",
            html: `<div style="color: #ef4444; background: rgba(0,0,0,0.5); padding: 2px; text-shadow: 0 0 4px black; font-weight: bold; font-family: monospace; font-size: 9px;">[HZD] Fault Line</div>`,
            iconSize: [80, 20],
            iconAnchor: [0, 10],
          })}
          interactive={false}
        />
      </React.Fragment>
    );
  }, [hudLayers.hazard, lat, lon]);

  // Concentric Rings for Shield Attenuation Theory (in meters)
  const attenuationRings: number[] = [250000, 500000, 1000000];

  if (!mounted) {
    return (
      <div className="w-full h-full bg-stone-50 flex shadow-inner border border-stone-200 items-center justify-center font-mono text-[10px] text-zinc-800">
        [ SYNCING SPATIAL... ]
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-sm overflow-hidden border border-stone-200">
      <MapContainer
        key="magnetic-map-container"
        center={center}
        zoom={13}
        maxZoom={20}
        className="w-full h-full bg-stone-50"
        zoomControl={false}
        preferCanvas={true}
      >
        <SyncMapCenter lat={lat} lon={lon} />
        <InvalidateMapSize />
        <ZoomListener onChangeZoom={setZoom} />
        <ClickEvents
          onMapClick={(lat, lng) => {
            setClickedPos([lat, lng]);
            onSelectTarget?.(lat, lng);
          }}
        />
        <TileLayer
          key={`tile-layer-${mapTheme}`}
          url={
            mapTheme === "dark"
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
          // CARTO のタイルは OpenStreetMap のデータから作られているため、
          // 明暗どちらでも両方の帰属表示が要る。
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={20}
          maxNativeZoom={19}
        />

        {/* Theme Switcher Button */}
        <div className="absolute top-4 left-4 z-[1000] pointer-events-auto">
          <button
            onClick={() => {
              const nextTheme = mapTheme === "dark" ? "light" : "dark";
              setMapTheme(nextTheme);
              localStorage.setItem("map_theme", nextTheme);
              window.dispatchEvent(new Event("mapThemeChanged"));
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[9px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
          >
            {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
          </button>
        </div>

        {clickedPos && (
          <Marker position={clickedPos}>
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <div className="font-mono text-[10px] text-zinc-800 font-bold">
                Selected Target
              </div>
            </Tooltip>
          </Marker>
        )}

        <Marker position={center} />

        {/* Draw Dynamic Sectors (Stars/Vectors) */}
        {vectorLayer}

        {/* Draw Danger Zones (Red) at Boundaries */}
        {dangerLayer}

        {/* Draw Hazard / GIS Overlay if enabled */}
        {hazardLayer}

        {/* Draw True North Line (Geographic) */}
        <Polyline
          positions={[center, getDestination(lat, lon, 0, 1000)]}
          color="#10b981"
          weight={3}
          dashArray="8,8"
          opacity={0.9}
        />

        {/* Draw Magnetic North Line */}
        <Polyline
          positions={[center, getDestination(lat, lon, magNorthBearing, 1000)]}
          color="#3b82f6"
          weight={3}
          opacity={0.9}
        />

        {/* Concentric Distance Rings for Attenuation */}
        {attenuationRings.map((radiusMeters, i) => (
          <Circle
            key={`ring-${radiusMeters}`}
            center={center}
            radius={radiusMeters}
            pathOptions={{
              color: "#71717a",
              weight: 1,
              dashArray: "2,10",
              fill: false,
              opacity: 0.3 - i * 0.05,
            }}
          />
        ))}

        {/* Real Estate Properties */}
        {properties?.map((prop) => {
          // 座標だけ局所に取り出す。lat/lon は null 許容で、下の click は
          // 遅れて走るため、prop.lat のままだと絞り込みが効かない
          // （呼ばれる時点で別の値になっている可能性を型が捨てられない）。
          const { lat: propLat, lon: propLon } = prop;
          return propLat && propLon ? (
            <CircleMarker
              key={prop.id || prop.url}
              center={[propLat, propLon]}
              radius={prop.is_new_build ? 5 : 3}
              pathOptions={{
                color: prop.is_new_build ? "#10b981" : "#3b82f6",
                fillColor: prop.is_new_build ? "#10b981" : "#3b82f6",
                fillOpacity: 0.8,
                weight: 1,
              }}
              eventHandlers={{
                click: () => {
                  setClickedPos([propLat, propLon]);
                  onSelectTarget?.(propLat, propLon);
                },
              }}
            >
              <Tooltip>
                <div className="font-mono text-xs text-zinc-800 p-1">
                  <div className="font-bold">{prop.property_name}</div>
                  {prop.is_new_build && (
                    <div className="text-emerald-600 font-bold">[新築]</div>
                  )}
                  <div>
                    家賃:{" "}
                    {prop.rent
                      ? `${(prop.rent / 10000).toFixed(1)}万円`
                      : "不明"}
                  </div>
                  <div>{prop.address}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          ) : null;
        })}
      </MapContainer>

      {/* UI Overlay */}
      <div className="absolute top-16 right-4 z-[1000] pointer-events-none">
        <div className="bg-white/80 md:backdrop-blur-md px-3 py-2 border border-blue-200 rounded-sm shadow-lg flex flex-col gap-1 items-end text-right">
          <div className="flex items-center gap-2 mb-1 justify-end">
            <div className="text-[10px] uppercase font-mono tracking-widest text-emerald-600">
              真北 (Geographic North)
            </div>
            <div className="w-4 border-t-2 border-emerald-500 border-dashed"></div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <div className="text-[10px] uppercase font-mono tracking-widest text-blue-600">
              磁北 (Magnetic North)
            </div>
            <div className="w-4 border-t-[3px] border-blue-500"></div>
          </div>
          <div className="text-xs font-mono text-stone-600 mt-1 pt-1 border-t border-stone-200 w-full">
            現在地偏角 (WMM2020): {declination > 0 ? "東偏" : "西偏"}
            {Math.abs(declination).toFixed(2)}°
          </div>
          <div className="text-[9px] text-stone-400 mt-0.5 leading-tight max-w-[200px]">
            ※占術・気学の吉凶評価は、すべて「磁北」を基準に補正計算されています。月交点（空間方位）と月相（時間補正）は別個に評価されています。
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-[1000] pointer-events-none">
        <div className="bg-white/80 md:backdrop-blur-md px-3 py-2 border border-stone-200 rounded-sm text-[9px] flex flex-col gap-1.5 shadow-xl">
          <div className="text-stone-400 font-mono uppercase tracking-widest border-b border-stone-200 pb-1 flex justify-between gap-4">
            <span>Legend</span>
            <span className="text-emerald-500">
              [{activeLayerMode.toUpperCase()}]
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
              <span className="text-stone-600">大吉 (Optimal)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
              <span className="text-stone-600">危険 (Noise)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3b82f6]"></span>
              <span className="text-stone-600">通常 (Safe)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#d946ef]"></span>
              <span className="text-stone-600">個人不調 (Bio)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#eab308]"></span>
              <span className="text-stone-600">天中殺 (Void)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span>
              <span className="text-stone-600">月交点 (Node)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 border-t border-dashed border-zinc-500"></div>
              <span className="text-stone-400">距離リング</span>
            </div>
          </div>

          {honmeiStar && (
            <div className="text-[8px] text-[#a855f7] border-t border-stone-200 pt-1 mt-1 font-mono">
              HARDWARE SYNC: {honmeiStar.physical}
            </div>
          )}
        </div>
      </div>

      {/* UI Overlay - Clicked Position */}
      {clickedPos && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto">
          <div className="bg-white/80 md:backdrop-blur-md px-3 py-2 border border-emerald-200 rounded-sm shadow-xl flex flex-col gap-1.5 animate-fade-in-up">
            <div className="text-[9px] font-mono text-emerald-600 uppercase tracking-widest border-b border-stone-200 pb-1 flex justify-between gap-4">
              <span>Target Coordinates</span>
              <button
                onClick={() => setClickedPos(null)}
                className="text-stone-400 hover:text-stone-900"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col text-[10px] font-mono text-stone-600">
                <span>Lat: {clickedPos[0].toFixed(5)}</span>
                <span>Lon: {clickedPos[1].toFixed(5)}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${clickedPos[0].toFixed(5)},${clickedPos[1].toFixed(5)}`,
                  );
                  alert(
                    `座標をコピーしました: ${clickedPos[0].toFixed(5)},${clickedPos[1].toFixed(5)}`,
                  );
                }}
                className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1.5 text-[9px] uppercase tracking-widest hover:bg-emerald-800/60 transition-colors"
              >
                📋 COPY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

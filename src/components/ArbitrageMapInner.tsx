"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polygon,
  Circle,
  CircleMarker,
  useMap,
  Popup,
  useMapEvents,
  GeoJSON,
} from "react-leaflet";
import { InvalidateMapSize } from "@/components/map/InvalidateMapSize";
import type { DayTier } from "@/utils/auspiciousDays";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Copy, Check } from "lucide-react";
import { scaleLinear } from "d3-scale";
import { motion, AnimatePresence } from "framer-motion";
import { AstroGridCalendar } from "./realestate/AstroGridCalendar";
import {
  getPropertyPinColors,
  getRecommendationStarCount,
} from "@/utils/arbitrageHelpers";
import { OVERVIEW_CENTER, OVERVIEW_ZOOM } from "@/utils/arbitrageSearchArea";
import {
  TIER_FILL,
  TIER_JP,
  TIER_SECTOR_OPACITY,
  BLOCKED_FILL,
} from "@/utils/tierDisplay";
import prefecturesWithData from "@/data/prefecturesWithData.json";

// Fix Leaflet default icon problem in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/**
 * 検索半径から表示ズームを引く。初回表示と「出発地へ」ボタンで使う。
 *
 * フォーカスの初期値を物件の分布（fitBounds）で決めると、データの
 * 到着順で毎回違う画角になる。半径は利用者が選んだ確定値なので、
 * これだけから決めれば同じ条件では常に同じ画角になる。
 * 扇形は zoom >= 10 でしか描かないため、下限は 10。
 */
function zoomForRadius(radiusKm?: string): number {
  const km = Number(radiusKm);
  if (!Number.isFinite(km) || km <= 0) return 10; // "all" など
  if (km <= 15) return 12;
  if (km <= 35) return 11;
  return 10;
}

// Map Click Handler to copy coordinates
function MapClickHandler({
  onCopy,
}: {
  onCopy: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      const target = e.originalEvent.target as HTMLElement;
      // Don't trigger if clicking on a control, popup, or marker
      if (
        target.closest(".leaflet-control") ||
        target.closest(".leaflet-popup") ||
        target.closest(".leaflet-marker-icon")
      ) {
        return;
      }
      onCopy(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export interface ScoredProperty {
  id: string;
  property_name: string;
  rent: number | null;
  management_fee: number | null;
  layout: string | null;
  size_sqm: any | null;
  is_new_build: boolean | null;
  minutes_to_station: number | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  building_age: number | null;
  floor: string | null;
  url: string | null;
  totalRent: number;
  propSqmRent: number;
  distanceKm: number | null;
  direction: string | null;
  magneticDirection: string | null;
  astrologyStatus: string;
  astrologyScore: number;
  yieldScore: number;
  arbitrageScore: number;
  totalScore: number;
  isTendo?: boolean;
  maxAstroFactor?: string;
  astroFlags?: string[];
  dateScores?: any[];
}

interface ArbitrageMapInnerProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  mapCenter?: [number, number];
  useTrueNorth: boolean;
  layerMode: string;
  radiusKm?: string;
  prefecture?: string;
  /** 全国を俯瞰しているか。県別の色分けを出すために広域表示を保つ */
  keepWideView?: boolean;
  /**
   * 県名 → 出発地から見た方位とその日の吉凶段階。俯瞰の塗り分けを
   * 「件数」から「方位の吉凶」に切り替えるために使う。日付・出発地・
   * 命式から決定的に決まる値で、ページ側が計算して渡す。
   */
  prefKigaku?: Record<
    string,
    {
      direction: string;
      directionLabel: string;
      tier: string;
      blocked: boolean;
    }
  >;
  /**
   * 8方位 → 選択日の吉凶段階。扇形の塗り分けはこれを読む。
   *
   * prefKigaku と同じ 1 回の盤計算から切り出したもので、時期パネルの
   * 「選択日」列とも同じ値になる。undefined（生年月日や出発地が未入力）
   * のときだけ、物件の status からの推定に落ちる。
   */
  dirKigaku?: Record<
    string,
    {
      direction: string;
      directionLabel: string;
      tier: string;
      blocked: boolean;
    }
  >;
  /** 扇形が「いつの」判定かを示すための選択日 YYYY-MM-DD */
  targetDate?: string;
  /** 出発地が入力済みか。フォーカスの初期値と「出発地へ」ボタンに使う */
  hasBase?: boolean;
  /** mapCenter の意味。area=検索の起点 / spot=個別の物件 */
  focusKind?: "area" | "spot";
  /** 詳細パネルで開いている物件。リングで強調する */
  selectedPropertyId?: string | null;
  isTransitioningDate?: boolean;
  showListView?: boolean;
  useClassical?: boolean;
  onDateChange?: (date: string) => void;
  onBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
  }) => void;
}

// Helper to calculate coordinates of a point at a certain distance and bearing from origin
function getDestination(
  lat: number,
  lon: number,
  bearing: number,
  distanceKm: number = 10,
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

/**
 * 地図のフォーカスを一元管理する。
 *
 * 以前は SyncMapCenter（中心が変わるたび zoom 13 へ）と AutoFitBounds
 * （物件が届くたび分布に fitBounds）の 2 つが同じ地図を取り合っていた。
 * どちらが最後に勝つかはデータの到着順で変わるので、開くたびに俯瞰
 * だったり物件群への寄りだったりする。「初回のフォーカスが定まらない」
 * のはこれが原因。
 *
 * 規則は 3 つだけ。すべて利用者が選んだ確定値から決まり、物件データの
 * 中身や到着タイミングには依存しない。
 *
 *   1. 全国（keepWideView）に入った瞬間 → 俯瞰（OVERVIEW）
 *   2. 検索の文脈（出発地・県・半径）が変わった → 出発地を中心に
 *      半径ぶんのズーム
 *   3. 物件をクリックした（focusKind="spot"） → その地点へ zoom 13
 *
 * それ以外（手でドラッグ・ズームした後など）は一切動かさない。
 */
function FocusController({
  center,
  prefecture,
  radiusKm,
  keepWideView = false,
  hasBase = false,
  focusKind = "area",
}: {
  center: [number, number];
  prefecture?: string;
  radiusKm?: string;
  keepWideView?: boolean;
  /** 出発地が入力済みか。未入力なら日本全体を広く出す */
  hasBase?: boolean;
  /** center の意味。area=検索の起点 / spot=個別の物件 */
  focusKind?: "area" | "spot";
}) {
  const map = useMap();
  const prevRef = useRef<{
    center: [number, number];
    prefecture?: string;
    radiusKm?: string;
    wide: boolean;
  } | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { center, prefecture, radiusKm, wide: keepWideView };

    if (keepWideView) {
      // 全国に切り替わった瞬間だけ俯瞰へ戻す。俯瞰中も毎回引き戻すと、
      // 全国を選んだまま気になる場所を拡大して見ることができなくなる。
      if (!prev || !prev.wide) {
        map.setView(OVERVIEW_CENTER, OVERVIEW_ZOOM);
      }
      return;
    }

    const centerChanged =
      !prev ||
      prev.wide ||
      Math.abs(prev.center[0] - center[0]) > 1e-4 ||
      Math.abs(prev.center[1] - center[1]) > 1e-4;
    const contextChanged =
      !prev || prev.prefecture !== prefecture || prev.radiusKm !== radiusKm;

    if (!centerChanged && !contextChanged) return;

    if (focusKind === "spot" && centerChanged) {
      map.setView(center, Math.max(map.getZoom(), 13));
      return;
    }
    if (!hasBase) {
      // 出発地が未入力なら方位も半径も定まらない。日本全体を広く出す。
      map.setView([38.0, 137.0], 5);
      return;
    }
    map.setView(center, zoomForRadius(radiusKm));
  }, [center, prefecture, radiusKm, keepWideView, hasBase, focusKind, map]);

  return null;
}

/** 「出発地へ」「全国俯瞰」ボタンから map を触るためのハンドル。 */
function MapRefGrabber({ onMap }: { onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
  return null;
}

// Track map viewport bounds
function BoundsListener({
  onBoundsChange,
}: {
  onBoundsChange?: (bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    zoom: number;
  }) => void;
}) {
  const map = useMapEvents({
    moveend() {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouthWest().lat,
        maxLat: bounds.getNorthEast().lat,
        minLon: bounds.getSouthWest().lng,
        maxLon: bounds.getNorthEast().lng,
        zoom: map.getZoom(),
      });
    },
    zoomend() {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouthWest().lat,
        maxLat: bounds.getNorthEast().lat,
        minLon: bounds.getSouthWest().lng,
        maxLon: bounds.getNorthEast().lng,
        zoom: map.getZoom(),
      });
    },
  });

  return null;
}

function getMunicipality(address: string | null): string {
  if (!address) return "その他";
  const cleanAddr = address.replace(
    /^(東京都|北海道|京都府|大阪府|.{2,3}県)/,
    "",
  );
  const cityDistrictMatch = cleanAddr.match(/^([^市]+市[^区]+区)/);
  if (cityDistrictMatch) return cityDistrictMatch[1];
  const cityMatch = cleanAddr.match(/^([^市]+市)/);
  if (cityMatch) return cityMatch[1];
  const gunMatch = cleanAddr.match(/^([^郡]+郡[^町]+町|[^郡]+郡[^村]+村)/);
  if (gunMatch) return gunMatch[1];
  const wardMatch = cleanAddr.match(/^([^区]+区)/);
  if (wardMatch) return wardMatch[1];
  const townMatch = cleanAddr.match(/^([^町]+町|[^村]+村)/);
  if (townMatch) return townMatch[1];
  return cleanAddr.substring(0, 8);
}

export default function ArbitrageMapInner({
  properties,
  baseLat,
  baseLon,
  mapCenter,
  useTrueNorth,
  layerMode,
  radiusKm,
  prefecture,
  keepWideView = false,
  prefKigaku,
  dirKigaku,
  targetDate,
  hasBase = false,
  focusKind = "area",
  selectedPropertyId = null,
  isTransitioningDate = false,
  showListView = false,
  useClassical = false,
  onDateChange,
  onBoundsChange,
}: ArbitrageMapInnerProps) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(5);
  const [currentBounds, setCurrentBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);
  const [mapTheme, setMapTheme] = useState<"dark" | "light">("light");
  // 俯瞰の塗り分け。方位の吉凶（意思決定）か、掲載件数（データの厚み）か。
  const [overviewTint, setOverviewTint] = useState<"kigaku" | "count">(
    "kigaku",
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "info" = "success") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 2500);
    },
    [],
  );

  // 「出発地へ」「全国俯瞰」ボタンから setView するためのハンドル
  const mapRef = useRef<L.Map | null>(null);
  const handleMapReady = useCallback((m: L.Map) => {
    mapRef.current = m;
  }, []);

  const copyCoordinates = useCallback(
    (lat: number, lon: number, label?: string) => {
      const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`${label ? label + "の" : ""}座標をコピーしました: ${text}`);
      });
    },
    [showToast],
  );

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("map_theme") as "dark" | "light";
    if (saved) setMapTheme(saved);

    const handleThemeChange = () => {
      const current = localStorage.getItem("map_theme") as "dark" | "light";
      if (current) setMapTheme(current);
    };
    window.addEventListener("mapThemeChanged", handleThemeChange);

    fetch("/prefectures.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load prefectures.geojson");
        return res.json();
      })
      .then((data) => setGeoData(data))
      .catch((err) => console.error("Error loading prefectures.geojson:", err));

    return () =>
      window.removeEventListener("mapThemeChanged", handleThemeChange);
  }, []);

  // 県別の色分けと件数ラベルの元。
  //
  // 以前は API が返した properties（安い順・最大 500 件）を県名で数えて
  // いた。母数が 500 件では安い県だけが濃く出るうえ、俯瞰のためだけに
  // 全国 45 万行の名寄せを走らせることになる。俯瞰に要るのは県ごとの
  // 数字だけなので、build_area_dataset.ts が毎晩数えて静的に配る値を使う。
  // 取り込みが進んで新しい県にデータが載れば、翌朝ここも自動で増える。
  const prefCounts: Record<string, number> = useMemo(
    () =>
      (prefecturesWithData as { listingCounts?: Record<string, number> })
        .listingCounts ?? {},
    [],
  );

  const handleBoundsChange = useCallback(
    (b: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
      zoom: number;
    }) => {
      setZoom(b.zoom);
      setCurrentBounds({
        minLat: b.minLat,
        maxLat: b.maxLat,
        minLon: b.minLon,
        maxLon: b.maxLon,
      });
      if (onBoundsChange) {
        onBoundsChange(b);
      }
    },
    [onBoundsChange],
  );

  const visibleProperties = useMemo(() => {
    if (!currentBounds) return properties;
    return properties.filter((p) => {
      if (p.lat === null || p.lon === null) return false;
      return (
        p.lat >= currentBounds.minLat &&
        p.lat <= currentBounds.maxLat &&
        p.lon >= currentBounds.minLon &&
        p.lon <= currentBounds.maxLon
      );
    });
  }, [properties, currentBounds]);

  const visibleCount = visibleProperties.length;

  useEffect(() => {
    if (zoom >= 12) {
      setShowHeatmap(false);
      return;
    }
    if (visibleCount >= 120) {
      setShowHeatmap(true);
    } else if (visibleCount <= 80) {
      setShowHeatmap(false);
    }
  }, [visibleCount, zoom]);

  const center = useMemo<[number, number]>(() => {
    if (mapCenter) return mapCenter;
    return [baseLat, baseLon];
  }, [baseLat, baseLon, mapCenter]);
  const declination = -8.2; // Tokyo magnetic declination
  const rotationAngle = useTrueNorth ? 0 : declination;

  // 市区町村ごとの集計データ (広域表示用)
  const municipalityData = useMemo(() => {
    if (!showHeatmap && zoom >= 10) return [];

    const groups: Record<
      string,
      {
        name: string;
        latSum: number;
        lonSum: number;
        count: number;
        scoreSum: number;
        properties: ScoredProperty[];
      }
    > = {};

    properties.forEach((p) => {
      if (!p.lat || !p.lon) return;
      const muni = getMunicipality(p.address);
      if (!groups[muni]) {
        groups[muni] = {
          name: muni,
          latSum: 0,
          lonSum: 0,
          count: 0,
          scoreSum: 0,
          properties: [],
        };
      }
      groups[muni].latSum += p.lat;
      groups[muni].lonSum += p.lon;
      groups[muni].count += 1;
      groups[muni].scoreSum += p.arbitrageScore;
      groups[muni].properties.push(p);
    });

    return Object.values(groups).map((g) => ({
      name: g.name,
      lat: g.latSum / g.count,
      lon: g.lonSum / g.count,
      count: g.count,
      avgScore: g.scoreSum / g.count,
      properties: g.properties,
    }));
  }, [properties, zoom]);

  const maxPrefOrBubbleCount = useMemo(() => {
    let max = 0;
    if (zoom < 10) {
      Object.values(prefCounts).forEach((c) => {
        if (c > max) max = c;
      });
    } else {
      municipalityData.forEach((m) => {
        if (m.count > max) max = m.count;
      });
    }
    return Math.max(max, 20); // Minimum scale denominator of 20
  }, [prefCounts, municipalityData, zoom]);

  const getDensityColor = useCallback(
    (count: number) => {
      if (count === 0) return "#818cf8"; // Purple/Indigo
      const ratio = Math.min(1, count / maxPrefOrBubbleCount);
      // Gradient: Purple (260) -> Blue -> Teal -> Green -> Yellow -> Red (0)
      const hue = (1 - ratio) * 260;
      return `hsl(${hue}, 90%, 60%)`;
    },
    [maxPrefOrBubbleCount],
  );

  const clusters = useMemo(() => {
    // Only cluster when visibleCount <= 100 AND list view is not fully expanded AND zoom is moderate
    if (visibleCount > 100 || showListView || zoom >= 15) return [];

    const grouped: {
      latSum: number;
      lonSum: number;
      properties: ScoredProperty[];
    }[] = [];

    // Distance threshold in degrees based on zoom level
    const distThreshold = Math.max(0.0015, 0.04 / Math.pow(2, zoom - 10));

    properties.forEach((p) => {
      if (p.lat === null || p.lon === null) return;

      if (currentBounds) {
        if (
          p.lat < currentBounds.minLat ||
          p.lat > currentBounds.maxLat ||
          p.lon < currentBounds.minLon ||
          p.lon > currentBounds.maxLon
        ) {
          return;
        }
      }

      let merged = false;
      for (const group of grouped) {
        const avgLat = group.latSum / group.properties.length;
        const avgLon = group.lonSum / group.properties.length;

        const dLat = Math.abs(avgLat - p.lat);
        const dLon = Math.abs(avgLon - p.lon);
        if (dLat < distThreshold && dLon < distThreshold) {
          group.properties.push(p);
          group.latSum += p.lat;
          group.lonSum += p.lon;
          merged = true;
          break;
        }
      }

      if (!merged) {
        grouped.push({
          latSum: p.lat,
          lonSum: p.lon,
          properties: [p],
        });
      }
    });

    return grouped.map((g) => ({
      lat: g.latSum / g.properties.length,
      lon: g.lonSum / g.properties.length,
      count: g.properties.length,
      properties: g.properties,
    }));
  }, [properties, currentBounds, zoom, visibleCount, showListView]);

  /**
   * 扇形（方位）の判定。
   *
   * dirKigaku があればそれを使う。三盤（年・月・日）を合成した段階で、
   * 時期パネルの「選択日」列・俯瞰の県塗りと同じ値。物件が 0 件の方位
   * でも正しく凶と出る。
   *
   * 無いとき（生年月日・出発地が未入力）だけ、従来どおり物件の
   * astrologyStatus からの推定に落ちる。こちらはサーバが layerMode
   * （既定は年盤）で出した単盤の判定なので、三盤の段階とは一致しない。
   * その旨は凡例に出す。
   */
  const sectors = useMemo(() => {
    const dirMap = [
      { dir: "N", deg: 0 },
      { dir: "NE", deg: 45 },
      { dir: "E", deg: 90 },
      { dir: "SE", deg: 135 },
      { dir: "S", deg: 180 },
      { dir: "SW", deg: 225 },
      { dir: "W", deg: 270 },
      { dir: "NW", deg: 315 },
    ];

    return dirMap.map((d) => {
      const k = dirKigaku?.[d.dir];
      if (k) {
        return {
          ...d,
          tier: k.tier,
          blocked: k.blocked,
          status: null as string | null,
        };
      }
      // フォールバック: 物件の status の多数決（単盤・参考値）
      const propsInDir = properties.filter((p) => p.direction === d.dir);
      let status = "SAFE";
      if (propsInDir.length > 0) {
        const optimalCount = propsInDir.filter((p) =>
          p.astrologyStatus.includes("OPTIMAL"),
        ).length;
        const noiseCount = propsInDir.filter((p) =>
          p.astrologyStatus.includes("NOISE"),
        ).length;
        if (optimalCount > 0) status = "OPTIMAL";
        else if (noiseCount > propsInDir.length / 2) status = "NOISE";
      }
      return { ...d, tier: null as string | null, blocked: false, status };
    });
  }, [properties, dirKigaku]);

  // Color mapping based on score
  const getPropertyColor = useCallback((score: number) => {
    if (score >= 75) return "#10b981"; // Excellent (Emerald)
    if (score >= 60) return "#34d399"; // Good (Mint)
    if (score >= 50) return "#3b82f6"; // Moderate (Blue)
    if (score >= 40) return "#f59e0b"; // Warning (Amber)
    return "#ef4444"; // Bad (Red)
  }, []);

  // Kigaku Vector Styles
  const getStyleForVector = useCallback((status: string) => {
    let color = "#3b82f6";
    let opacity = 0.05;
    let dashArray = undefined;

    if (status.includes("OPTIMAL")) {
      color = "#10b981";
      opacity = 0.12;
    } else if (status.includes("NOISE")) {
      color = "#ef4444";
      opacity = 0.08;
      dashArray = "5,5";
    } else if (status.includes("VOID") || status.includes("NODE")) {
      color = "#f59e0b";
      opacity = 0.08;
    }

    return { color, opacity, dashArray };
  }, []);

  // Render direction sectors
  const sectorLayers = useMemo(() => {
    return sectors.map((d) => {
      const { color, opacity, dashArray } = d.tier
        ? {
            // 天中殺で塞がっている方位は段階に関わらず灰色。俯瞰の県塗りと同じ扱い。
            color: d.blocked
              ? "#a8a29e"
              : (TIER_FILL[d.tier as DayTier] ?? "#a8a29e"),
            opacity: d.blocked
              ? 0.06
              : (TIER_SECTOR_OPACITY[d.tier as DayTier] ?? 0.06),
            dashArray:
              d.blocked || d.tier === "X" || d.tier === "D"
                ? "5,5"
                : (undefined as string | undefined),
          }
        : getStyleForVector(d.status ?? "SAFE");
      const baseBearing = rotationAngle + d.deg;

      // Draw wedge shape polygon extending 30km
      const points: [number, number][] = [[baseLat, baseLon]];
      const isCorner = ["NE", "SE", "SW", "NW"].includes(d.dir);
      const halfWidth = useClassical ? (isCorner ? 30 : 15) : 22.5;

      for (let offset = -halfWidth; offset <= halfWidth; offset += 5) {
        points.push(getDestination(baseLat, baseLon, baseBearing + offset, 30));
      }

      // Label position (centered in the wedge at 5km distance)
      const labelPos = getDestination(baseLat, baseLon, baseBearing, 4);

      const getStatusText = (status: string) => {
        if (status === "OPTIMAL") return "大吉方位";
        if (status === "NOISE") return "凶方位";
        return "通常吉";
      };
      // 段階つきなら「S 三盤吉」の形。時期パネルのセルと同じ記号にして
      // 突き合わせられるようにする。
      const label = d.tier
        ? d.blocked
          ? `${d.dir} 天中殺`
          : `${d.dir} ${d.tier} ${TIER_JP[d.tier as DayTier] ?? ""}`
        : `${d.dir} (${getStatusText(d.status ?? "SAFE")})`;

      return (
        <React.Fragment key={`sector-wedge-${d.dir}`}>
          <Polygon
            positions={points}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: opacity,
              weight: (d.tier ? d.tier === "C" : d.status === "SAFE") ? 0.5 : 1,
              dashArray: dashArray,
            }}
            interactive={false}
          />
          <Marker
            position={labelPos}
            icon={L.divIcon({
              className: "custom-div-icon",
              html: `<div class="px-1.5 py-0.5 rounded bg-white/80 border border-stone-200 text-[9px] font-bold text-center pointer-events-none" style="color: ${color}; text-shadow: 0 0 2px rgba(0,0,0,0.8); white-space: nowrap;">
                ${label}
              </div>`,
              iconSize: [72, 20],
              iconAnchor: [36, 10],
            })}
            interactive={false}
          />
        </React.Fragment>
      );
    });
  }, [
    sectors,
    center,
    baseLat,
    baseLon,
    rotationAngle,
    getStyleForVector,
    useClassical,
  ]);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-stone-100 flex items-center justify-center font-mono text-xs text-stone-500">
        [ 地図エンジンの初期化中... ]
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-stone-200">
      <MapContainer
        center={center}
        zoom={zoom}
        maxZoom={20}
        style={{ height: "100%", width: "100%", background: "#0c0c0e" }}
        zoomControl={false}
      >
        <BoundsListener onBoundsChange={handleBoundsChange} />
        <MapClickHandler onCopy={copyCoordinates} />
        <InvalidateMapSize />
        <MapRefGrabber onMap={handleMapReady} />
        <FocusController
          center={center}
          prefecture={prefecture}
          radiusKm={radiusKm}
          keepWideView={keepWideView}
          hasBase={hasBase}
          focusKind={focusKind}
        />

        {/* OpenStreetMap / CartoDB Tiles (Theme Switchable) */}
        <TileLayer
          key={`tile-layer-${mapTheme}`}
          url={
            mapTheme === "dark"
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={20}
          maxNativeZoom={19}
        />

        {/* Theme Switcher + フォーカスの明示切り替え。
            「今どこを見ているのか」を手で確定できるようにする */}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto flex flex-col items-end gap-1.5">
          <button
            onClick={() => {
              const nextTheme = mapTheme === "dark" ? "light" : "dark";
              setMapTheme(nextTheme);
              localStorage.setItem("map_theme", nextTheme);
              window.dispatchEvent(new Event("mapThemeChanged"));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[9px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
          >
            {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
          </button>
          <div className="flex gap-1">
            {hasBase && (
              <button
                onClick={() =>
                  mapRef.current?.setView(
                    [baseLat, baseLon],
                    zoomForRadius(radiusKm),
                  )
                }
                title="出発地を中心に、検索半径が収まるズームへ"
                className="px-2.5 py-1.5 rounded-lg border font-mono text-[9px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
              >
                📍 出発地へ
              </button>
            )}
            <button
              onClick={() =>
                mapRef.current?.setView(OVERVIEW_CENTER, OVERVIEW_ZOOM)
              }
              title="全国を俯瞰して県ごとの方位の吉凶を見る"
              className="px-2.5 py-1.5 rounded-lg border font-mono text-[9px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
            >
              🗾 全国俯瞰
            </button>
          </div>
        </div>

        {/* 俯瞰の塗り分け切り替え + 凡例。方位モードは
            「どの県へなら動けるか」の意思決定面 */}
        {zoom < 10 && prefKigaku && (
          <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto bg-white/85 backdrop-blur rounded-xl shadow-lg border border-stone-200 p-2.5 text-[9px] text-stone-700 space-y-1.5">
            <div className="flex items-center gap-1 select-none">
              {(
                [
                  ["kigaku", "方位の吉凶"],
                  ["count", "掲載件数"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setOverviewTint(mode)}
                  className={`px-2 py-1 rounded-md font-bold transition-colors ${
                    overviewTint === mode
                      ? "bg-indigo-600 text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {overviewTint === "kigaku" && (
              <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-44">
                {(
                  [
                    ["S", "三盤吉"],
                    ["A", "吉2盤"],
                    ["B", "吉1盤"],
                    ["C", "平"],
                    ["D", "軽い凶"],
                    ["X", "五大凶殺"],
                  ] as const
                ).map(([t, label]) => (
                  <span key={t} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: TIER_FILL[t] }}
                    />
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: "#64748b" }}
                  />
                  天中殺
                </span>
                <span className="block w-full text-[8px] text-stone-400">
                  出発地から見た各県の方位の、選択日の判定
                </span>
              </div>
            )}
          </div>
        )}

        {/* Base Location Marker (Glowing Center) */}
        {zoom >= 10 && (
          <Marker position={[baseLat, baseLon]}>
            <Popup>
              <div className="font-sans text-xs text-gray-900 p-1">
                <div className="font-bold text-indigo-600">
                  現在地・スキャン起点
                </div>
                <div
                  className="text-[10px] text-stone-400 mt-1 cursor-pointer hover:bg-zinc-100 p-1 rounded-md border border-transparent hover:border-zinc-200 transition-all group flex items-center justify-between"
                  onClick={() => copyCoordinates(baseLat, baseLon, "起点")}
                  title="クリックで座標をコピー"
                >
                  <div>
                    経度: {baseLon.toFixed(5)} <br />
                    緯度: {baseLat.toFixed(5)}
                  </div>
                  <Copy className="w-3 h-3 text-stone-600 group-hover:text-stone-400 ml-2" />
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* 詳細パネルで開いている物件の強調リング。ピンの色分けの中で
            「いまどれを見ているか」を見失わないようにする */}
        {(() => {
          if (!selectedPropertyId) return null;
          const sel = properties.find((p) => p.id === selectedPropertyId);
          if (!sel || sel.lat === null || sel.lon === null) return null;
          return (
            <CircleMarker
              center={[sel.lat, sel.lon]}
              radius={16}
              pathOptions={{
                color: "#4f46e5",
                weight: 3,
                fillColor: "#4f46e5",
                fillOpacity: 0.08,
                dashArray: "2,4",
              }}
            />
          );
        })()}

        {/* Pulsing ring around center (matching scan radius) */}
        {zoom >= 10 && radiusKm && radiusKm !== "all" && (
          <Circle
            center={[baseLat, baseLon]}
            radius={Number(radiusKm) * 1000}
            pathOptions={{
              color: "#10b981",
              fillColor: "#10b981",
              fillOpacity: 0.03,
              weight: 1.5,
              dashArray: "4,8",
            }}
          />
        )}

        {/* 都道府県ポリゴン (zoom < 10)。
            塗りは 2 モード。方位モードでは「その県はあなたから見て
            どの方位で、選択日にその方位は動けるのか」を色にする。
            地図がそのまま意思決定面になる。件数ラベルは両モード共通。 */}
        {zoom < 10 && geoData && (
          <GeoJSON
            key={`pref-geo-${overviewTint}-${
              prefKigaku
                ? Object.values(prefKigaku)
                    .map((i) => i.tier + (i.blocked ? "b" : ""))
                    .join("")
                : "none"
            }`}
            data={geoData}
            style={(feature) => {
              const prefName = feature?.properties?.name || "";
              const count = prefCounts[prefName] || 0;
              const info = prefKigaku?.[prefName];
              if (overviewTint === "kigaku" && info) {
                const fill = info.blocked
                  ? "#64748b"
                  : (TIER_FILL[info.tier as DayTier] ?? "#a8a29e");
                return {
                  fillColor: fill,
                  // データの無い県も方位の吉凶は薄く見せる。方位は
                  // 物件の有無と独立に決まる情報なので消さない。
                  fillOpacity: count > 0 ? 0.6 : 0.22,
                  color: "#1e293b",
                  weight: 1.2,
                  opacity: 0.6,
                };
              }
              const color = getDensityColor(count);
              return {
                fillColor: color,
                fillOpacity: count > 0 ? 0.65 : 0.1,
                color: "#1e293b",
                weight: 1.2,
                opacity: 0.6,
              };
            }}
            onEachFeature={(feature, layer) => {
              const prefName = feature?.properties?.name || "";
              const count = prefCounts[prefName] || 0;
              const info = prefKigaku?.[prefName];
              // 俯瞰は数字だけを見せる。物件そのものはズームインした
              // ときに、そのとき見えている範囲だけを検索して出す。
              if (count > 0) {
                layer.bindTooltip(
                  `<div class="text-center leading-tight">
                     <div class="font-bold text-[11px]">${count.toLocaleString()}</div>
                   </div>`,
                  {
                    permanent: true,
                    direction: "center",
                    className: "pref-count-label",
                  },
                );
              }
              const kigakuLine = info
                ? `<div class="mt-1">方位: <b>${info.directionLabel}</b> — ${
                    info.blocked
                      ? '<b class="text-slate-500">天中殺で移転不可</b>'
                      : `<b>${TIER_JP[info.tier as DayTier] ?? info.tier}</b>`
                  }<span class="text-[9px] text-stone-500">（選択日の判定）</span></div>`
                : "";
              layer.bindPopup(
                `<div class="font-sans text-xs text-gray-900 p-2 min-w-[120px]">
                  <div class="font-bold text-sm border-b border-gray-100 pb-1 mb-1.5">${prefName}</div>
                  <div>掲載物件数: <b class="text-indigo-600 text-sm">${count.toLocaleString()}</b> 件<span class="text-[9px] text-stone-500">（毎晩更新）</span></div>
                  ${kigakuLine}
                  <div class="text-[9px] text-stone-500 mt-1.5">※ズームインすると物件が表示されます</div>
                </div>`,
              );
            }}
          />
        )}

        {/* 方位の扇形。詳細ズームでは常に描く。
            以前は「ピンを個別表示しているときだけ」という条件付きで、
            物件が少ないとき（クラスター表示）に扇形が黙って消えていた。
            方位の吉凶はこの画面の主役なので、物件の数で消えてはいけない。
            市区町村バブル（件数の画面）のときだけ引っ込める */}
        {zoom >= 10 && !showHeatmap && sectorLayers}

        {/* Viewport content based on Zoom and Heatmap/Cluster/Pin State */}
        {zoom >= 10 &&
          (showHeatmap && visibleCount > 100
            ? // 1. 広域表示：市区町村バブル (温度計と連動)
              municipalityData.map((muni) => {
                const color = getDensityColor(muni.count);
                const coreRadius = Math.max(
                  8,
                  Math.min(25, 6 + Math.log2(muni.count) * 3),
                );
                const glowRadius = coreRadius * 2.2;
                const hasGlow = muni.count > 10;

                return (
                  <React.Fragment key={`muni-${muni.name}`}>
                    {hasGlow && (
                      <CircleMarker
                        center={[muni.lat, muni.lon]}
                        radius={glowRadius}
                        pathOptions={{
                          stroke: false,
                          fillColor: color,
                          fillOpacity: 0.18,
                        }}
                        interactive={false}
                      />
                    )}
                    <CircleMarker
                      center={[muni.lat, muni.lon]}
                      radius={coreRadius}
                      pathOptions={{
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.8,
                        weight: 2.5,
                        opacity: 0.6,
                      }}
                    >
                      <Popup>
                        <div className="font-sans text-xs text-gray-900 p-2 min-w-[150px]">
                          <div className="font-bold text-sm text-gray-900 leading-tight border-b border-gray-100 pb-1 mb-1.5">
                            {muni.name}
                          </div>
                          <div className="space-y-1 text-stone-400">
                            <div className="flex justify-between">
                              <span>検出物件数:</span>
                              <span className="font-bold text-gray-900">
                                {muni.count}件
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>平均推奨度:</span>
                              <span className="font-bold text-emerald-600">
                                {muni.avgScore.toFixed(1)}点
                              </span>
                            </div>
                          </div>
                          <div className="text-[9px] text-stone-500 mt-2 text-center">
                            ※ズームインすると詳細物件ピンが表示されます
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  </React.Fragment>
                );
              })
            : visibleCount <= 100 && !showListView && zoom < 15
              ? // 2. 100件以下で、かつ一覧ボタンが押されていない状態：物理距離クラスター（白丸バッジ）
                clusters.map((cluster, idx) => {
                  return (
                    <Marker
                      key={`cluster-${idx}`}
                      position={[cluster.lat, cluster.lon]}
                      icon={L.divIcon({
                        className: "custom-cluster-icon",
                        html: `<div class="w-8 h-8 rounded-full bg-white border-2 border-indigo-500 shadow-[0_2.5px_8px_rgba(79,70,229,0.35)] text-indigo-600 font-extrabold text-xs flex items-center justify-center transition-transform hover:scale-105 pointer-events-auto">
                      ${cluster.count}
                    </div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                      })}
                      eventHandlers={{
                        click: (e) => {
                          const map = e.target._map;
                          map.setView(
                            [cluster.lat, cluster.lon],
                            Math.min(16, map.getZoom() + 2),
                          );
                        },
                      }}
                    />
                  );
                })
              : // 3. 詳細表示：個別物件ピン
                (() => {
                  const sortedProperties = [...properties].sort((a, b) => {
                    const getPriority = (p: any) => {
                      const targetDay = p.dateScores?.[3];
                      const isUltra = targetDay?.isUltraLucky;
                      const isHeavyBad = [
                        "NOISE_GOU",
                        "NOISE_ANKEN",
                        "NOISE_HA",
                        "NOISE_HONMEI",
                        "NOISE_TEKI",
                      ].includes(p.astrologyStatus);
                      if (isUltra || isHeavyBad) return 3;

                      const details = targetDay?.scoreDetails;
                      const hasLightBad =
                        (details &&
                          (details.doyouPenalty < 0 ||
                            details.voidPenalty < 0)) ||
                        [
                          "NOISE_VOID",
                          "NOISE_NODE",
                          "NOISE_GETSUMEI",
                          "NOISE_GETSUTEKI",
                        ].includes(p.astrologyStatus);
                      const hasLucky =
                        p.isTendo ||
                        ["OPTIMAL", "SAFE"].includes(p.astrologyStatus) ||
                        p.astroFlags?.some((f: string) => f.endsWith("_LINE"));

                      if (hasLucky && !hasLightBad) return 2;
                      return 1;
                    };
                    return getPriority(a) - getPriority(b);
                  });

                  return sortedProperties.map((prop) => {
                    if (!prop.lat || !prop.lon) return null;

                    // 扇形と同じ段階を渡す。盤の切り替えで単盤が吉でも、
                    // 三盤で凶ならピンも凶側に寄せる。
                    const k = prop.direction
                      ? dirKigaku?.[prop.direction]
                      : undefined;
                    const pinColors = getPropertyPinColors(
                      prop,
                      k?.tier,
                      k?.blocked,
                    );
                    const isTodayUltra = prop.dateScores?.[3]?.isUltraLucky;

                    return (
                      <CircleMarker
                        key={prop.id}
                        center={[prop.lat, prop.lon]}
                        radius={isTodayUltra ? 8 : 6}
                        pathOptions={{
                          color: pinColors.borderColor,
                          fillColor: pinColors.fillColor,
                          fillOpacity: isTransitioningDate ? 0.3 : 0.9,
                          weight: isTodayUltra ? 2.5 : 1.5,
                        }}
                        className={isTransitioningDate ? "animate-pulse" : ""}
                      >
                        <Popup className="arbitrage-property-popup">
                          <div className="font-sans text-xs text-gray-900 p-2 min-w-[220px] max-w-[280px]">
                            <div
                              className={`font-bold text-xs leading-tight p-2 -mx-2 -mt-2 rounded-t-lg border-b ${pinColors.bgClass} ${pinColors.textClass} flex justify-between items-center`}
                            >
                              <span className="line-clamp-1">
                                {prop.property_name}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/70 dark:bg-stone-200/70 font-bold shrink-0 ml-1">
                                {pinColors.label}
                              </span>
                            </div>

                            {prop.is_new_build && (
                              <span className="inline-block bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded mt-2 mr-1">
                                新築
                              </span>
                            )}
                            {prop.floor && (
                              <span className="inline-block bg-gray-100 text-gray-800 text-[9px] font-medium px-1.5 py-0.5 rounded mt-2">
                                {prop.floor}
                              </span>
                            )}

                            <div className="mt-2.5 border-t border-gray-100 pt-2 space-y-1 text-stone-400 text-[11px]">
                              <div className="flex justify-between">
                                <span>総賃料:</span>
                                <span className="font-bold text-gray-900">
                                  {prop.totalRent
                                    ? `${(prop.totalRent / 10000).toFixed(1)}万円`
                                    : "不明"}
                                  {prop.management_fee
                                    ? ` (管:${(prop.management_fee / 1000).toFixed(0)}k)`
                                    : ""}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>広さ / 間取り:</span>
                                <span className="font-medium text-gray-900">
                                  {prop.size_sqm}㎡ / {prop.layout || "不明"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>築年 / 駅徒歩:</span>
                                <span className="font-medium text-gray-900">
                                  築{prop.building_age || 0}年 /{" "}
                                  {prop.minutes_to_station || "不明"}分
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span>方位・吉凶:</span>
                                <span
                                  className={`font-semibold ${pinColors.textClass}`}
                                >
                                  {prop.direction
                                    ? `${prop.direction} (${prop.maxAstroFactor})`
                                    : "不明"}
                                </span>
                              </div>
                              {/* 三盤の段階。扇形・時期パネルと同じ値。
                                  上の行は選択中の盤（単盤）の内訳なので
                                  一致しないことがある */}
                              {k && (
                                <div className="flex justify-between items-center">
                                  <span>三盤の判定:</span>
                                  <span
                                    className="font-semibold"
                                    style={{
                                      color: k.blocked
                                        ? "#64748b"
                                        : (TIER_FILL[k.tier as DayTier] ??
                                          "#64748b"),
                                    }}
                                  >
                                    {k.blocked
                                      ? "天中殺"
                                      : `${k.tier} ${TIER_JP[k.tier as DayTier] ?? ""}`}
                                  </span>
                                </div>
                              )}
                              <div
                                className="flex justify-between items-center mt-1 cursor-pointer hover:bg-gray-100 p-0.5 rounded transition-colors group"
                                onClick={() =>
                                  copyCoordinates(
                                    prop.lat!,
                                    prop.lon!,
                                    prop.property_name,
                                  )
                                }
                                title="クリックで座標をコピー"
                              >
                                <span>緯度経度:</span>
                                <span className="font-mono text-[9px] text-stone-500 flex items-center gap-1 group-hover:text-stone-400">
                                  {prop.lat!.toFixed(5)}, {prop.lon!.toFixed(5)}
                                  <Copy className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 bg-gray-50 rounded-lg p-2 flex justify-between items-center text-[10px] border border-gray-100">
                              <div>
                                <div className="text-stone-500">
                                  利回り偏差値
                                </div>
                                <div className="font-mono font-bold text-indigo-600 text-xs">
                                  {prop.yieldScore.toFixed(1)}
                                </div>
                              </div>
                              <div className="text-right border-l border-gray-200 pl-2">
                                <div className="text-stone-400 font-medium">
                                  おすすめ度
                                </div>
                                <div className="flex gap-0.5 text-amber-600 mt-0.5">
                                  {(() => {
                                    const starCount =
                                      getRecommendationStarCount(
                                        prop.totalScore,
                                        prop.astrologyStatus,
                                      );
                                    return Array.from({ length: 5 }).map(
                                      (_, i) => (
                                        <span
                                          key={i}
                                          className={
                                            i < starCount
                                              ? "opacity-100 text-amber-600"
                                              : "opacity-20 text-stone-400"
                                          }
                                        >
                                          ★
                                        </span>
                                      ),
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3">
                              <AstroGridCalendar
                                dateScores={prop.dateScores}
                                onDateChange={onDateChange}
                                isTransitioning={isTransitioningDate}
                              />
                            </div>

                            {prop.url && (
                              <a
                                href={prop.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 block w-full py-1.5 text-center text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-stone-900 rounded-lg transition-colors shadow-sm"
                              >
                                詳細サイトを開く ↗
                              </a>
                            )}
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  });
                })())}
      </MapContainer>

      {/* 件数の温度計。数を色で塗っている画面（俯瞰の件数モード、
          広域の市区町村バブル）のときだけ出す。方位の吉凶を見ている
          画面に出すと「この赤は件数？凶？」の取り違えになる */}
      {((zoom < 10 && (overviewTint === "count" || !prefKigaku)) ||
        (zoom >= 10 && showHeatmap)) && (
        <div className="absolute top-4 left-4 bg-white/80 text-stone-900 px-3 py-3.5 rounded-2xl shadow-xl border border-stone-200 backdrop-blur text-[10px] pointer-events-auto z-[1000] flex flex-col gap-1.5 w-18 items-center">
          <div className="font-bold text-[9px] text-stone-600 tracking-tight text-center pb-0.5 border-b border-stone-200 w-full">
            件数
          </div>
          <div className="flex items-stretch h-36 gap-2 w-full justify-center pt-1">
            <div className="w-2.5 rounded-full bg-gradient-to-t from-[#818cf8] via-[#10b981] via-[#fbbf24] to-[#ef4444] border border-stone-200" />
            <div className="flex flex-col justify-between text-[7.5px] font-mono text-stone-500 select-none">
              <span>{maxPrefOrBubbleCount.toLocaleString()}</span>
              <span>
                {Math.round(maxPrefOrBubbleCount * 0.75).toLocaleString()}
              </span>
              <span>
                {Math.round(maxPrefOrBubbleCount * 0.5).toLocaleString()}
              </span>
              <span>
                {Math.round(maxPrefOrBubbleCount * 0.25).toLocaleString()}
              </span>
              <span>0</span>
            </div>
          </div>
        </div>
      )}

      {/* 吉凶の凡例（右下）。扇形・ピン・俯瞰の県塗り・時期パネルの
          すべてが同じ段階（S〜X）なので、凡例もこの一つだけ。
          命式が未入力で段階を出せないときだけ、従来の単盤の凡例に落ちる */}
      {dirKigaku ? (
        <div className="absolute bottom-4 right-4 bg-white/80 text-stone-900 px-3.5 py-3 rounded-xl shadow-lg border border-stone-200 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-1.5">
          <div className="font-bold border-b border-stone-200 pb-1 text-stone-600">
            方位の吉凶
            {targetDate
              ? `（${targetDate.slice(5).replace("-", "/")} 時点）`
              : ""}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {(["S", "A", "B", "C", "D", "X"] as const).map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full border border-stone-300"
                  style={{ background: TIER_FILL[t] }}
                ></span>
                <span>
                  {t} {TIER_JP[t]}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full border border-stone-300"
                style={{ background: BLOCKED_FILL }}
              ></span>
              <span>天中殺</span>
            </div>
          </div>
          <span className="block text-[8px] text-stone-400 max-w-48 leading-relaxed">
            年・月・日の三盤を合成した選択日の判定。扇形もピンも同じ段階で
            塗っています。物件ごとの違いは条件の良さ（スコア・星数）で
            見てください。
          </span>
        </div>
      ) : (
        <div className="absolute bottom-4 right-4 bg-white/80 text-stone-900 px-3.5 py-3 rounded-xl shadow-lg border border-stone-200 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-2">
          <div className="font-bold border-b border-stone-200 pb-1 mb-0.5 text-stone-600">
            アストロ吉凶（凡例）
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] border border-[#b45309] shadow-[0_0_8px_rgba(251,191,36,0.6)]"></span>
              <span className="font-bold text-amber-600">
                超大吉 (木星ライン特選)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] border border-[#b45309]"></span>
              <span>超吉 (最上吉)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] border border-[#065f46]"></span>
              <span>吉 (相性抜群)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] border border-[#7c2d12]"></span>
              <span>警告・調整方位</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] border border-[#78350f]"></span>
              <span>注意 (軽い凶)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] border border-[#7f1d1d]"></span>
              <span>大凶 (大凶方位)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#475569] border border-[#1e293b]"></span>
              <span>通常 (吉凶なし)</span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="absolute top-20 left-1/2 z-[2000]"
          >
            <div className="bg-white/80 text-stone-800 px-4 py-2 rounded-full border border-stone-300 shadow-2xl flex items-center gap-2 backdrop-blur-md">
              {toast.type === "success" ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4 text-indigo-600" />
              )}
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {toast.message}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

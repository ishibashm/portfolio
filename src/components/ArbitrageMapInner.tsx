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
import { readMapViewport, type MapViewport } from "@/utils/mapViewport";
import type { DayTier } from "@/utils/auspiciousDays";
import type { ScoredProperty } from "@/lib/scoredProperty";
import type { FeatureCollection } from "geojson";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import { HazardTileOverlay } from "@/components/HazardTileOverlay";
import { AerialThumb } from "@/components/relocation/AerialThumb";
import { clusterByTile, shouldCluster } from "@/lib/mapClusters";
import {
  BASE_MAPS,
  BASE_MAP_ORDER,
  DARK_TILE_CLASS,
  HILLSHADE,
  parseBaseMapId,
  type BaseMapId,
} from "@/lib/baseMapLayers";
import {
  HAZARD_TABS,
  HAZARD_STORAGE_KEY,
  normalizeHazardTab,
  type HazardTabId,
} from "@/lib/hazardLayers";
import { ZoningLayer } from "@/components/relocation/ZoningLayer";
import { ZoningLegend } from "@/components/relocation/ZoningLegend";
import type { ZoningName } from "@/utils/zoning";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Copy, Check } from "lucide-react";
import { CurrentLocationLayer } from "@/components/map/CurrentLocationLayer";
import { useMapTheme } from "@/lib/useMapTheme";
import { AstroGridCalendar } from "./realestate/AstroGridCalendar";
import { getPropertyPinColors } from "@/utils/arbitrageHelpers";
import { OVERVIEW_CENTER, OVERVIEW_ZOOM } from "@/utils/arbitrageSearchArea";
import {
  destinationAtBearing,
  directionWedgeHalfWidth,
  directionWedgePoints,
  wedgeRangeKmForBounds,
  type CompassDirection,
} from "@/utils/directionGeo";
import {
  TIER_FILL,
  TIER_JP,
  TIER_SECTOR_OPACITY,
  BLOCKED_FILL,
} from "@/utils/tierDisplay";
import prefecturesWithData from "@/data/prefecturesWithData.json";
import { MapClickPicker } from "@/components/map/MapClickPicker";

// 既定アイコンの下ごしらえ。理由と型の話は @/lib/leafletDefaultIcon に集約。
applyLeafletDefaultIcon();

/**
 * 俯瞰と近景の境目のズーム。これ未満なら県の塗り分け、以上なら物件のピン。
 * 表示範囲が API の絞り込みに使われる下限（geographyParamsForSearch）と同じ値。
 */
const OVERVIEW_ZOOM_MAX = 10;

/** 扇形を消したかどうかを覚えておく先。地図のテーマ（map_theme）と同じ扱い。 */
const SECTORS_STORAGE_KEY = "arbitrage_show_sectors";

/**
 * 検索半径から表示ズームを引く。初回表示と「出発地へ」ボタンで使う。
 *
 * フォーカスの初期値を物件の分布（fitBounds）で決めると、データの
 * 到着順で毎回違う画角になる。半径は利用者が選んだ確定値なので、
 * これだけから決めれば同じ条件では常に同じ画角になる。
 * 下限の 10 は俯瞰と近景の境目（OVERVIEW_ZOOM_MAX）。ここより引くと
 * 物件のピンが県の塗り分けに変わる。
 */
function zoomForRadius(radiusKm?: string): number {
  const km = Number(radiusKm);
  if (!Number.isFinite(km) || km <= 0) return 10; // "all" など
  if (km <= 15) return 12;
  if (km <= 35) return 11;
  return 10;
}

/**
 * 地図の空きを押したときの受け口。
 *
 * 以前はここで座標をクリップボードへ写していた。地点の判定を見るには
 * それを絞り込み欄へ貼り直す必要があり、手が 1 つ余計に要る。判定へ
 * 直接送る（onPick）。座標を写したいときは、起点や物件のカードに
 * 「座標をコピー」のボタンが別にある。
 */
interface ArbitrageMapInnerProps {
  properties: ScoredProperty[];
  baseLat: number;
  baseLon: number;
  mapCenter?: [number, number];
  /**
   * 真北で見るか磁北で見るか。今は扇形を真北に統一したため描画には
   * 効いていない。真北・磁北を明示的な方位基準として扱い、物件判定・
   * 県判定・扇形・移動履歴を同じ計算に寄せる別 PR の受け口として残す。
   */
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
   * prefKigaku が無いときの理由（「生年月日を入れると…」）。
   *
   * 以前はここが空だと切り替えパネルごと消え、県塗りが「方位の吉凶」から
   * 「掲載件数」へ無言で入れ替わっていた。どちらも同じ県を色で塗るので、
   * 件数の色が吉凶に見える。理由を受け取って凡例に出す。
   */
  kigakuUnavailableReason?: string;
  /**
   * 県名 → 掲載件数。俯瞰の県ラベルと「件数」塗りが読む。
   *
   * 渡されないときは src/data/prefecturesWithData.json（毎晩作る静的な
   * 値）に落ちる。**絞り込みを掛けているあいだはページ側が数え直した値を
   * 渡す。**静的な値だけを見ていたころは、条件をどう変えても県の数字が
   * 動かず、絞り込んだあとの分布を読み違えた。
   */
  prefCounts?: Record<string, number>;
  /**
   * 上の prefCounts が絞り込みを反映した値か。
   *
   * 反映できるのは SQL で表せる条件（家賃・間取り・築年・徒歩・広さ）
   * だけで、方位や吉凶は含まれない。数字の意味が変わるので、凡例に
   * 断りを出すためのフラグとして受け取る。
   */
  prefCountsFiltered?: boolean;
  /** 地図の表示範囲に入る掲載件数（名寄せ前）。null なら出さない */
  /**
   * 地図の空きを押したときに、その地点を判定へ送る。
   *
   * 渡さないときは従来どおり座標をクリップボードへ写す。
   */
  onInspectSpot?: (lat: number, lon: number) => void;
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
  onBoundsChange?: (bounds: MapViewport) => void;
}) {
  /*
    読めないときは黙る。スマホで一覧へ切り替えると器が display:none に
    なり、その寸法変化で invalidateSize → moveend が飛ぶ。そのとき
    getBounds() は**一点に潰れた範囲**を返すので、そのまま流すと
    「範囲内 0 件」になる（利用者報告）。readMapViewport が null を
    返すあいだは前の範囲を保つ。詳しい経緯は utils/mapViewport。
  */
  const map = useMap();
  const publish = () => {
    if (!onBoundsChange) return;
    const viewport = readMapViewport(map);
    if (!viewport) return;
    onBoundsChange(viewport);
  };
  useMapEvents({
    moveend: publish,
    zoomend: publish,
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

/** 用途地域を出すかどうかを端末に残す鍵。 */
const ZONING_STORAGE_KEY = "arb_zoning_on";
/** 下地（ベースマップ）の選択。ハザード・用途地域と同じく端末に残す。 */
const BASE_MAP_STORAGE_KEY = "arb_base_map";

/**
 * レイヤーの目的プリセット。
 *
 * 重ねられる層が 10 あり、1 つずつ切り替えると目的の画面にするまで
 * 4〜5 押し掛かる（#34）。実際の使い方は「方位で物件を選ぶ」と
 * 「決めた場所の土地を調べる」の 2 通りに割れているので、その 2 通りを
 * 1 押しにする。**個別の切り替えは下にそのまま残す**（プリセットは
 * 出発点で、そこから微調整できる）。
 *
 * プリセットの選択は保存しない。個別の層の選択が既に端末に残るので、
 * プリセットも「個別の層をまとめて切り替えるボタン」でしかない。
 * どれが点灯するかは**今の層の組み合わせから引く**（近景⇄全国と同じ。
 * 状態変数を持つと、個別に触ったときに表示と実態が食い違う）。
 */
const LAYER_PRESETS = {
  property: {
    label: "🏠 物件を選ぶ",
    note: "地図と方位だけにする（ハザード・用途地域・地形を消す）",
    baseMap: "std" as BaseMapId,
    hillshade: false,
    hazardTab: "none" as HazardTabId,
    zoningOn: false,
    showSectors: true,
  },
  land: {
    label: "⛰️ 土地を調べる",
    note: "洪水ハザード・用途地域・陰影を淡色の地図に重ねる（方位の扇形は消す）",
    baseMap: "pale" as BaseMapId,
    hillshade: true,
    hazardTab: "flood" as HazardTabId,
    zoningOn: true,
    showSectors: false,
  },
} as const;
type LayerPresetId = keyof typeof LAYER_PRESETS;
const LAYER_PRESET_ORDER: LayerPresetId[] = ["property", "land"];

export default function ArbitrageMapInner({
  properties,
  baseLat,
  baseLon,
  mapCenter,
  // layerMode は受け口だけ残す。呼び出し側が渡しており、消すとずれる
  // （CLAUDE.md 3 節。BioMagneticDashboard が見本）。
  radiusKm,
  prefecture,
  keepWideView = false,
  prefKigaku,
  dirKigaku,
  kigakuUnavailableReason,
  prefCounts: prefCountsProp,
  prefCountsFiltered = false,
  onInspectSpot,
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
  /**
   * 俯瞰（全国）か近景か。ズーム 10 を境に、県ごとの塗り分けと物件の
   * ピンが入れ替わる。扇形は両方で描く。
   */
  const isOverview = zoom < OVERVIEW_ZOOM_MAX;
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const { mapTheme, toggleMapTheme } = useMapTheme();
  /**
   * 扇形を描くか。
   *
   * 扇形は画面の端まで届く長さで 8 枚描くので、地図の上に常に 8 色が
   * 乗っている。方位を決めたあと「この辺に何があるか」を見たいときは、
   * 地形も駅名も色の下になって読めない。見たいときに出せる形にする。
   *
   * **既定は表示のまま。**この画面の主役は方位の吉凶で、初めて開いた人に
   * 出ていないと、何を見る画面なのかが分からない。消す判断は利用者に任せ、
   * その選択だけを localStorage に覚えさせる（地図のテーマと同じ扱い）。
   */
  const [showSectors, setShowSectors] = useState(true);
  /*
    現在地。**押されるまで購読しない。**開いた瞬間に位置情報の許可を
    聞く画面は嫌われるので、既定は消えている（useWatchedPosition の註）。

    follow は「地図を現在地に追わせるか」。Google マップと同じで、
    地図を手で動かしたら切れる（引き戻されると操作できないため）。
  */
  const [locateOn, setLocateOn] = useState(false);
  const [locateFollow, setLocateFollow] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  /* 子から毎レンダリング新しい関数を渡すと effect が回り直すので、
     ここで固定する。 */
  const handleLocateFollowBroken = useCallback(() => {
    setLocateFollow(false);
  }, []);
  /*
    地図の下地。既定は標準地図（"std"）。全部が地理院タイル。
    選択は端末に残す。ハザードのタブと同じく、effect ではなく
    遅延初期化で読む。
  */
  const [baseMap, setBaseMap] = useState<BaseMapId>(() =>
    typeof window === "undefined"
      ? "std"
      : parseBaseMapId(localStorage.getItem(BASE_MAP_STORAGE_KEY)),
  );
  /* 陰影起伏の重ね描き。下地が写真・地形のときに起伏が読めるようになる。 */
  const [hillshade, setHillshade] = useState(false);
  /*
    地図を画面いっぱいに出すか。

    スマホで**地図がほとんど見えない**という指摘があった（利用者の実機）。
    右上の操作が縦に 6 つ積まれ、そこに用途地域の凡例（13 区分）が加わって
    画面幅の半分以上を覆っていた。器の高さを増やすのがいちばん効く。
  */
  const [fullscreen, setFullscreen] = useState(false);
  /*
    右上の操作をたたむか。**狭い画面では既定で閉じる。**

    広い画面では出したままのほうが早い（押す手間が 1 つ減る）が、
    狭い画面では出したままだと地図が見えない。lg の境（1024px）で分ける。
    effect ではなく遅延初期化で読む（set-state-in-effect を避ける）。
  */
  const [controlsOpen, setControlsOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
  /*
    重ねるハザードマップ（国交省）のタブ。"none" で消す。選択は端末に残す。
    effect で読むと set-state-in-effect の警告になるので遅延初期化で読む
    （この部品は ssr:false で読まれるが、念のため window の有無は見る）。
  */
  const [hazardTab, setHazardTab] = useState<HazardTabId>(() =>
    typeof window === "undefined"
      ? "none"
      : normalizeHazardTab(localStorage.getItem(HAZARD_STORAGE_KEY)),
  );
  /*
    用途地域（都市計画法）の重ね描き。既定は消えている。

    参考として重ねるだけで、**方位の吉凶の判定には一切入らない。**
    選択は端末に残す（ハザードのタブと同じ扱い）。
  */
  const [zoningOn, setZoningOn] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(ZONING_STORAGE_KEY) === "on",
  );
  /** 1 区分だけを見るときの選択。色だけでは 13 区分を見分けられないため。 */
  const [zoningPick, setZoningPick] = useState<ZoningName | null>(null);
  /** 縮尺が足りない・全部は出せていない、などの断り。 */
  const [zoningNotice, setZoningNotice] = useState<string | null>(null);

  /**
   * 今の層の組み合わせが一致するプリセット。個別に触ると外れる
   * （どちらも点灯しない）。それでよい——プリセットは出発点であって、
   * 微調整を禁じるものではない。
   */
  const activeLayerPreset = LAYER_PRESET_ORDER.find((id) => {
    const p = LAYER_PRESETS[id];
    return (
      baseMap === p.baseMap &&
      hillshade === p.hillshade &&
      hazardTab === p.hazardTab &&
      zoningOn === p.zoningOn &&
      showSectors === p.showSectors
    );
  });

  /** 個別ボタンと同じ書き込み先（localStorage 含む）をまとめて叩く。 */
  const applyLayerPreset = (id: LayerPresetId) => {
    const p = LAYER_PRESETS[id];
    setBaseMap(p.baseMap);
    localStorage.setItem(BASE_MAP_STORAGE_KEY, p.baseMap);
    setHillshade(p.hillshade);
    setHazardTab(p.hazardTab);
    localStorage.setItem(HAZARD_STORAGE_KEY, p.hazardTab);
    setZoningOn(p.zoningOn);
    localStorage.setItem(ZONING_STORAGE_KEY, p.zoningOn ? "on" : "off");
    /* 消すときは絞り込みも戻す。個別ボタンと同じ理由（次に出したとき
       1 区分だけ残っていると、消えているように見える）。 */
    if (!p.zoningOn) setZoningPick(null);
    setShowSectors(p.showSectors);
    localStorage.setItem(SECTORS_STORAGE_KEY, p.showSectors ? "1" : "0");
  };

  // 俯瞰の塗り分け。方位の吉凶（意思決定）か、掲載件数（データの厚み）か。
  const [overviewTint, setOverviewTint] = useState<"kigaku" | "count">(
    "kigaku",
  );
  /**
   * 実際に塗っている側。判定が出せないときは選択に関わらず件数で塗るので、
   * ボタンの強調・凡例・温度計はこちらを見る。既定が "kigaku" なので、
   * overviewTint をそのまま見るとどのボタンも強調されないまま
   * 件数の色を塗る、という食い違いが出る。
   */
  const effectiveTint: "kigaku" | "count" = prefKigaku ? overviewTint : "count";
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

  /* 明暗の読み出しと購読は useMapTheme に寄せた（#774）。
     ここに残るのは、この地図だけが持つ 3 つ。 */
  useEffect(() => {
    setMounted(true);

    // 既定は表示。"0" が入っているときだけ消す。未設定と「消した」を
    // 取り違えないよう、真偽値の文字列ではなく明示の "0" だけを見る。
    if (localStorage.getItem(SECTORS_STORAGE_KEY) === "0")
      setShowSectors(false);
  }, []);

  /*
    県の輪郭（141 KB）は俯瞰（zoom < 10）でしか描かない。以前は開いた
    時点で必ず取りに行っていて、出発地の周りを見るだけの利用者にも
    141 KB を最優先で落としていた（遅い回線の実測で、その間タイルが
    後回しになる）。俯瞰に入って初めて読み、一度読んだら持ち続ける。
  */
  useEffect(() => {
    if (zoom >= 10 || geoData) return;
    let alive = true;
    fetch("/prefectures.geojson")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load prefectures.geojson");
        return res.json();
      })
      .then((data) => {
        if (alive) setGeoData(data);
      })
      .catch((err) => console.error("Error loading prefectures.geojson:", err));
    return () => {
      alive = false;
    };
  }, [zoom, geoData]);

  // 県別の色分けと件数ラベルの元。
  //
  // 以前は API が返した properties（安い順・最大 500 件）を県名で数えて
  // いた。母数が 500 件では安い県だけが濃く出るうえ、俯瞰のためだけに
  // 全国 45 万行の名寄せを走らせることになる。俯瞰に要るのは県ごとの
  // 数字だけなので、build_area_dataset.ts が毎晩数えて静的に配る値を使う。
  // 取り込みが進んで新しい県にデータが載れば、翌朝ここも自動で増える。
  //
  // 絞り込みが掛かっているあいだは、ページ側が数え直した値（prefCountsProp）
  // を優先する。静的な値だけを見ていたころは依存配列も空で、条件をどう
  // 変えても県の数字が動かなかった。
  const prefCounts: Record<string, number> = useMemo(
    () =>
      prefCountsProp ??
      (prefecturesWithData as { listingCounts?: Record<string, number> })
        .listingCounts ??
      {},
    [prefCountsProp],
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

  /*
    個別ピンを描く対象。**画面の外の物件までピンを作っていた。**

    3 つ目の枝（詳細表示）は properties をそのまま並べていたので、
    候補の上限 500 件ぶんの Marker が、画面に入っていないものも含めて
    作られる。Leaflet は 1 つずつ DOM を持つので、混んだ地域ほど
    そのまま重くなる（利用者から「スマホだと地図の表示に時間がかかる」
    と報告）。見えないものは作らない。

    端は少し余分に見る。境界が更新されるのは moveend / zoomend なので、
    指で動かしている最中は古い境界のままになる。ぴったりで切ると
    その間に縁が空く。画面の 25% ぶん外まで含めておけば、動かし終える
    前に穴が見えることはない。

    **画面に入っている物件の見え方は 1 つも変えていない。**
  */
  const pinProperties = useMemo(() => {
    if (!currentBounds) return properties;

    const latPad = (currentBounds.maxLat - currentBounds.minLat) * 0.25;
    const lonPad = (currentBounds.maxLon - currentBounds.minLon) * 0.25;

    return properties.filter((p) => {
      if (p.lat === null || p.lon === null) return false;
      return (
        p.lat >= currentBounds.minLat - latPad &&
        p.lat <= currentBounds.maxLat + latPad &&
        p.lon >= currentBounds.minLon - lonPad &&
        p.lon <= currentBounds.maxLon + lonPad
      );
    });
  }, [properties, currentBounds]);

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
  /**
   * 扇形は真北で描く。
   *
   * 以前はここで磁北ぶん（東京固定の -8.2 度）回していた。ところが同じ
   * 画面の他の 2 つは真北で方位を決めている。
   *
   *   物件のピン   API の direction = getDirectionFromBearing(trueBearing)
   *   県の塗り分け directionFromBearing(bearingBetween(...))
   *
   * 扇形だけが 8.2 度ずれた状態で、東京を出発地にすると 47 県中 17 県が
   * 扇形と県塗りで別の方位を指していた。30km のうちは横ずれが 4km で
   * 見えなかったが、扇形を画面いっぱいに伸ばすと 1500km 先で約 210km に
   * なり、同じ画面に矛盾した 2 つの答えが並ぶ。
   *
   * 真北へ揃えて、3 つが同じ基準になる状態にする。
   *
   * 磁北そのものを落としたわけではない。真北・磁北を明示的な基準として
   * 扱い、判定・API・移動履歴まで含めて計算を一本化するのは別 PR。
   * useTrueNorth は受け口として interface に残してある。
   */

  /** 八方位の区切り方。県の塗り分け（dayKigaku）と同じ規則を使う。 */
  const sectorNodeMapping: "traditional" | "physical" = useClassical
    ? "traditional"
    : "physical";

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
          properties: [],
        };
      }
      groups[muni].latSum += p.lat;
      groups[muni].lonSum += p.lon;
      groups[muni].count += 1;
      groups[muni].properties.push(p);
    });

    return Object.values(groups).map((g) => ({
      name: g.name,
      lat: g.latSum / g.count,
      lon: g.lonSum / g.count,
      count: g.count,
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
   * 個人の判定が 1 件でも届いているか。
   *
   * 生年月日が未入力のとき、API は astrologyStatus を返さない
   * （本命殺・天中殺・空亡はそこから決まるので、無いものを作らない）。
   * 扇形もピンも凡例も、この状態では吉凶を名乗らない。
   */
  const hasPersonalVerdict = useMemo(
    () => properties.some((p) => Boolean(p.astrologyStatus)),
    [properties],
  );

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
    const dirMap: { dir: CompassDirection; deg: number }[] = [
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
      // 判定が 1 件も無いなら、多数決を取る材料が無い。既定の "SAFE"
      // （＝凶方位ではない）に落とすと、根拠なく「平穏」と塗ることになる。
      if (!hasPersonalVerdict) {
        return {
          ...d,
          tier: null as string | null,
          blocked: false,
          status: null as string | null,
        };
      }
      // フォールバック: 物件の status の多数決（単盤・参考値）
      const propsInDir = properties.filter((p) => p.direction === d.dir);
      let status = "SAFE";
      if (propsInDir.length > 0) {
        const optimalCount = propsInDir.filter((p) =>
          (p.astrologyStatus ?? "").includes("OPTIMAL"),
        ).length;
        const noiseCount = propsInDir.filter((p) =>
          (p.astrologyStatus ?? "").includes("NOISE"),
        ).length;
        if (optimalCount > 0) status = "OPTIMAL";
        else if (noiseCount > propsInDir.length / 2) status = "NOISE";
      }
      return { ...d, tier: null as string | null, blocked: false, status };
    });
  }, [properties, dirKigaku, hasPersonalVerdict]);

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

  /**
   * 扇形の長さ。表示中の矩形の四隅までの最大距離を取るので、どのズームでも
   * 画面の端まで届く。地図がまだ範囲を報告していない初回だけ近景ぶんに倒す。
   */
  const wedgeRangeKm = useMemo(
    () => wedgeRangeKmForBounds(baseLat, baseLon, currentBounds),
    [baseLat, baseLon, currentBounds],
  );

  // Render direction sectors
  const sectorLayers = useMemo(() => {
    // 塗りを外して境界線だけにする条件。俯瞰（県の塗り分けが下にある）と、
    // 件数バブル（掲載件数の色が下にある）の 2 つ。
    const outlineOnly = isOverview || showHeatmap;
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
        : d.status === null
          ? {
              // 判定が無い。塗らずに輪郭だけ残す（方位の区切りは見える）。
              color: "#a8a29e",
              opacity: 0.02,
              dashArray: "4,6" as string | undefined,
            }
          : getStyleForVector(d.status);
      const baseBearing = d.deg;

      // 扇形は表示中の画面を覆う長さで描く。以前は 30km 固定で、引くと
      // 先が画面の途中で切れていた。方位の判定に距離の上限は無いので、
      // 見えている範囲の端までは同じ色で塗る。
      //
      // 幅は directionFromBearing の区切りから引く。扇形の縁と八方位の
      // 境目は同じものなので、別々に書くとずれる。
      const halfWidth = directionWedgeHalfWidth(d.dir, sectorNodeMapping);
      const points = directionWedgePoints(
        baseLat,
        baseLon,
        baseBearing,
        halfWidth,
        wedgeRangeKm,
      );

      // ラベルは扇形の長さに対する割合で置く。どのズームでも扇形の
      // 中ほど手前に出て、近景での見え方は今までと変わらない。
      const labelAt = destinationAtBearing(
        baseLat,
        baseLon,
        baseBearing,
        wedgeRangeKm * 0.15,
      );
      const labelPos: [number, number] = [labelAt.lat, labelAt.lon];

      const getStatusText = (status: string) => {
        if (status === "OPTIMAL") return "大吉方位";
        if (status === "NOISE") return "凶方位";
        // 既定を「通常吉」と書いていた。ここに落ちるのは主に SAFE で、
        // SAFE は「凶方位ではない」であって吉ではない。扇形に「吉」と
        // 書いてあるのに記事では「平」になる、という食い違いの元だった。
        return "平穏";
      };
      // 段階つきなら「S 三盤吉」の形。時期パネルのセルと同じ記号にして
      // 突き合わせられるようにする。
      const label = d.tier
        ? d.blocked
          ? `${d.dir} 天中殺`
          : `${d.dir} ${d.tier} ${TIER_JP[d.tier as DayTier] ?? ""}`
        : d.status === null
          ? // 判定が無いときは方位名だけ。既定の "SAFE" に落とすと
            // 「平穏（＝凶方位ではない）」と書いてしまう。
            d.dir
          : `${d.dir} (${getStatusText(d.status)})`;

      return (
        <React.Fragment key={`sector-wedge-${d.dir}`}>
          <Polygon
            positions={points}
            pathOptions={{
              color: color,
              fillColor: color,
              // 下に別の意味の色があるときは塗らない。俯瞰は県の塗り分け、
              // 件数バブルは掲載件数で、どちらも扇形と重ねると 2 枚の色が
              // 混ざって読めなくなる（#147 と同じ取り違えが起きる）。
              // 境界線だけ残せば「どこからどこまでが東か」は分かる。
              fillOpacity: outlineOnly ? 0 : opacity,
              weight: outlineOnly
                ? 1.5
                : (d.tier ? d.tier === "C" : d.status === "SAFE")
                  ? 0.5
                  : 1,
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
    getStyleForVector,
    useClassical,
    sectorNodeMapping,
    wedgeRangeKm,
    isOverview,
    showHeatmap,
  ]);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-stone-100 flex items-center justify-center font-mono text-xs text-stone-500">
        [ 地図エンジンの初期化中... ]
      </div>
    );
  }

  /*
    非全画面のときの isolate（isolation: isolate）を外さないこと。
    地図の中身は Leaflet の枠（.leaflet-pane が 400、コントロールが 1000）と、
    その上に重ねている凡例・全画面ボタン・吉凶の札（z-[1000]）でできている。
    器が relative だけだと z-index の入れ物（重ね合わせ文脈）にならないので、
    これらが器をすり抜けて頁全体と背比べし、メニュー（z-40）や見出しの帯より
    前に出る。Android の実機で、開いたメニューの上に地図が乗っていた。
    全画面のときは fixed + z-[2000] が自分で入れ物を作るので付けない。
    付けると頁の帯より後ろに落ちて、全画面が全画面でなくなる。
  */
  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[2000] bg-white"
          : "isolate w-full h-full relative rounded-2xl overflow-hidden border border-gray-200 dark:border-stone-200"
      }
    >
      <MapContainer
        center={center}
        zoom={zoom}
        maxZoom={20}
        style={{ height: "100%", width: "100%", background: "#0c0c0e" }}
        zoomControl={false}
      >
        <BoundsListener onBoundsChange={handleBoundsChange} />
        <MapClickPicker
          onPick={(lat, lon) => {
            if (onInspectSpot) {
              onInspectSpot(lat, lon);
              showToast("この地点の方位と吉凶を絞り込み欄に出しました", "info");
              return;
            }
            // 受け手がいない場合だけ従来どおり座標を写す。
            copyCoordinates(lat, lon);
          }}
        />
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

        {/* 地図の下地。carto のときだけ明暗を切り替える。
            地理院タイル（淡色・空中写真・地形）に明暗の別は無い。

            maxNativeZoom は種類ごとに違う。配信の無いズームは 404 に
            なり、Leaflet はそれを透明として扱う（＝画面が真っ白になる）。
            上限を渡すと、上限のタイルを引き伸ばして描く。 */}
        <TileLayer
          key={`tile-layer-${baseMap}-${mapTheme}`}
          url={BASE_MAPS[baseMap].url}
          attribution={BASE_MAPS[baseMap].attribution}
          maxZoom={BASE_MAPS[baseMap].maxZoom}
          maxNativeZoom={BASE_MAPS[baseMap].maxNativeZoom}
          /* ダークは配信元に無いので、標準・淡色を CSS で反転して作る。
             以前の CARTO dark_all は鍵なしだと透かしが入るようになった。
             写真・地形は反転すると意味が壊れるので、そのまま出す。 */
          className={
            mapTheme === "dark" && (baseMap === "std" || baseMap === "pale")
              ? DARK_TILE_CLASS
              : undefined
          }
        />

        {/* 陰影起伏。下地の上に薄く重ねて尾根と谷を出す */}
        {hillshade && (
          <TileLayer
            key="tile-layer-hillshade"
            url={HILLSHADE.url}
            attribution={HILLSHADE.attribution}
            maxZoom={HILLSHADE.maxZoom}
            maxNativeZoom={HILLSHADE.maxNativeZoom}
            opacity={0.45}
          />
        )}

        {/* 現在地。表示だけで、方位の判定には入らない（判定は出発地から）。
            歩いただけで画面の吉凶が変わってしまわないようにするため。 */}
        <CurrentLocationLayer
          enabled={locateOn}
          follow={locateFollow}
          onFollowBroken={handleLocateFollowBroken}
          onMessage={setLocateMessage}
        />

        {/* ハザードの重ね描き。区域が無い場所はタイル自体が無く透明で返る */}
        <HazardTileOverlay tab={hazardTab} />

        {/* 用途地域。既定は消えている。判定には入らない参考の層。 */}
        <ZoningLayer
          enabled={zoningOn}
          selected={zoningPick}
          onNotice={setZoningNotice}
        />

        {/* Theme Switcher + フォーカスの明示切り替え。
            「今どこを見ているのか」を手で確定できるようにする */}
        {/* 表示範囲の候補数。
            以前ここは「この範囲に掲載 N 件」で、名寄せ前の生の掲載数を
            専用 API（viewport-count）で数え直していた。一覧の
            「候補のうち範囲内」（名寄せ後）と数え方が違うため、同じ範囲でも
            数字が食い違い、「重複を含む掲載数。一覧の候補数とは数え方が
            違います」という断り書きで埋めていた。

            **断りで埋めずに、数え方を一覧と同じにする。**一覧と同じ
            候補（名寄せ・絞り込み後、上限500件）を同じ矩形で数えるので、
            一覧の「候補のうち範囲内」と必ず一致する。通信も減る。 */}
        {hasBase && zoom >= 10 && (
          <div className="absolute bottom-4 lg:bottom-auto lg:top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none bg-white/85 backdrop-blur rounded-full shadow-lg border border-stone-200 px-3.5 py-1.5 text-center max-w-[min(90%,22rem)]">
            <div className="text-[10px] text-stone-600">
              この範囲の候補
              <b className="mx-1 font-mono text-sm text-indigo-700">
                {visibleCount.toLocaleString()}
              </b>
              件
            </div>
          </div>
        )}
        <div className="absolute top-4 right-4 z-[1000] pointer-events-auto flex flex-col items-end gap-1.5 max-h-[calc(100%-2rem)] overflow-y-auto">
          {/* 器の大きさと、操作をたたむかどうか。**この 2 つは常に出す。**
              たたんだときに開き直せなくなるのを避ける。 */}
          <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/90 border border-stone-200 shadow-lg">
            <button
              onClick={() => {
                setFullscreen((v) => !v);
                /* Leaflet は器の大きさを覚えているので、器を変えたら
                   測り直させる。しないと地図が元の大きさのまま描かれ、
                   余白が灰色になる。描画の後に呼ぶ必要があるため
                   requestAnimationFrame を挟む。 */
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => mapRef.current?.invalidateSize()),
                );
              }}
              aria-pressed={fullscreen}
              title={
                fullscreen
                  ? "画面いっぱいの表示をやめる"
                  : "地図を画面いっぱいに広げる"
              }
              className="px-2.5 py-1.5 rounded-md font-mono text-[9px] font-bold text-stone-700 hover:bg-white transition-colors active:scale-95 cursor-pointer"
            >
              {fullscreen ? "⤡ 戻す" : "⛶ 全画面"}
            </button>
            <button
              onClick={() => setControlsOpen((v) => !v)}
              aria-expanded={controlsOpen}
              title={
                controlsOpen
                  ? "地図の設定をたたむ"
                  : "地図の設定（下地・ハザード・用途地域）を開く"
              }
              className={`px-2.5 py-1.5 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                controlsOpen
                  ? "bg-stone-700 text-white"
                  : "text-stone-700 hover:bg-white"
              }`}
            >
              {controlsOpen ? "✕ 設定" : "⚙ 設定"}
            </button>
          </div>

          {/* 以下はたためる。狭い画面では既定で閉じている。 */}
          {controlsOpen && (
            <>
              {/* 目的のプリセット。個別の切り替え（下）の前に置く。
              どちらも見え方だけの変更で、判定にも絞り込みにも入らない。 */}
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/90 border border-stone-200 shadow-lg">
                {LAYER_PRESET_ORDER.map((id) => (
                  <button
                    key={id}
                    onClick={() => applyLayerPreset(id)}
                    aria-pressed={activeLayerPreset === id}
                    title={LAYER_PRESETS[id].note}
                    className={`px-2.5 py-1.5 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                      activeLayerPreset === id
                        ? "bg-stone-700 text-white"
                        : "text-stone-600 hover:bg-white"
                    }`}
                  >
                    {LAYER_PRESETS[id].label}
                  </button>
                ))}
              </div>
              {/* 地図の下地。ハザード・用途地域と同じ列に置く。
              どれも「見え方だけ」で、判定にも絞り込みにも入らない。 */}
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/80 border border-stone-200 shadow-lg">
                {BASE_MAP_ORDER.map((id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setBaseMap(id);
                      localStorage.setItem(BASE_MAP_STORAGE_KEY, id);
                    }}
                    aria-pressed={baseMap === id}
                    title={BASE_MAPS[id].note}
                    className={`px-2.5 py-1.5 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                      baseMap === id
                        ? "bg-indigo-600 text-white"
                        : "text-stone-600 hover:bg-white"
                    }`}
                  >
                    {BASE_MAPS[id].label}
                  </button>
                ))}
                <button
                  onClick={() => setHillshade((v) => !v)}
                  aria-pressed={hillshade}
                  title={HILLSHADE.note}
                  className={`px-2.5 py-1.5 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                    hillshade
                      ? "bg-indigo-600 text-white"
                      : "text-stone-600 hover:bg-white"
                  }`}
                >
                  {HILLSHADE.label}
                </button>
              </div>
              {/* ハザードマップ（国交省「重ねるハザードマップ」）のタブ。
              「なし」を明示的に置くのは、消す操作を選び直しではなく
              1 押しにするため。選択は端末に残す。 */}
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/80 border border-stone-200 shadow-lg">
                {(
                  [
                    ["none", "なし"],
                    ...Object.entries(HAZARD_TABS).map(
                      ([id, def]) => [id, def.label] as const,
                    ),
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setHazardTab(id as HazardTabId);
                      localStorage.setItem(HAZARD_STORAGE_KEY, id);
                    }}
                    aria-pressed={hazardTab === id}
                    title={
                      id === "none"
                        ? "ハザードの重ね描きを消す"
                        : `${label}の想定区域を重ねて表示（出典: ハザードマップポータルサイト）`
                    }
                    className={`px-2.5 py-1.5 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                      hazardTab === id
                        ? "bg-rose-600 text-white"
                        : "text-stone-600 hover:bg-white"
                    }`}
                  >
                    {id === "none" ? "⚠️ なし" : label}
                  </button>
                ))}
              </div>
              {/* 用途地域の切り替え。ハザードのタブと同じ列に置く。
              どちらも「参考として重ねる層」で、判定には入らない。 */}
              <button
                onClick={() => {
                  const next = !zoningOn;
                  setZoningOn(next);
                  localStorage.setItem(ZONING_STORAGE_KEY, next ? "on" : "off");
                  /* 消したら絞り込みも戻す。次に出したとき 1 区分だけ
                 残っていると、消えているように見える。 */
                  if (!next) setZoningPick(null);
                }}
                aria-pressed={zoningOn}
                title="用途地域（商業地域・住居地域など）を重ねて表示（出典: 不動産情報ライブラリ）"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[9px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                  zoningOn
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white/80 text-stone-700 border-stone-200 hover:bg-white"
                }`}
              >
                🏙️ 用途地域
              </button>
              <button
                onClick={toggleMapTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[9px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
              >
                {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
              </button>
              {/* 凡例。出しているときだけ。押すと 1 区分だけ残る。
              色だけで 13 区分は見分けられない（実測 ΔE 6.8）ので、
              名前を並べて絞り込みで読ませる。 */}
              {zoningOn && (
                <div className="w-56 max-h-[60vh] overflow-y-auto shadow-lg rounded-2xl">
                  <ZoningLegend
                    selected={zoningPick}
                    onSelect={setZoningPick}
                    notice={zoningNotice}
                  />
                </div>
              )}
              {/* 現在地。3 状態を 1 つのボタンで回す（消 → 表示 → 追従）。
              Google マップの現在地ボタンと同じ考え方で、押すたびに
              「出す」「追う」「やめる」が切り替わる。ラベルは今どう
              なっているかを書く（方位ボタンと同じ約束）。 */}
              <button
                onClick={() => {
                  if (!locateOn) {
                    setLocateOn(true);
                    setLocateFollow(true);
                    return;
                  }
                  if (locateFollow) {
                    setLocateFollow(false);
                    return;
                  }
                  setLocateOn(false);
                  setLocateMessage(null);
                }}
                title={
                  !locateOn
                    ? "現在地を表示して追従する（位置情報の許可が要ります）"
                    : locateFollow
                      ? "追従をやめる（現在地の表示は残す）"
                      : "現在地の表示を消す"
                }
                aria-pressed={locateOn}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[9px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                  locateFollow
                    ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                    : locateOn
                      ? "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                      : "bg-white/80 text-stone-500 border-stone-200 hover:bg-white"
                }`}
              >
                ◎ 現在地{" "}
                {locateFollow ? "追従中" : locateOn ? "表示中" : "非表示"}
              </button>
              {/* 位置情報が取れないときの 1 行。黙って消えると、押したのに
              何も起きないように見える。 */}
              {locateOn && locateMessage && (
                <div className="max-w-56 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-[9px] leading-relaxed text-amber-800 shadow-lg">
                  {locateMessage}
                </div>
              )}
              {/* 扇形の表示切り替え。出発地が無いとそもそも扇形を描かないので、
              そのときはボタンも出さない（押しても何も起きないボタンを
              置かない）。

              ラベルには「押すとどうなるか」ではなく**今どうなっているか**を
              書く。押すと文言が入れ替わる形にすると、消したあとに「非表示に
              する」と書いてあるボタンが残り、押したのに効いていないように
              見える。理由の説明は title に置く。 */}
              {hasBase && (
                <button
                  onClick={() => {
                    const next = !showSectors;
                    setShowSectors(next);
                    localStorage.setItem(SECTORS_STORAGE_KEY, next ? "1" : "0");
                  }}
                  title={
                    showSectors
                      ? "方位の扇形を消して地図だけにする"
                      : "方位の扇形を表示する"
                  }
                  aria-pressed={showSectors}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[9px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                    showSectors
                      ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                      : "bg-white/80 text-stone-500 border-stone-200 hover:bg-white"
                  }`}
                >
                  🧭 方位 {showSectors ? "表示中" : "非表示"}
                </button>
              )}
              {/* 近景 ⇄ 全国の切り替え。
              以前は「全国俯瞰」への片道ボタンしか無く、戻るにはズーム
              操作が要った。今どちらを見ているのかも画面に出ていない。
              2 つを並べて現在地を反転表示にすると、切り替えられること
              自体が見える。押した側が実際のズームと食い違わないよう、
              選択状態は状態変数ではなく現在のズームから引く。 */}
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/80 border border-stone-200 shadow-lg">
                {hasBase && (
                  <button
                    onClick={() =>
                      mapRef.current?.setView(
                        [baseLat, baseLon],
                        zoomForRadius(radiusKm),
                      )
                    }
                    title="出発地を中心に、検索半径が収まるズームへ"
                    className={`px-2.5 py-1 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                      isOverview
                        ? "text-stone-500 hover:bg-stone-100"
                        : "bg-indigo-600 text-white"
                    }`}
                  >
                    📍 近景
                  </button>
                )}
                <button
                  onClick={() =>
                    mapRef.current?.setView(OVERVIEW_CENTER, OVERVIEW_ZOOM)
                  }
                  title="全国を俯瞰して県ごとの方位の吉凶を見る"
                  className={`px-2.5 py-1 rounded-md font-mono text-[9px] font-bold transition-colors active:scale-95 cursor-pointer ${
                    isOverview
                      ? "bg-indigo-600 text-white"
                      : "text-stone-500 hover:bg-stone-100"
                  }`}
                >
                  🗾 全国
                </button>
              </div>
            </>
          )}
        </div>

        {/* 俯瞰の塗り分け切り替え + 凡例。方位モードは
            「どの県へなら動けるか」の意思決定面。

            prefKigaku が無いときもパネルごと消さない。消すと県塗りが
            件数に変わったことも、方位モードの存在も画面から分からず、
            件数の色を吉凶と読み違える。 */}
        {zoom < 10 && (
          <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto bg-white/85 backdrop-blur rounded-xl shadow-lg border border-stone-200 p-2.5 text-[9px] text-stone-700 space-y-1.5">
            <div className="flex items-center gap-1 select-none">
              {(
                [
                  ["kigaku", "方位の吉凶"],
                  ["count", "掲載件数"],
                ] as const
              ).map(([mode, label]) => {
                // 方位モードは判定が出せるときだけ押せる。押せない理由は
                // 下の一文に出す（disabled だけだと理由が分からない）。
                const disabled = mode === "kigaku" && !prefKigaku;
                const active = effectiveTint === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setOverviewTint(mode)}
                    disabled={disabled}
                    title={disabled ? kigakuUnavailableReason : undefined}
                    className={`px-2 py-1 rounded-md font-bold transition-colors ${
                      disabled
                        ? "bg-stone-100 text-stone-300 cursor-not-allowed"
                        : active
                          ? "bg-indigo-600 text-white"
                          : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* 何の色を見ているかを必ず 1 行で言う。方位モードに切り替え
                られないときは、その理由もここに出す。 */}
            {effectiveTint === "count" && (
              <div className="max-w-44 space-y-1">
                <div className="font-bold text-stone-600">
                  {prefCountsFiltered
                    ? "いまの色は絞込後の件数です"
                    : "いまの色は掲載件数です"}
                </div>
                {/* 絞り込みのうち反映できるのは SQL で表せる条件だけ。
                    方位・吉凶は出発地と生年月日から画面側で出す値なので、
                    この数字には入っていない。断らずに出すと「方位で
                    絞ったのに減らない」と読まれる。 */}
                {prefCountsFiltered && (
                  <div className="text-[10px] leading-relaxed text-stone-500">
                    家賃・間取り・築年・徒歩・広さを反映しています。方位と吉凶は含みません。
                  </div>
                )}
                {!prefKigaku && (
                  <div className="text-[10px] leading-relaxed text-stone-500">
                    {kigakuUnavailableReason ??
                      "条件が揃うと方位の吉凶で塗り分けます"}
                  </div>
                )}
              </div>
            )}
            {effectiveTint === "kigaku" && (
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
                <span className="block w-full text-[10px] text-stone-600">
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
                  className="text-[10px] text-stone-600 mt-1 cursor-pointer hover:bg-zinc-100 p-1 rounded-md border border-transparent hover:border-zinc-200 transition-all group flex items-center justify-between"
                  onClick={() => copyCoordinates(baseLat, baseLon, "起点")}
                  title="クリックで座標をコピー"
                >
                  <div>
                    経度: {baseLon.toFixed(5)} <br />
                    緯度: {baseLat.toFixed(5)}
                  </div>
                  <Copy className="w-3 h-3 text-stone-600 group-hover:text-stone-800 ml-2" />
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
            key={`pref-geo-${effectiveTint}-${
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
              if (effectiveTint === "kigaku" && info) {
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
              /* 方位は県の面積重心で決めている（lib/prefectureDirection）。
                 兵庫のように広い県は県内で方位が変わるので、その断りを
                 ポップアップに残す。個々の物件は実座標で判定される。 */
              const kigakuLine = info
                ? `<div class="mt-1">方位: <b>${info.directionLabel}</b> — ${
                    info.blocked
                      ? '<b class="text-slate-500">天中殺で移転不可</b>'
                      : `<b>${TIER_JP[info.tier as DayTier] ?? info.tier}</b>`
                  }<span class="text-[9px] text-stone-500">（選択日の判定）</span>
                  <div class="text-[9px] text-stone-500">県の中心を基準にした方位です。広い県は県内でも方位が変わります（物件は個別に判定）</div></div>`
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

        {/* 方位の扇形。ズームに関わらず常に描く。
            以前は「ピンを個別表示しているときだけ」という条件付きで、
            物件が少ないとき（クラスター表示）に扇形が黙って消えていた。
            方位の吉凶はこの画面の主役なので、物件の数で消えてはいけない。

            zoom >= 10 の条件も外した。引くと扇形ごと消えるため、全国を
            見ている間は方位の境目がどこにも出ていなかった。

            市区町村バブル（件数の画面）でも消さない。バブルは物件が
            120 件以上見えると**自動で**入るので、地図を動かして物件の
            多い側へ寄っただけで扇形が消えていた（利用者からの指摘）。
            下に別の意味の色があるときは、俯瞰と同じく塗りを外して
            境界線だけにする。

            出発地が未設定のときは描かない。baseLat/baseLon はそのとき
            地図の中心に倒れており、方位はどこから見た方位でもない。
            30km のうちは小さく収まっていたが、画面を覆う長さにすると
            「起点のない吉凶」を全面に出すことになる。

            右上のボタンで消せる（既定は表示）。画面いっぱいの 8 色の下に
            地形も駅名も隠れるため、方位を決めたあと「その辺に何があるか」を
            見る段では邪魔になる。俯瞰でも近景でも同じボタンで効く */}
        {hasBase && showSectors && sectorLayers}

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
                          <div className="space-y-1 text-stone-600">
                            <div className="flex justify-between">
                              <span>検出物件数:</span>
                              <span className="font-bold text-gray-900">
                                {muni.count}件
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
                //
                //    ただし多すぎるときは升目にまとめる。zoom >= 12 では
                //    showHeatmap が強制的に false になるため、都市部を
                //    zoom 12〜14 で見ると**表示域の全物件がここに落ちて
                //    いた**（上限も間引きも無し）。
                //
                //    上の距離クラスターは O(n²) で 100 件までが前提なので
                //    使えない。lib/mapClusters の升目（O(n)）で落とす。
                shouldCluster(pinProperties.length)
                ? clusterByTile(pinProperties, zoom).map((cluster) => (
                    <Marker
                      key={`grid-${cluster.lat.toFixed(5)}-${cluster.lon.toFixed(5)}`}
                      position={[cluster.lat, cluster.lon]}
                      icon={L.divIcon({
                        className: "custom-cluster-icon",
                        html: `<div class="w-9 h-9 rounded-full bg-white border-2 border-indigo-500 shadow-[0_2.5px_8px_rgba(79,70,229,0.35)] text-indigo-600 font-extrabold text-[11px] flex items-center justify-center pointer-events-auto">${cluster.count}</div>`,
                        iconSize: [36, 36],
                        iconAnchor: [18, 18],
                      })}
                      eventHandlers={{
                        click: (e) => {
                          const map = e.target._map;
                          map.setView(
                            [cluster.lat, cluster.lon],
                            Math.min(18, map.getZoom() + 2),
                          );
                        },
                      }}
                    />
                  ))
                : (() => {
                    const sortedProperties = [...pinProperties].sort((a, b) => {
                      const getPriority = (p: ScoredProperty) => {
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
                          p.astroFlags?.some((f: string) =>
                            f.endsWith("_LINE"),
                          );

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

                              {/* その地点の空中写真。掲載元の写真ではなく
                                周りの様子（川・崖・幹線道路・空き地）を見る。
                                タイルが無い場所は部品側で「写真なし」に倒れる。 */}
                              <div className="mt-2">
                                <AerialThumb lat={prop.lat} lon={prop.lon} />
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

                              <div className="mt-2.5 border-t border-gray-100 pt-2 space-y-1 text-stone-600 text-[11px]">
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
                                  <span className="font-mono text-[9px] text-stone-500 flex items-center gap-1 group-hover:text-stone-600">
                                    {prop.lat!.toFixed(5)},{" "}
                                    {prop.lon!.toFixed(5)}
                                    <Copy className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100" />
                                  </span>
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
                                  className="mt-3 block w-full py-1.5 text-center text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm"
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
      {((zoom < 10 && effectiveTint === "count") ||
        (zoom >= 10 && showHeatmap)) && (
        <div className="absolute top-4 left-4 bg-white/80 text-stone-900 px-3 py-3.5 rounded-2xl shadow-xl border border-stone-200 backdrop-blur text-[10px] pointer-events-auto z-[1000] flex flex-col gap-1.5 w-18 items-center">
          {/* 「件数」とだけ書いてあり、吉凶の色と見分けが付かなかった。
              何を数えた色なのかまで書く。 */}
          <div className="font-bold text-[9px] text-stone-600 tracking-tight text-center pb-0.5 border-b border-stone-200 w-full">
            掲載件数
            <span className="block font-normal text-[7.5px] text-stone-600">
              吉凶ではない
            </span>
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
          <span className="block text-[10px] text-stone-600 max-w-48 leading-relaxed">
            年・月・日の三盤を合成した選択日の判定。扇形もピンも同じ段階で塗っています。物件ごとの違いは条件の良さ（スコア・星数）で見てください。
          </span>
        </div>
      ) : !hasPersonalVerdict ? (
        /*
          個人の判定が無いとき。以前はここで「アストロ吉凶（凡例）」を
          出し、超大吉／吉／注意／大凶／平穏を並べていた。生年月日が
          未入力でも API が「今日生まれ」で計算した値を返していたため、
          根拠の無い断定が色と言葉の両方で出ていた（本番で実測）。

          API 側は判定を作らないようにした（#205）。ここでは、色が
          何も意味していないことと、何を入れれば出るかだけを言う。
        */
        <div className="absolute bottom-4 right-4 max-w-52 bg-white/85 text-stone-900 px-3.5 py-3 rounded-xl shadow-lg border border-stone-200 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-1.5">
          <div className="font-bold border-b border-stone-200 pb-1 text-stone-600">
            方位の吉凶は出していません
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#a8a29e] border border-[#57534e]"></span>
            <span>判定なし（色に意味はありません）</span>
          </div>
          <span className="block text-[10px] leading-relaxed text-stone-500">
            {kigakuUnavailableReason ??
              "生年月日と出発地を入れると、その日の方位の吉凶で塗り分けます。"}
            本命殺・天中殺は生年月日から決まるため、入力が無い状態では判定しません。
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
              <span>平穏 (凶方位ではない)</span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification。framer-motion（gzip 39 KB）をこの 1 か所の
          ためだけに地図の塊へ乗せていたので、globals.css の fade-in-up に
          替えた。消えるときの動きは無くなる（2 秒で消える通知なので
          気にならない）。横の中央寄せは translate（-translate-x-1/2）、
          出る動きは transform のアニメーションで、互いに干渉しない。 */}
      {toast && (
        <div
          className="absolute top-20 left-1/2 -translate-x-1/2 z-[2000]"
          style={{ animation: "fade-in-up 0.25s ease-out both" }}
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
        </div>
      )}
    </div>
  );
}

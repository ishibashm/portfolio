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
  useMap,
  Popup,
  useMapEvents,
  GeoJSON,
} from "react-leaflet";
import { InvalidateMapSize } from "@/components/map/InvalidateMapSize";
import { readMapViewport, type MapViewport } from "@/utils/mapViewport";
import type { DayTier } from "@/utils/auspiciousDays";
import type { FeatureCollection } from "geojson";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import { HazardTileOverlay } from "@/components/HazardTileOverlay";
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
import { wedgeOutlineOnly } from "@/lib/wedgeOverlay";
import { DistanceRings } from "@/components/map/DistanceRings";
import { PowerSpotLayer } from "@/components/map/PowerSpotLayer";
import { UserSpotLayer } from "@/components/map/UserSpotLayer";
import { StationLayer } from "@/components/map/StationLayer";
import { ZoningLayer } from "@/components/relocation/ZoningLayer";
import { ZoningLegend } from "@/components/relocation/ZoningLegend";
import type { ZoningName } from "@/utils/zoning";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Copy, Check } from "lucide-react";
import { CurrentLocationLayer } from "@/components/map/CurrentLocationLayer";
import { useMapTheme } from "@/lib/useMapTheme";
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
import { MapClickPicker } from "@/components/map/MapClickPicker";

// 既定アイコンの下ごしらえ。理由と型の話は @/lib/leafletDefaultIcon に集約。
applyLeafletDefaultIcon();

/**
 * 俯瞰と近景の境目のズーム。これ未満なら県の塗り分け、以上なら扇形と
 * 起点の目印だけ。
 */
const OVERVIEW_ZOOM_MAX = 10;

/** 扇形を消したかどうかを覚えておく先。地図のテーマ（map_theme）と同じ扱い。 */
const SECTORS_STORAGE_KEY = "arbitrage_show_sectors";
/* 距離の輪。既定は消えている（目盛りは要るときだけ）。 */
const RINGS_STORAGE_KEY = "arbitrage_show_rings";
/* パワースポット（一宮・名勝）。既定は消えている。一覧は押されてから読む。 */
const SPOTS_STORAGE_KEY = "arbitrage_show_spots";
/* 駅（国土数値情報 N02）。既定は消えている。一覧（1 万駅）は押されてから読む。 */
const STATIONS_STORAGE_KEY = "arbitrage_show_stations";

/**
 * 検索半径から表示ズームを引く。初回表示と「出発地へ」ボタンで使う。
 *
 * 半径は利用者が選んだ確定値なので、これだけから決めれば同じ条件では
 * 常に同じ画角になる。下限の 10 は俯瞰と近景の境目（OVERVIEW_ZOOM_MAX）。
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
 * 直接送る（onPick）。座標を写したいときは、起点の吹き出しに
 * 「座標をコピー」のボタンが別にある。
 *
 * **物件（掲載）は描かない。**2026-09-20 に掲載の取り込みを止めたことに
 * 合わせて、物件のピン・件数バブル・升目・候補数の札・県の掲載件数の
 * 塗りを外した。この地図が描くのは、出発地から見た方位の吉凶（扇形・
 * 県塗り）と、参考の層（名所・駅・用途地域・ハザード）だけ。
 */
interface ArbitrageMapInnerProps {
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
   * 「掲載件数」へ無言で入れ替わっていた。掲載の塗りは外したが、
   * 「塗っていない理由」は今も凡例に出す。
   */
  kigakuUnavailableReason?: string;
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
   * のときは塗らず、輪郭だけ描く。
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
  /** mapCenter の意味。area=出発地 / spot=調べている地点 */
  focusKind?: "area" | "spot";
  useClassical?: boolean;
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
      (focusKind === "spot" && prev.center !== center) ||
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

/** 用途地域を出すかどうかを端末に残す鍵。 */
const ZONING_STORAGE_KEY = "arb_zoning_on";
/** 下地（ベースマップ）の選択。ハザード・用途地域と同じく端末に残す。 */
const BASE_MAP_STORAGE_KEY = "arb_base_map";

/**
 * レイヤーの目的プリセット。
 *
 * 重ねられる層が 10 あり、1 つずつ切り替えると目的の画面にするまで
 * 4〜5 押し掛かる（#34）。実際の使い方は「方位を見る」と
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
    label: "🧭 方位を見る",
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
  onInspectSpot,
  targetDate,
  hasBase = false,
  focusKind = "area",
  useClassical = false,
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
   * 俯瞰（全国）か近景か。ズーム 10 を境に、県ごとの塗り分けが出入りする。
   * 扇形は両方で描く。
   */
  const isOverview = zoom < OVERVIEW_ZOOM_MAX;
  /** sm 未満で右下の凡例を開いているか（Task #52）。既定は畳む。 */
  const [legendOpen, setLegendOpen] = useState(false);
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
  /* 既定は消えている。目盛りは要るときだけ出す。復元は zoningOn と
     同じ遅延初期化で行う（マウント効果で setState すると
     set-state-in-effect を 1 件増やす）。 */
  const [showRings, setShowRings] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(RINGS_STORAGE_KEY) === "1",
  );
  const [showSpots, setShowSpots] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(SPOTS_STORAGE_KEY) === "1",
  );
  const [showStations, setShowStations] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(STATIONS_STORAGE_KEY) === "1",
  );
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

  /**
   * 扇形（方位）の判定。
   *
   * dirKigaku があればそれを使う。三盤（年・月・日）を合成した段階で、
   * 時期パネルの「選択日」列・俯瞰の県塗りと同じ値。無いとき
   * （生年月日・出発地が未入力）は段階なし＝塗らずに輪郭だけ残す。
   *
   * 以前はここに「物件の astrologyStatus の多数決」への後退があった。
   * 物件を描かなくなったので、判定の出どころは盤だけ。
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
      return {
        ...d,
        tier: k ? k.tier : (null as string | null),
        blocked: k ? k.blocked : false,
      };
    });
  }, [dirKigaku]);

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
    /* 塗りを外して境界線だけにする条件は lib/wedgeOverlay に置いてある。
       ここに条件式を書いていたせいで、後から足した用途地域とハザードが
       入っていなかった（#147 が防ぐはずだった「2 枚の色が混ざる」状態が
       そのまま起きていた）。層を足したらあちらへ足すこと。 */
    const outlineOnly = wedgeOutlineOnly({
      isOverview,
      zoningOn,
      hazardOn: hazardTab !== "none",
    });
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
        : {
            // 判定が無い。塗らずに輪郭だけ残す（方位の区切りは見える）。
            color: "#a8a29e",
            opacity: 0.02,
            dashArray: "4,6" as string | undefined,
          };
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

      // 段階つきなら「S 三盤吉」の形。時期パネルのセルと同じ記号にして
      // 突き合わせられるようにする。判定が無いときは方位名だけ。
      const label = d.tier
        ? d.blocked
          ? `${d.dir} 天中殺`
          : `${d.dir} ${d.tier} ${TIER_JP[d.tier as DayTier] ?? ""}`
        : d.dir;

      return (
        <React.Fragment key={`sector-wedge-${d.dir}`}>
          <Polygon
            positions={points}
            pathOptions={{
              color: color,
              fillColor: color,
              // 下に別の意味の色があるときは塗らない。俯瞰は県の塗り分け、
              // 用途地域・ハザードも色を持つ。扇形と重ねると 2 枚の色が
              // 混ざって読めなくなる（#147 と同じ取り違えが起きる）。
              // 境界線だけ残せば「どこからどこまでが東か」は分かる。
              fillOpacity: outlineOnly ? 0 : opacity,
              weight: outlineOnly ? 1.5 : d.tier === "C" ? 0.5 : 1,
              dashArray: dashArray,
            }}
            interactive={false}
          />
          <Marker
            position={labelPos}
            icon={L.divIcon({
              className: "custom-div-icon",
              html: `<div class="px-1.5 py-0.5 rounded bg-white/80 border border-stone-200 text-[10px] font-bold text-center pointer-events-none" style="color: ${color}; text-shadow: 0 0 2px rgba(0,0,0,0.8); white-space: nowrap;">
                ${label}
              </div>`,
              iconSize: [72, 20],
              iconAnchor: [36, 10],
            })}
            interactive={false}
            /* 飾りの札は キーボードの巡回から外す。`interactive={false}` だけ
               では Leaflet の `keyboard`（既定 true）が tabindex と
               role="button" を付ける（MagneticMapInner の註と同じ）。 */
            keyboard={false}
          />
        </React.Fragment>
      );
    });
  }, [
    sectors,
    center,
    baseLat,
    baseLon,
    useClassical,
    sectorNodeMapping,
    wedgeRangeKm,
    isOverview,
    /* 用途地域・ハザードを足したので、切り替えたときに扇形も描き直す。
       ここに足し忘れると、用途地域を出しても扇形が塗ったままになる。 */
    zoningOn,
    hazardTab,
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
        {/*
          操作の列。**下の「方位の吉凶」の凡例に被せない。**

          用途地域の凡例（13 区分）を列の末尾に置いた（#1005）ところ、
          今度は列が下へ伸びて右下の凡例に重なった（利用者の指摘、
          実機の画面）。どちらも右側で、片方は上から下へ、もう片方は
          下から上へ伸びるので、画面が短いと必ずぶつかる。

          凡例を出しているあいだは、下の凡例のぶん（見出し＋7 行＋説明で
          実測 13〜15rem）を空けて、列はその中でスクロールさせる。
          `max()` で下限を置いているのは、器が低いと calc が負になって
          列ごと消えるため（0 に丸められる）。
        */}
        <div
          className={`absolute top-4 right-4 z-[1000] pointer-events-auto flex flex-col items-end gap-1.5 overflow-y-auto ${
            zoningOn
              ? "max-h-[max(8rem,calc(100%-17rem))]"
              : "max-h-[calc(100%-2rem)]"
          }`}
        >
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
              className="px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold text-stone-700 hover:bg-white transition-colors active:scale-95 cursor-pointer"
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
              className={`px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
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
                    className={`px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
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
                    className={`px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
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
                  className={`px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
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
                    className={`px-2.5 py-1.5 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                  zoningOn
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white/80 text-stone-700 border-stone-200 hover:bg-white"
                }`}
              >
                🏙️ 用途地域
              </button>
              <button
                onClick={toggleMapTheme}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold bg-white/80 text-stone-700 border-stone-200 hover:bg-white transition-colors shadow-lg active:scale-95 cursor-pointer"
              >
                {mapTheme === "dark" ? "☀️ ライトマップ" : "🌙 ダークマップ"}
              </button>
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
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
                <div className="max-w-56 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs leading-relaxed text-amber-800 shadow-lg">
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                    showSectors
                      ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                      : "bg-white/80 text-stone-500 border-stone-200 hover:bg-white"
                  }`}
                >
                  🧭 方位 {showSectors ? "表示中" : "非表示"}
                </button>
              )}
              {/* 距離の輪。扇形と同じく「今どうなっているか」を書く。 */}
              {hasBase && (
                <button
                  onClick={() => {
                    const next = !showRings;
                    setShowRings(next);
                    localStorage.setItem(RINGS_STORAGE_KEY, next ? "1" : "0");
                  }}
                  title={
                    showRings
                      ? "出発地からの距離の輪を消す"
                      : "出発地からの距離の輪を出す（縮尺の目安）"
                  }
                  aria-pressed={showRings}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                    showRings
                      ? "bg-stone-600 text-white border-stone-600 hover:bg-stone-700"
                      : "bg-white/80 text-stone-500 border-stone-200 hover:bg-white"
                  }`}
                >
                  ◎ 距離 {showRings ? "表示中" : "非表示"}
                </button>
              )}
              {/* パワースポット（一宮・名勝）。出発地が無くても場所は出せる
                  ので hasBase で隠さない。方位と段階は出発地があるときだけ
                  吹き出しに載る。 */}
              <button
                onClick={() => {
                  const next = !showSpots;
                  setShowSpots(next);
                  localStorage.setItem(SPOTS_STORAGE_KEY, next ? "1" : "0");
                }}
                title={
                  showSpots
                    ? "名所（一宮・名勝）を消す"
                    : "名所（一宮・名勝）を出す。押すと出発地からの方位と段階が見られます"
                }
                aria-pressed={showSpots}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                  showSpots
                    ? "bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                    : "bg-white/80 text-stone-500 border-stone-200 hover:bg-white"
                }`}
              >
                ⛩ 名所 {showSpots ? "表示中" : "非表示"}
              </button>
              {/* 駅（国土数値情報 N02、2025 年版）。一覧は押されてから読む
                  （1 万駅・約 630KB）。z11 未満は升目にまとめる。 */}
              <button
                onClick={() => {
                  const next = !showStations;
                  setShowStations(next);
                  localStorage.setItem(STATIONS_STORAGE_KEY, next ? "1" : "0");
                }}
                title={
                  showStations
                    ? "駅を消す"
                    : "駅を出す。押すと出発地からの方位と段階が見られます（国土数値情報 N02）"
                }
                aria-pressed={showStations}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold transition-colors shadow-lg active:scale-95 cursor-pointer ${
                  showStations
                    ? "bg-blue-700 text-white border-blue-700 hover:bg-blue-800"
                    : "bg-white/80 text-stone-500 border-stone-200 hover:bg-white"
                }`}
              >
                🚉 駅 {showStations ? "表示中" : "非表示"}
              </button>
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
                    className={`px-2.5 py-1 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
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
                  className={`px-2.5 py-1 rounded-md font-mono text-[10px] font-bold transition-colors active:scale-95 cursor-pointer ${
                    isOverview
                      ? "bg-indigo-600 text-white"
                      : "text-stone-500 hover:bg-stone-100"
                  }`}
                >
                  🗾 全国
                </button>
              </div>
              {/* 凡例。出しているときだけ。押すと 1 区分だけ残る。
              色だけで 13 区分は見分けられない（実測 ΔE 6.8）ので、
              名前を並べて絞り込みで読ませる。

              **列のいちばん下に置く。**以前はダークマップの直下にあり、
              13 区分を開くと下の切り替え（現在地・方位・距離・名所・駅・
              近景/全国）が押し出されて見えなくなった（利用者の指摘）。
              列は縦にスクロールできるが、そうと分からない。凡例は
              最後にして、切り替えは常に手の届く所に残す。 */}
              {zoningOn && (
                /* 高さは列の側で決める。ここにも overflow を置くと
                   スクロールする器が入れ子になり、どちらが動くのか
                   分からなくなる。器は 1 つ。 */
                <div className="w-56 shrink-0 shadow-lg rounded-2xl">
                  <ZoningLegend
                    selected={zoningPick}
                    onSelect={setZoningPick}
                    notice={zoningNotice}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* 俯瞰の県塗りの凡例。「どの県へなら動けるか」の意思決定面。

            prefKigaku が無いときもパネルごと消さない。消すと、塗りが
            無いことも、条件が揃えば塗られることも画面から分からない。
            以前は判定が無いとき掲載件数の色に落ちていたが、物件を
            描かなくなったので、判定が無ければ塗らない。 */}
        {zoom < 10 && (
          <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto bg-white/85 backdrop-blur rounded-xl shadow-lg border border-stone-200 p-2.5 text-[10px] text-stone-700 space-y-1.5">
            <div className="font-bold text-stone-600">県の塗り分け</div>
            {prefKigaku ? (
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
            ) : (
              /* 何も塗っていないことと、何を入れれば塗られるかを言う。 */
              <div className="max-w-44 text-[10px] leading-relaxed text-stone-500">
                {kigakuUnavailableReason ??
                  "条件が揃うと方位の吉凶で塗り分けます"}
              </div>
            )}
          </div>
        )}

        {focusKind === "spot" && mapCenter && (
          <Marker position={mapCenter} alt="確認する候補の所在地">
            <Popup>
              確認する候補の所在地です。違う場合は地図をクリックして修正してください。
            </Popup>
          </Marker>
        )}

        {/* 起点の目印。吹き出しを持つので押せる。押せるものには名前が要る
            （Leaflet は `alt` を画像の代替文にする。無いと読み上げが
            「ボタン」とだけ言う）。 */}
        {zoom >= 10 && (
          <Marker position={[baseLat, baseLon]} alt="現在地・スキャン起点">
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
            「その県はあなたから見てどの方位で、選択日にその方位は動けるのか」
            を色にする。地図がそのまま意思決定面になる。判定が無ければ塗らない。 */}
        {zoom < 10 && geoData && (
          <GeoJSON
            key={`pref-geo-${
              prefKigaku
                ? Object.values(prefKigaku)
                    .map((i) => i.tier + (i.blocked ? "b" : ""))
                    .join("")
                : "none"
            }`}
            data={geoData}
            style={(feature) => {
              const prefName = feature?.properties?.name || "";
              const info = prefKigaku?.[prefName];
              if (info) {
                const fill = info.blocked
                  ? "#64748b"
                  : (TIER_FILL[info.tier as DayTier] ?? "#a8a29e");
                return {
                  fillColor: fill,
                  fillOpacity: 0.5,
                  color: "#1e293b",
                  weight: 1.2,
                  opacity: 0.6,
                };
              }
              return {
                fillColor: "#a8a29e",
                fillOpacity: 0.08,
                color: "#1e293b",
                weight: 1.2,
                opacity: 0.6,
              };
            }}
            onEachFeature={(feature, layer) => {
              const prefName = feature?.properties?.name || "";
              const info = prefKigaku?.[prefName];
              /* 方位は県の面積重心で決めている（lib/prefectureDirection）。
                 兵庫のように広い県は県内で方位が変わるので、その断りを
                 ポップアップに残す。街や地点は実座標で判定される。 */
              const kigakuLine = info
                ? `<div class="mt-1">方位: <b>${info.directionLabel}</b> — ${
                    info.blocked
                      ? '<b class="text-slate-500">天中殺で移転不可</b>'
                      : `<b>${TIER_JP[info.tier as DayTier] ?? info.tier}</b>`
                  }<span class="text-xs text-stone-500">（選択日の判定）</span>
                  <div class="text-xs text-stone-500">県の中心を基準にした方位です。広い県は県内でも方位が変わります（街や地点は個別に判定）</div></div>`
                : `<div class="text-xs text-stone-500 mt-1">${kigakuUnavailableReason ?? "条件が揃うと方位の吉凶で塗り分けます"}</div>`;
              layer.bindPopup(
                `<div class="font-sans text-xs text-gray-900 p-2 min-w-[120px]">
                  <div class="font-bold text-sm border-b border-gray-100 pb-1 mb-1.5">${prefName}</div>
                  ${kigakuLine}
                </div>`,
              );
            }}
          />
        )}

        {/* 方位の扇形。ズームに関わらず常に描く。
            以前は「ピンを個別表示しているときだけ」という条件付きで、
            物件が少ないとき（クラスター表示）に扇形が黙って消えていた。
            方位の吉凶はこの画面の主役なので、他の層の都合で消えてはいけない。

            zoom >= 10 の条件も外した。引くと扇形ごと消えるため、全国を
            見ている間は方位の境目がどこにも出ていなかった。

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

        {/* 距離の輪。縮尺の目盛りで、吉凶の帯ではない（lib/distanceRings）。
            扇形と同じ wedgeRangeKm を渡すので、画面に入る輪だけが出る。 */}
        <DistanceRings
          baseLat={hasBase ? baseLat : null}
          baseLon={hasBase ? baseLon : null}
          visibleRadiusKm={wedgeRangeKm}
          enabled={showRings}
        />

        {/* パワースポット（一宮・名勝）。判定は SpotVerdict と同じ経路
            （lib/powerSpots）。「この地点を判定へ」は地図クリックと同じ
            受け口 onInspectSpot に渡す。 */}
        <PowerSpotLayer
          enabled={showSpots}
          zoom={zoom}
          baseLat={hasBase ? baseLat : null}
          baseLon={hasBase ? baseLon : null}
          useClassical={useClassical}
          dirKigaku={dirKigaku}
          onInspect={onInspectSpot}
        />

        {/* 利用者が登録した地点（端末の localStorage）。常に出す。 */}
        <UserSpotLayer
          baseLat={hasBase ? baseLat : null}
          baseLon={hasBase ? baseLon : null}
          useClassical={useClassical}
          dirKigaku={dirKigaku}
          onInspect={onInspectSpot}
        />

        {/* 駅（国土数値情報 N02）。判定は名所と同じ経路。帰属表示は層が
            出ている間だけ足す（出典の明示が利用条件）。 */}
        <StationLayer
          enabled={showStations}
          zoom={zoom}
          baseLat={hasBase ? baseLat : null}
          baseLon={hasBase ? baseLon : null}
          useClassical={useClassical}
          dirKigaku={dirKigaku}
          onInspect={onInspectSpot}
        />
      </MapContainer>

      {/* 吉凶の凡例（右下）。扇形・俯瞰の県塗り・時期パネルの
          すべてが同じ段階（S〜X）なので、凡例もこの一つだけ。
          命式が未入力で段階を出せないときは、出していないことを言う */}
      {/*
        右下の凡例。**狭い画面では「凡例 ▾」に畳む。**

        400px では左下の俯瞰の段（198px）とこの凡例（208px）が両方
        bottom-4 で、368px の幅に収まらず 74px 重なっていた（Task #52。
        #1328 の候補数の札と同じ型の取り合い）。sm 未満では押し口だけ出し、
        開いたときは俯瞰の段の上に重なってよい（開いた人は凡例を見たい）。
        中身の 2 通り（段階の凡例／判定なし）は変えていない。
      */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="sm:hidden px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white/85 text-[10px] font-bold text-stone-700 shadow-lg backdrop-blur cursor-pointer"
        >
          {legendOpen ? "凡例 ▴" : "凡例 ▾"}
        </button>
        <div className={legendOpen ? "block" : "hidden sm:block"}>
          {dirKigaku ? (
            <div className="bg-white/80 text-stone-900 px-3.5 py-3 rounded-xl shadow-lg border border-stone-200 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-1.5">
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
                年・月・日の三盤を合成した選択日の判定。扇形と県塗りは同じ段階で塗っています。
              </span>
            </div>
          ) : (
            /*
          個人の判定が無いとき。以前はここで「アストロ吉凶（凡例）」を
          出し、超大吉／吉／注意／大凶／平穏を並べていた。生年月日が
          未入力でも API が「今日生まれ」で計算した値を返していたため、
          根拠の無い断定が色と言葉の両方で出ていた（本番で実測）。

          ここでは、色が何も意味していないことと、何を入れれば出るか
          だけを言う。
        */
            <div className="max-w-52 bg-white/85 text-stone-900 px-3.5 py-3 rounded-xl shadow-lg border border-stone-200 backdrop-blur text-[10px] pointer-events-none z-[1000] flex flex-col gap-1.5">
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
          )}
        </div>
      </div>

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

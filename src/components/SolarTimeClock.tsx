"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toLogMessage, toUserMessage } from "@/lib/errorMessage";
import {
  calculateSolarTime,
  getDailySolarSchedule,
  getKimonHour,
  type SolarTimeResult,
} from "../utils/solarTime";
import { calculateBioMetrics } from "../utils/bioModelingEngine";
import type { SpaceWeatherData } from "../utils/spaceWeather";
import type { SurfacePressureData } from "../utils/surfacePressure";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";
import { Solar } from "lunar-javascript";
import { getZonedDateTimeFields } from "@/utils/solarTime";

import { ClockDisplay } from "./ClockDisplay";
import {
  getHonmeiStar,
  getClassicalMonthStar,
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  BoardLayout,
  DoyouState,
  solarTermMonthAnchor,
  calculateVectorCollision,
  getPersonalVoidZodiac,
  getCurrentZodiac,
  ActionIntent,
  type ZodiacTimeBasis,
  Direction,
  StarFrequency,
  calculateLunarPhaseCondition,
  getPhysicalMonthStar,
  checkIsDoyouHazard,
} from "../utils/ephemerisEngine";
import {
  createPersonalizedOptimizer,
  OptimizationResult,
} from "../utils/timing-optimizer";
import type { NBAData } from "./nba/NBADashboard";
import { todayInJapan, toJapanDateString } from "@/utils/japanDate";
import {
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
} from "@/lib/userSettings";
import type { MunicipalityWealthItem } from "@/lib/municipalityWealth";
import type { MapProperty } from "@/lib/mapProperty";
import type { ScoredProperty } from "@/lib/scoredProperty";
// TenChiJinEvaluation・Loader2 は「総合スコア」タブと一緒に
// home/ScorecardPanel へ移した。
import { getStatusScore } from "@/lib/scoreTier";
import type {
  ScorecardDirection,
  ScorecardDirectionCell,
  ScorecardDayForecastEntry,
  ScorecardStarForecastEntry,
} from "./home/ScorecardPanel";
import {
  COMPASS_DIRECTIONS,
  CompassDirection,
  destinationForDirection,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import {
  directionBoardInstant,
  forecastAnchorMs as toForecastAnchorMs,
} from "@/utils/boardInstant";
import { statusForLayerMode, type LayerMode } from "@/utils/directionStatus";

/**
 * 書き出し用の 1 セル。オブジェクトや配列を "[object Object]" に
 * しないための畳み込み。区切りは行内の "|"（CSV の , と衝突しない）。
 */
export function formatCsvDetail(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}=${v}`)
      .join(" | ");
  }
  return String(value);
}

function parseSafeDate(dateStr: string | null | undefined, fallback: Date = new Date()): Date {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d;
  }
  return fallback;
}

function emptyScorecardDirectionCells(): Record<
  ScorecardDirection,
  ScorecardDirectionCell
> {
  const empty = (): ScorecardDirectionCell => ({
    status: "SAFE",
    score: 0,
    kigakuScore: 0,
    astroBonus: 0,
    timeGateModifier: 0,
  });
  return {
    N: empty(),
    NE: empty(),
    E: empty(),
    SE: empty(),
    S: empty(),
    SW: empty(),
    W: empty(),
    NW: empty(),
  };
}

const SolarTimeTable = dynamic(
  () => import("./SolarTimeTable").then((mod) => mod.SolarTimeTable),
  { ssr: false },
);
const BioMagneticDashboard = dynamic(
  () =>
    import("./BioMagneticDashboard").then((mod) => mod.BioMagneticDashboard),
  { ssr: false },
);
// TacticalMagneticMap・LocationPickerInner は「目的地/健康」タブの
// 後半と一緒に home/DestinationMapPanel へ移した。
const PersonalProfileConfig = dynamic(
  () =>
    import("./PersonalProfileConfig").then((mod) => mod.PersonalProfileConfig),
  { ssr: false },
);
const SystemTelemetryLog = dynamic(
  () => import("./SystemTelemetryLog").then((mod) => mod.SystemTelemetryLog),
  { ssr: false },
);
const TenchusatsuVisualizer = dynamic(
  () =>
    import("./TenchusatsuVisualizer").then((mod) => mod.TenchusatsuVisualizer),
  { ssr: false },
);
/**
 * 「相談」タブの中身。タブごとの分割（利用者の要望）の 1 つ目。
 * 開いたときだけ読み込む。数式（KaTeX）もこの中で遅延している。
 */
const ConsultPanel = dynamic(() => import("./home/ConsultPanel"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-40 flex items-center justify-center font-mono text-xs text-stone-600">
      [ 診断ボードを読込中... ]
    </div>
  ),
});

// ポータルは 1 枚目で必ず描くので、遅延にすると初回にちらつく。
// 中身は既に計算済みの値を並べるだけで軽い。
import HomePortal from "./home/HomePortal";

const DestinationMapPanel = dynamic(() => import("./home/DestinationMapPanel"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-40 flex items-center justify-center font-mono text-xs text-stone-600">
      [ 地図とヒートマップを読込中... ]
    </div>
  ),
});

const ScorecardPanel = dynamic(() => import("./home/ScorecardPanel"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-40 flex items-center justify-center font-mono text-xs text-stone-600">
      [ 総合スコアを読込中... ]
    </div>
  ),
});

// CosmicCalendar は /calendar に一本化したので、ここでは読み込まない。

/**
 * 環境テレメトリの折れ線（recharts）。「6. 履歴」タブの 1 か所でしか
 * 使わないので、静的に読むとホームを開いた全員が recharts を読むことになる。
 */
const TelemetryChart = dynamic(() => import("./TelemetryChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-600">
      [ LOADING TELEMETRY CHART... ]
    </div>
  ),
});

/**
 * 時期のヒートマップ 1 列ぶん。30 日表示は 1 日、12 ヶ月表示は 1 ヶ月。
 *
 * 外から来る応答ではなく、このファイルの中で組み立てている。形はそこで
 * 確定しているので、読む枝だけでなく作る側の全項目を書いている。
 */
export interface HeatmapColumn {
  /** 升目の見出し。30 日は "8/13"、12 ヶ月は "2026-08"。 */
  label: string;
  /** 方位ごとの畳んだ判定。色はこれで決まる。 */
  vectors: Record<Direction, string>;
  /** 畳む前の層。押したときに年盤・月盤・日盤の内訳を出すのに使う。 */
  rawVectorData: ReturnType<typeof calculateVectorCollision>;
  /** 天道が回座している方位。無い日もある。 */
  tendoDir?: Direction;
  /** その列が天中殺に当たるか。 */
  isVoid: boolean;
  /** 基準日から何日ずれた列か。押すと地図の日付をここへ動かす。 */
  offsetDays: number;
}

/** ヒートマップで押した升目。列（HeatmapColumn）と方位の組。 */
export interface TrendCell {
  label: string;
  dir: Direction;
  status: string;
  isTendo: boolean;
  raw: HeatmapColumn["rawVectorData"];
  tendoDir?: Direction;
  offsetDays: number;
}

// getVectorBreakdown は「相談」タブと一緒に home/ConsultPanel へ移した。

const filterLayerData = (
  layer: {
    yearLayer: Partial<Record<Direction, string>>;
    monthLayer: Partial<Record<Direction, string>>;
    dayLayer: Partial<Record<Direction, string>>;
    finalVectors: Record<Direction, string>;
    tendoDirection?: Direction;
    doyouState?: DoyouState;
  },
  personalStar: StarFrequency,
  getsuMeiStar: StarFrequency | null,
  voidZodiacArray: string[],
  directionFilterMode: string,
  yBoard: BoardLayout | null,
  mBoard: BoardLayout | null,
  dBoard: BoardLayout | null,
) => {
  // "optimal_only" / "exclude_noise" は算出レイヤーを削るのではなく、
  // ヒートマップ側の塗り分けだけを変える表示専用フィルタ。
  // ここで層を落とすと全セルが SAFE に潰れて情報が消えるため素通しする。
  if (
    directionFilterMode === "optimal_only" ||
    directionFilterMode === "exclude_noise"
  ) {
    return layer;
  }

  const showKigaku =
    directionFilterMode === "composite" ||
    directionFilterMode === "personal_kigaku" ||
    directionFilterMode.includes("kigaku");
  const showBazi =
    directionFilterMode === "composite" ||
    directionFilterMode === "personal_bazi" ||
    directionFilterMode.includes("bazi");
  const showEnv =
    directionFilterMode === "composite" ||
    directionFilterMode === "environmental" ||
    directionFilterMode.includes("env");

  if (showKigaku && showBazi && showEnv) {
    return layer;
  }

  const directions: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
    switch (star) {
      case 1:
        return [6, 7, 3, 4];
      case 2:
        return [9, 6, 7];
      case 3:
        return [1, 9];
      case 4:
        return [1, 9];
      case 5:
        return [9, 6, 7];
      case 6:
        return [2, 5, 8, 1];
      case 7:
        return [2, 5, 8, 1];
      case 8:
        return [9, 6, 7];
      case 9:
        return [3, 4, 2, 5, 8];
      default:
        return [];
    }
  };
  const compatiblesHonmei = getCompatibleStars(personalStar);
  const compatiblesGetsumei = getsuMeiStar
    ? getCompatibleStars(getsuMeiStar)
    : [];

  const getOptimalStatus = (
    starNum: StarFrequency,
  ): "OPTIMAL" | "OPTIMAL_REGULAR" | "SAFE" => {
    const isHonmeiComp = compatiblesHonmei.includes(starNum);
    if (!getsuMeiStar) {
      return isHonmeiComp ? "OPTIMAL" : "SAFE";
    }
    const isGetsumeiComp = compatiblesGetsumei.includes(starNum);
    if (isHonmeiComp && isGetsumeiComp) {
      return "OPTIMAL";
    } else if (isHonmeiComp) {
      return "OPTIMAL_REGULAR";
    }
    return "SAFE";
  };

  const z2d: Record<string, Direction[]> = {
    子: ["N"],
    丑: ["NE"],
    寅: ["NE"],
    卯: ["E"],
    辰: ["SE"],
    巳: ["SE"],
    午: ["S"],
    未: ["SW"],
    申: ["SW"],
    酉: ["W"],
    戌: ["NW"],
    亥: ["NW"],
  };
  const voidDirs = new Set<Direction>();
  voidZodiacArray.forEach((z) => {
    (z2d[z] || []).forEach((d) => voidDirs.add(d));
  });

  const getOpposite = (d: Direction): Direction => {
    const opposites: Record<string, Direction> = {
      N: "S",
      S: "N",
      E: "W",
      W: "E",
      NE: "SW",
      SW: "NE",
      NW: "SE",
      SE: "NW",
    };
    return opposites[d];
  };

  const combineStatuses = (list: string[]): string => {
    if (list.includes("NOISE_GOU")) return "NOISE_GOU";
    if (list.includes("NOISE_ANKEN")) return "NOISE_ANKEN";
    if (list.includes("NOISE_HONMEI")) return "NOISE_HONMEI";
    if (list.includes("NOISE_TEKI")) return "NOISE_TEKI";
    if (list.includes("NOISE_VOID")) return "NOISE_VOID";
    if (list.includes("NOISE_HA")) return "NOISE_HA";
    if (list.includes("NOISE_NODE")) return "NOISE_NODE";
    if (list.includes("NOISE")) return "NOISE";
    if (list.includes("OPTIMAL")) return "OPTIMAL";
    if (list.includes("OPTIMAL_REGULAR")) return "OPTIMAL_REGULAR";
    return "SAFE";
  };

  const filterStatus = (
    status: string | undefined,
    dir: Direction,
    activeBoard: BoardLayout | null,
  ) => {
    if (!status) return "SAFE";
    const resList: string[] = [];

    if (showKigaku) {
      let honmeiD: Direction | null = null;
      directions.forEach((d) => {
        if (activeBoard && activeBoard[d] === personalStar) {
          honmeiD = d;
        }
      });
      if (dir === honmeiD) resList.push("NOISE_HONMEI");
      else if (honmeiD && dir === getOpposite(honmeiD)) resList.push("NOISE_TEKI");
      else {
        const optStatus = getOptimalStatus(activeBoard ? activeBoard[dir] : 1);
        if (optStatus !== "SAFE") resList.push(optStatus);
      }
    }

    if (showBazi) {
      if (voidDirs.has(dir)) resList.push("NOISE_VOID");
    }

    if (showEnv) {
      let isGou = false;
      let isAnken = false;
      if (activeBoard) {
        directions.forEach((d) => {
          if (activeBoard[d] === 5) {
            if (d === dir) isGou = true;
            if (getOpposite(d) === dir) isAnken = true;
          }
        });
      }
      if (isGou) resList.push("NOISE_GOU");
      if (isAnken) resList.push("NOISE_ANKEN");
      if (status === "NOISE_HA") resList.push("NOISE_HA");
      if (status === "NOISE_NODE") resList.push("NOISE_NODE");
    }

    return combineStatuses(resList);
  };

  // 8 方位ぶんを直後のループで必ず埋める。同じ形の受け皿が下の
  // filterVectors にもあり（out）、そちらの書き方に合わせている。
  const newYearLayer = {} as Record<Direction, string>;
  const newMonthLayer = {} as Record<Direction, string>;
  const newDayLayer = {} as Record<Direction, string>;
  const newFinalVectors = {} as Record<Direction, string>;

  directions.forEach((d) => {
    newYearLayer[d] = filterStatus(layer.yearLayer[d], d, yBoard);
    newMonthLayer[d] = filterStatus(layer.monthLayer[d], d, mBoard);
    newDayLayer[d] = filterStatus(layer.dayLayer[d], d, dBoard);

    const list = [newYearLayer[d], newMonthLayer[d], newDayLayer[d]];
    newFinalVectors[d] = combineStatuses(list);
  });

  return {
    ...layer,
    yearLayer: newYearLayer,
    monthLayer: newMonthLayer,
    dayLayer: newDayLayer,
    finalVectors: newFinalVectors,
  };
};

const filterVectors = (
  vectorData: {
    yearLayer: Partial<Record<Direction, string>>;
    monthLayer: Partial<Record<Direction, string>>;
    dayLayer: Partial<Record<Direction, string>>;
    finalVectors: Record<Direction, string>;
  },
  personalStar: StarFrequency,
  voidZodiacs: string[],
  lunarNodeLon: number | null,
  yB: BoardLayout | null,
  mB: BoardLayout | null,
  dB: BoardLayout | null,
  mode: string,
  getsuMeiStar: StarFrequency | null = null,
  activeLayerMode: string = "final",
): Record<Direction, string> => {
  const filtered = filterLayerData(
    vectorData,
    personalStar,
    getsuMeiStar,
    voidZodiacs,
    mode,
    yB,
    mB,
    dB,
  );

  // 年+月 / 月+日 / 年+日 は地図側だけが合成しており、ここでは素通しして
  // 全統合（finalVectors）を返していた。同じボタンで選んでいるのに地図と
  // ヒートマップで違う判定が出るため、畳み方を共通の関数に寄せる。
  const dirs: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const out = {} as Record<Direction, string>;
  for (const d of dirs) {
    out[d] = statusForLayerMode(filtered, d, activeLayerMode);
  }
  return out;
};

export const SolarTimeClock = () => {


  const [baseTime, setBaseTime] = useState<Date | null>(null);
  const [ephemerisTime, setEphemerisTime] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<SolarTimeResult | null>(null);
  const [activeTab, setActiveTab] = useState<
    | "portal"
    | "profile"
    | "destination"
    | "timing"
    | "consult"
    | "history"
    | "scorecard"
  >("portal");

  // 前回開いていたタブを覚えておく。プロフィールは初回設定用で、
  // 日常的に開くのは目的地/健康やタイミングのほうなのに、
  // 読み込むたびに 1 番目へ戻されていた。
  // SSR とハイドレーションの食い違いを避けるため、初期値ではなく
  // マウント後に復元する。
  // 前回開いていたタブを覚えておく。プロフィールは初回設定用で、
  // 日常的に開くのは目的地/健康やタイミングのほうなのに、
  // 読み込むたびに 1 番目へ戻されていた。
  //
  // 保存を useEffect でやると、復元の setState が反映される前に
  // 初期値 "profile" で上書きしてしまう。保存はクリック時だけに限る。
  useEffect(() => {
    const saved = localStorage.getItem("stc_activeTab");
    if (
      saved &&
      [
        "portal",
        "profile",
        "destination",
        "timing",
        "consult",
        "history",
        "scorecard",
      ].includes(saved)
    ) {
      setActiveTab(saved as typeof activeTab);
      return;
    }

    /*
      初めての人には入力を先に出す。このサイトの答えは生年月日・出生地・
      現在地の 3 つで決まるので、それが未設定のままポータルを見せても
      「生年月日を入れると出ます」しか並ばない。
      設定済みの人には結果（ポータル）を先に出す。
    */
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const configured = Boolean(parsed && parsed.birth_date);
      setActiveTab(configured ? "portal" : "profile");
    } catch {
      // 読めないときは入力から。結果が出ない画面を見せるよりよい。
      setActiveTab("profile");
    }
  }, []);

  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem("stc_activeTab", tab);
    } catch {
      /* プライベートモードなどで保存できなくても動作は止めない */
    }
  };

  // NBA State
  const [nbaData, setNbaData] = useState<NBAData | null>(null);

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [activeLayerMode, setActiveLayerMode] = useState<LayerMode>("final");
  const [showOnlyNewBuild, setShowOnlyNewBuild] = useState(false);
  /**
   * 地図に出す物件。
   *
   * MagneticMapInner には最初から物件ピンを描く実装があり、
   * 「☐ 全物件表示 / ☑ 新築のみ表示」の切替も置いてある。取ってくる側の
   * /api/rentals/map もある。繋いでいなかったのはその 1 本だけで、
   * mapProperties は setter を一度も呼ばれず常に空だった。つまり
   * 切替を押しても、何も出ないものを絞り込んでいた。
   *
   * ここは公開のホーム（/）に載っている。開いた全員に 500 件を
   * 取りに行かせたくないので、出すと決めた人にだけ取りに行く。
   */
  const [mapProperties, setMapProperties] = useState<MapProperty[]>([]);
  const [showProperties, setShowProperties] = useState(false);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  // Geo & Environment State (Default: Tokyo)
  const [lat, setLat] = useState<number>(35.6895);
  const [lon, setLon] = useState<number>(139.6917);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(
    null,
  );
  const [geoData, setGeoData] = useState<GeomagneticData | null>(null);

  // Hardware Init State (Personal Profile)
  const [birthDate, setBirthDate] = useState<string>("2000-01-01T00:00");
  const [birthLat, setBirthLat] = useState<number>(35.6895);
  const [birthLon, setBirthLon] = useState<number>(139.6917);

  // Bio-Sync State
  const [hrv, setHrv] = useState(30);
  const [gsr, setGsr] = useState(1.8);
  const [baseSyncDays, setBaseSyncDays] = useState(30);
  /**
   * 過去 3 時間の気圧変化量 (hPa)。負の値が降下。
   *
   * bioModelingEngine には最初から「気象病」モデルが入っていて、1hPa の
   * 低下ごとに交感神経負荷を +3%（最大 30%）積む。標高や磁気嵐と重なると
   * 相乗ぶんも乗る。しかし setter が一度も呼ばれておらず、常に 0＝
   * 「気圧変化なし」で走っていた。/api/surface-pressure から入れる。
   *
   * 取れなかったときは 0 のまま（＝ペナルティなし）。宇宙天気と同じ扱いで、
   * 外部が落ちても画面は動かす。
   */
  const [pressureDrop, setPressureDrop] = useState(0);
  /** 気圧を実際に取れたか。取れていないのに 0 を「変化なし」と見せない。 */
  const [pressureData, setPressureData] = useState<{
    current: number;
    drop: number;
    timestamp: string | null;
  } | null>(null);

  // New Data Science Bio-Baselines
  const [baseSyncTimestamp, setBaseSyncTimestamp] = useState<string | null>(
    null,
  );
  const [baselineHrvMean, setBaselineHrvMean] = useState<number>(38);
  const [baselineHrvStd, setBaselineHrvStd] = useState<number>(6.5);
  const [baselineGsrMean, setBaselineGsrMean] = useState<number>(4.5);
  const [baselineGsrStd, setBaselineGsrStd] = useState<number>(1.5);

  const [ansLoad, setAnsLoad] = useState(22);
  const [shieldCapacity, setShieldCapacity] = useState(15);
  const [zScoreHRV, setZScoreHRV] = useState(0);
  const [hardwareDisplacementPenalty, setHardwareDisplacementPenalty] =
    useState(0);
  const [circadianMultiplier, setCircadianMultiplier] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // Future Simulation & Intent State
  const [timeOffsetDays, setTimeOffsetDays] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedDays, setPlaySpeedDays] = useState(1);
  const [actionIntent, setActionIntent] = useState<ActionIntent>("DEFAULT");
  const [useClassicalBoard, setUseClassicalBoard] = useState<boolean>(true);
  /*
    時支をどの時刻で採るか。既定は標準時（従来の答えのまま）。
    設定バーで切り替える。詳細は ZodiacTimeBasis（utils/ephemerisEngine）。
  */
  const [zodiacTimeBasis, setZodiacTimeBasis] =
    useState<ZodiacTimeBasis>("standard");
  const [physicalMonthMode, setPhysicalMonthMode] = useState<
    "coupled" | "independent"
  >("independent");
  /*
    方位の表示の基準。**既定は真北。**

    判定は上の targetDirection のとおり真北で固定なので、この値が効くのは

      - 画面に「方位（真北）」「方位（磁北）」のどちらを出すか
      - API へ渡す use_true_north（物件検索・資産マップが
        DECLINATION_WARNING を出すかどうかの判断に使う）
      - wealthData の direction / magneticDirection のどちらと突き合わせるか

    の 3 つ。以前の初期値は偽で、**既定が磁北**だった。表示だけでなく
    判定にも効いていたため、既定で磁北基準の吉凶を出していた。
  */
  const [useTrueNorth, setUseTrueNorth] = useState<boolean>(true);
  const [lunarPhaseModifier, setLunarPhaseModifier] = useState<boolean>(true);

  const [heatmapMode, setHeatmapMode] = useState<
    "none" | "30days" | "12months"
  >("none");
  /**
   * 時期のヒートマップ 1 列ぶん。30 日表示と 12 ヶ月表示で共通。
   *
   * 作っているのは同ファイルの useMemo（2894 行あたり）で、外から来る
   * 応答ではない。形はそこで確定している。
   */
  const [heatmapData, setHeatmapData] = useState<HeatmapColumn[]>([]);
  const [directionFilterMode, setDirectionFilterMode] = useState<string>("composite");
  /** ヒートマップで押した升目。押した列と方位を覚えて詳細を出す。 */
  const [selectedTrendCell, setSelectedTrendCell] =
    useState<TrendCell | null>(null);

  const [targetLat, setTargetLat] = useState<number | null>(null);
  const [targetLon, setTargetLon] = useState<number | null>(null);
  const [targetElevation, setTargetElevation] = useState<number | null>(null);
  const [voidZodiacOverride, setVoidZodiacOverride] = useState<string>("");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [isAutoSearching, setIsAutoSearching] = useState(false);

  // Timing Optimizer Preferences & Results
  const [usePsychologyScorer, setUsePsychologyScorer] = useState(true);
  const [useKigakuScorer, setUseKigakuScorer] = useState(true);
  const [useAstrologyScorer, setUseAstrologyScorer] = useState(true);
  const [timingOptimization, setTimingOptimization] =
    useState<OptimizationResult | null>(null);

  // HUD Layer Visibility (Idea 3)
  const [hudLayers, setHudLayers] = useState({
    terrain: true,
    weather: true,
    bio: true,
    hazard: true,
  });

  /**
   * ヒートマップの期間と地図の時間軸を同時に切り替える。
   * 12か月は年盤+月盤、30日は年盤+月盤+日盤で作るため、片方だけを
   * 切り替えると同じ日・同じ方位でも判定が食い違う。
   */
  const toggleHeatmapMode = (mode: "30days" | "12months") => {
    const nextMode = heatmapMode === mode ? "none" : mode;
    setHeatmapMode(nextMode);

    if (nextMode === "12months") {
      setActiveLayerMode("year_month");
    } else if (nextMode === "30days") {
      setActiveLayerMode("final");
    }
  };
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Scorecard Tab States
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [wealthData, setWealthData] = useState<MunicipalityWealthItem[]>([]);
  const [propertiesData, setPropertiesData] = useState<ScoredProperty[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<Direction | null>(
    null,
  );
  const [showNoiseDirections, setShowNoiseDirections] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [scorecardPrefecture, setScorecardPrefecture] =
    useState<string>("愛知県");
  const [gridModelView, setGridModelView] = useState<
    "consensus" | "classical" | "physicalIndep" | "physicalCoupled"
  >("consensus");
  const [scorecardActiveGridTab, setScorecardActiveGridTab] = useState<
    "dates" | "stars"
  >("dates");
  const [gridDimension, setGridDimension] = useState<
    "total" | "kigaku" | "astro" | "timeGate"
  >("total");

  useEffect(() => {
    if (activeTab === "scorecard") {
      const loadScorecardData = async () => {
        setScorecardLoading(true);
        try {
          const dateStr = baseTime
            ? toJapanDateString(
                new Date(baseTime.getTime() + timeOffsetDays * 86400000),
              )
            : todayInJapan();

          // Fetch Wealth Matrix data
          const wParams = new URLSearchParams();
          wParams.append("limit", "2000");
          wParams.append("baseLat", lat.toString());
          wParams.append("baseLon", lon.toString());
          wParams.append("birthLat", birthLat.toString());
          wParams.append("birthLon", birthLon.toString());
          wParams.append("birthDate", birthDate);
          wParams.append("targetDate", dateStr);
          wParams.append(
            "engineType",
            useClassicalBoard ? "classical" : "physical",
          );
          wParams.append(
            "nodeMapping",
            useClassicalBoard ? "traditional" : "physical",
          );
          wParams.append("layerMode", activeLayerMode);
          wParams.append("useTrueNorth", useTrueNorth.toString());
          wParams.append("lunarPhaseModifier", lunarPhaseModifier.toString());
          wParams.append("prefecture", scorecardPrefecture);

          const wRes = await fetch(
            `/api/municipalities-wealth?${wParams.toString()}`,
          );
          const wJson = await wRes.json();
          if (wJson.success) setWealthData(wJson.data || []);

          // Fetch Rental Arbitrage data
          const aParams = new URLSearchParams();
          aParams.append("limit", "1000");
          aParams.append("baseLat", lat.toString());
          aParams.append("baseLon", lon.toString());
          aParams.append("birthLat", birthLat.toString());
          aParams.append("birthLon", birthLon.toString());
          aParams.append("birthDate", birthDate);
          aParams.append("targetDate", dateStr);
          aParams.append("radiusKm", "all");
          aParams.append("prefecture", scorecardPrefecture);
          aParams.append("useClassical", useClassicalBoard.toString());
          aParams.append(
            "nodeMapping",
            useClassicalBoard ? "traditional" : "physical",
          );
          aParams.append("layerMode", activeLayerMode);
          aParams.append("useTrueNorth", useTrueNorth.toString());
          aParams.append("lunarPhaseModifier", lunarPhaseModifier.toString());
          aParams.append("maxBuildingAge", "5");

          const aRes = await fetch(
            `/api/rentals/arbitrage?${aParams.toString()}`,
          );
          const aJson = await aRes.json();
          setPropertiesData(aJson.properties || []);
        } catch (e) {
          console.error("Failed to load scorecard data:", e);
        } finally {
          setScorecardLoading(false);
        }
      };
      loadScorecardData();
    }
  }, [
    activeTab,
    lat,
    lon,
    birthLat,
    birthLon,
    birthDate,
    baseTime,
    timeOffsetDays,
    useClassicalBoard,
    activeLayerMode,
    useTrueNorth,
    lunarPhaseModifier,
    scorecardPrefecture,
  ]);

  const fetchNBAData = React.useCallback(async () => {
    try {
      const targetDateStr = baseTime
        ? new Date(baseTime.getTime() + timeOffsetDays * 86400000).toISOString()
        : new Date().toISOString();
      const payload = {
        ansLoad,
        shieldCapacity,
        hrv,
        gsr,
        birthDate,
        lon,
        targetDate: targetDateStr,
        useClassical: useClassicalBoard,
        // 時支をどの時刻で採るか。省くとサーバ側は標準時（従来の答え）。
        zodiacTimeBasis,
      };
      const res = await fetch("/api/nba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch NBA data: ${res.status} ${res.statusText} - ${errorText}`,
        );
      }
      const json = await res.json();
      if (json.success) {
        setNbaData(json.data);
      } else {
        console.warn(
          "[fetchNBAData] Server returned success: false",
          json.error,
        );
      }
    } catch (err) {
      console.error("[fetchNBAData] POST Request Error:", toLogMessage(err));
    }
  }, [
    ansLoad,
    shieldCapacity,
    hrv,
    gsr,
    birthDate,
    lon,
    baseTime,
    timeOffsetDays,
    useClassicalBoard,
    // 時刻基準を切り替えたら取り直す。入れないと切り替えが反映されない。
    zodiacTimeBasis,
  ]);

  useEffect(() => {
    // プロフィールタブは判定を表示しないので、開いている間は判定計算
    // （/api/nba への POST）を叩かない。ホームを開いた瞬間に生年月日や
    // 座標を打つたび再計算が走っていた。別のタブへ移った時点で
    // activeTab が変わり、この効果が発火して 1 秒後に取りに行く。
    if (activeTab === "profile") return;
    const timer = setTimeout(() => {
      fetchNBAData();
    }, 1000); // 1s debounce
    return () => clearTimeout(timer);
  }, [fetchNBAData, activeTab]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeOffsetDays((prev) => prev + playSpeedDays);
      }, 500); // 0.5s per tick
    }
    return () => clearInterval(interval);
  }, [isPlaying, playSpeedDays]);

  const loadFromLocal = React.useCallback(async () => {
    let isLoaded = false;
    // 匿名でも動くように端末の値を土台にし、ログイン中ならクラウドの値と
    // 新しいほうを採る。未ログインなら loadSettings が端末の値をそのまま返す。
    const { settings: data } = await loadSettings();

    if (Object.keys(data).length > 0) {
      try {
        if (data.birth_date) setBirthDate(data.birth_date);
        if (data.birth_lat !== undefined) setBirthLat(data.birth_lat);
        if (data.birth_lon !== undefined) setBirthLon(data.birth_lon);
        if (data.base_lat !== undefined) setLat(data.base_lat);
        if (data.base_lon !== undefined) setLon(data.base_lon);
        if (data.void_zodiac_override !== undefined)
          setVoidZodiacOverride(data.void_zodiac_override);
        if (data.gemini_key_exists) setGeminiKey("********");
        if (data.baseline_hrv_mean !== undefined)
          setBaselineHrvMean(data.baseline_hrv_mean);
        if (data.baseline_hrv_std !== undefined)
          setBaselineHrvStd(data.baseline_hrv_std);
        if (data.baseline_gsr_mean !== undefined)
          setBaselineGsrMean(data.baseline_gsr_mean);
        if (data.baseline_gsr_std !== undefined)
          setBaselineGsrStd(data.baseline_gsr_std);
        if (data.base_sync_timestamp !== undefined)
          setBaseSyncTimestamp(data.base_sync_timestamp);
        if (data.use_psychology_scorer !== undefined)
          setUsePsychologyScorer(data.use_psychology_scorer);
        if (data.use_kigaku_scorer !== undefined)
          setUseKigakuScorer(data.use_kigaku_scorer);
        if (data.use_astrology_scorer !== undefined)
          setUseAstrologyScorer(data.use_astrology_scorer);
        if (data.hrv !== undefined) setHrv(data.hrv);
        if (data.gsr !== undefined) setGsr(data.gsr);
        if (data.ansLoad !== undefined) setAnsLoad(data.ansLoad);
        if (data.shieldCapacity !== undefined)
          setShieldCapacity(data.shieldCapacity);
        // Load unified configurations
        if (data.use_classical_board !== undefined)
          setUseClassicalBoard(data.use_classical_board);
        // "solar" 以外は標準時に倒す（設定バーの normalizeZodiacTimeBasis と同じ約束）。
        setZodiacTimeBasis(
          data.zodiac_time_basis === "solar" ? "solar" : "standard",
        );
        if (data.physical_month_mode !== undefined)
          setPhysicalMonthMode(data.physical_month_mode);
        if (data.use_true_north !== undefined)
          setUseTrueNorth(data.use_true_north);
        if (data.lunar_phase_modifier !== undefined)
          setLunarPhaseModifier(data.lunar_phase_modifier);
        if (data.layer_mode !== undefined) setActiveLayerMode(data.layer_mode);
        if (data.direction_filter_mode !== undefined)
          setDirectionFilterMode(data.direction_filter_mode);
        isLoaded = true;
      } catch (e) {
        console.error("Settings apply error", e);
      }
    }

    // Sync from Relocation Matrix Dashboard if available
    if (typeof window !== "undefined") {
      const wBirthDate = localStorage.getItem("wealth_birthDate");
      const wBirthLat = localStorage.getItem("wealth_birthLat");
      const wBirthLon = localStorage.getItem("wealth_birthLon");
      const wBaseLat = localStorage.getItem("wealth_baseLat");
      const wBaseLon = localStorage.getItem("wealth_baseLon");

      if (wBirthDate) {
        setBirthDate(wBirthDate);
        isLoaded = true;
      }
      if (wBirthLat) {
        setBirthLat(Number(wBirthLat));
        isLoaded = true;
      }
      if (wBirthLon) {
        setBirthLon(Number(wBirthLon));
        isLoaded = true;
      }
      if (wBaseLat) {
        setLat(Number(wBaseLat));
        isLoaded = true;
      }
      if (wBaseLon) {
        setLon(Number(wBaseLon));
        isLoaded = true;
      }
    }

    setConfigLoaded(true);
    return isLoaded;
  }, []);

  const handleLoadConfig = React.useCallback(async (silent = true) => {
    const localFound = await loadFromLocal();
    if (!localFound && !silent) alert("保存された設定が見つかりませんでした。");
    return localFound;
  }, [loadFromLocal]);

  useEffect(() => {
    handleLoadConfig(true);
  }, [handleLoadConfig]);

  /*
    頁の上の入力欄（QuickProfileBar）で保存されたら読み直す。
    同じ頁に生年月日と出発地を入れる場所が 2 つあるので、片方で
    入れた値がもう片方に出ないと「保存できていない」と見える。
    行事名は物件検索の設定バーが使っているものと同じ。
  */
  useEffect(() => {
    const reload = () => {
      handleLoadConfig(true);
    };
    window.addEventListener("metaphysical-config-updated", reload);
    return () =>
      window.removeEventListener("metaphysical-config-updated", reload);
  }, [handleLoadConfig]);

  useEffect(() => {
    if (!configLoaded) return;

    const autoSave = async () => {
      try {
        const partialConfig = {
          use_classical_board: useClassicalBoard,
          physical_month_mode: physicalMonthMode,
          use_true_north: useTrueNorth,
          lunar_phase_modifier: lunarPhaseModifier,
          layer_mode: activeLayerMode,
          direction_filter_mode: directionFilterMode,
          base_lat: lat,
          base_lon: lon,
          birth_date: birthDate,
          birth_lat: birthLat,
          birth_lon: birthLon,
        };

        // Save to localStorage
        const localData = localStorage.getItem("tactical_config_v1");
        let currentLocal = {};
        if (localData) {
          try {
            currentLocal = JSON.parse(localData);
          } catch {}
        }
        localStorage.setItem(
          "tactical_config_v1",
          JSON.stringify({ ...currentLocal, ...partialConfig }),
        );

      } catch (e) {
        console.error("Auto-save configuration failed:", e);
      }
    };

    autoSave();
  }, [
    useClassicalBoard,
    physicalMonthMode,
    useTrueNorth,
    lunarPhaseModifier,
    activeLayerMode,
    directionFilterMode,
    lat,
    lon,
    birthDate,
    birthLat,
    birthLon,
    configLoaded,
  ]);

  const handleGetGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLon(position.coords.longitude);

          const nowIso = new Date().toISOString();
          setBaseSyncTimestamp(nowIso);
          setBaseSyncDays(0);

          alert(
            "現在のGPS座標をBase座標としてセットし、環境順化（シールド）のタイムスタンプをリセットしました。",
          );
        },
        (error) => {
          console.error("GPS Error:", error);
          alert(
            "GPS情報の取得に失敗しました。ブラウザの設定と権限をご確認ください。",
          );
        },
      );
    } else {
      alert("ご使用のプラットフォームはGPSをサポートしていません。");
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      let currentPresets = [];
      if (typeof window !== "undefined") {
        const savedPresetsStr =
          localStorage.getItem("profile_presets_v1") ||
          localStorage.getItem("wealth_presets");
        if (savedPresetsStr) {
          try {
            currentPresets = JSON.parse(savedPresetsStr);
          } catch {}
        }
      }

      const configToSave = {
        birth_date: birthDate,
        birth_lat: birthLat,
        birth_lon: birthLon,
        base_lat: lat,
        base_lon: lon,
        void_zodiac_override: voidZodiacOverride,
        gemini_key_exists: geminiKey && geminiKey !== "",
        baseline_hrv_mean: baselineHrvMean,
        baseline_hrv_std: baselineHrvStd,
        baseline_gsr_mean: baselineGsrMean,
        baseline_gsr_std: baselineGsrStd,
        base_sync_timestamp: baseSyncTimestamp,
        use_psychology_scorer: usePsychologyScorer,
        use_kigaku_scorer: useKigakuScorer,
        use_astrology_scorer: useAstrologyScorer,
        hrv,
        gsr,
        ansLoad,
        shieldCapacity,
        // Persist unified configurations
        use_classical_board: useClassicalBoard,
        physical_month_mode: physicalMonthMode,
        use_true_north: useTrueNorth,
        lunar_phase_modifier: lunarPhaseModifier,
        layer_mode: activeLayerMode,
        direction_filter_mode: directionFilterMode,
        presets: currentPresets,
      };

      // 端末に保存し、ログイン中ならクラウドにも同期する。
      // 以前はここが localStorage だけで、他の画面は /api/user-config だけを
      // 見ていたため、ホームで設定した出発地が物件検索に伝わらなかった。
      const { synced } = await saveSettings(configToSave);

      // Sync back to Relocation Matrix Dashboard
      if (typeof window !== "undefined") {
        localStorage.setItem("wealth_birthDate", birthDate);
        localStorage.setItem("wealth_birthLat", birthLat.toString());
        localStorage.setItem("wealth_birthLon", birthLon.toString());
        localStorage.setItem("wealth_baseLat", lat.toString());
        localStorage.setItem("wealth_baseLon", lon.toString());
      }

      alert(
        synced
          ? "設定を保存しました。ログイン中のため、他の端末でも同じ設定が使えます。"
          : "設定をこの端末に保存しました。別の端末やブラウザには引き継がれません。",
      );
      if (geminiKey && geminiKey !== "") {
        setGeminiKey("********");
      }
    } catch (err) {
      console.error("Save Error:", err);
      alert("設定をこの端末に保存しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const getTargetDirectionInfo = React.useCallback(() => {
    if (targetLat !== null && targetLon !== null && lat && lon) {
      const toRad = (val: number) => (val * Math.PI) / 180;
      const toDeg = (val: number) => (val * 180) / Math.PI;
      const dLon = toRad(targetLon - lon);
      const y = Math.sin(dLon) * Math.cos(toRad(targetLat));
      const x =
        Math.cos(toRad(lat)) * Math.sin(toRad(targetLat)) -
        Math.sin(toRad(lat)) * Math.cos(toRad(targetLat)) * Math.cos(dLon);
      let trueBrng = toDeg(Math.atan2(y, x));
      trueBrng = (trueBrng + 360) % 360;

      // 取得できなければ補正なし。東京固定の値を当てるより、
      // 「磁北でも同じ方位」として注意を出さないほうが正しい。
      const declination = geoData?.declination ?? 0;
      const magBrng = (trueBrng - declination + 360) % 360;

      const getDir = (bearing: number): Direction =>
        directionFromBearing(
          bearing,
          useClassicalBoard ? "traditional" : "physical",
        );

      return {
        trueDirection: getDir(trueBrng),
        magneticDirection: getDir(magBrng),
      };
    }
    return null;
  }, [
    targetLat,
    targetLon,
    lat,
    lon,
    geoData?.declination,
    useClassicalBoard,
  ]);

  /**
   * 目的地の方位。地図で選んだ地点から決まる。
   *
   * ヒートマップは 8 方位を等しく並べているだけで、地図で選んだ目的地が
   * どの行なのかを示していなかった。「北東がいつ吉になるか」は読めても
   * 「自分が行きたい場所がいつ吉になるか」が読めない状態だったので、
   * 目的地に対応する行へ印を付けるために使う。
   */
  /*
    **判定は必ず真北**（CLAUDE.md 3 節）。以前はここが

      return useTrueNorth ? info.trueDirection : info.magneticDirection;

    で、`useTrueNorth` の初期値は偽だったので、**既定では磁北基準の方位で
    吉凶を読んでいた。**この targetDirection がヒートマップのどの行を指すか
    と地図のどの扇形を強調するかを決めるので、答えそのものが磁北基準だった。

    偏角のぶん方位が変わる目的地は少なくない。0.1 度刻みで走査した実測で、
    真北と磁北で八方位の割り当てが変わるのは

      偏角 -5 度（沖縄あたり） 11.1%
      偏角 -7 度（東京あたり） 15.6%
      偏角 -9 度（北海道あたり） 20.0%

    伝統区分・45 度等分のどちらでも同じ割合だった。**6〜9 件に 1 件は
    吉凶が入れ替わりうる。**さらに `/houi` の記事は全国向けの静的ページで
    真北なので、記事と道具が食い違ってもいた。

    トグルは残す。ただし効くのは「方位磁針で測るとどこを指すか」の表示と、
    API へ渡す use_true_north だけで、**判定の基準は選べない。**
    simulator の同じトグルにも「判定は真北で固定」と書いてある。
  */
  const targetDirection = useMemo(
    () => getTargetDirectionInfo()?.trueDirection ?? null,
    [getTargetDirectionInfo],
  );

  /**
   * ヒートマップで選んでいる方位。地図の強調表示に渡す。
   * 未選択なら目的地の方位へ戻し、地図とヒートマップの焦点を一致させる。
   */
  const [focusedDirection, setFocusedDirection] = useState<string | null>(null);
  const highlightDirection = focusedDirection ?? targetDirection;

  /**
   * ヒートマップで選んだ方位へ目的地を動かす（ヒートマップ→地図）。
   *
   * 現在の目的地までの距離は保ったまま向きだけを変える。距離が未設定なら
   * 50km に置く。座標と方位の変換は directionGeo に置いてある
   * （偏角の符号を片方だけ間違えると 1 区画ずれるので往復をテストしている）。
   */
  const moveTargetToDirection = (dir: string) => {
    if (!lat || !lon) return;
    if (!COMPASS_DIRECTIONS.includes(dir as CompassDirection)) return;

    let distanceKm = 50;
    if (targetLat !== null && targetLon !== null) {
      const measured = distanceKmBetween(lat, lon, targetLat, targetLon);
      // 出発地とほぼ同じ地点だと向きが定まらないので最低限の距離を確保する。
      if (Number.isFinite(measured) && measured > 1) distanceKm = measured;
    }

    /*
      置く側も真北。**読む側（targetDirection）と揃えないと往復しない。**
      以前は useTrueNorth を渡していたので、磁北表示のときは
      「北東へ動かす」で置いた地点を読み直すと北になる、ということが
      起きえた（偏角が方位の幅の何分の一かを占めるため）。
      往復は __tests__/targetDirectionTrueNorth.test.ts で固定してある。
    */
    const dest = destinationForDirection(
      lat,
      lon,
      dir as CompassDirection,
      distanceKm,
      geoData?.declination ?? 0,
      true,
    );

    setTargetLat(Number(dest.lat.toFixed(5)));
    setTargetLon(Number(dest.lon.toFixed(5)));
    setFocusedDirection(dir);
  };
  const handleAutoSearch = () => {
    if (!baseTime || !honmeiStar) return;
    setIsAutoSearching(true);

    const targetDirInfo = getTargetDirectionInfo();

    setTimeout(() => {
      let offset = timeOffsetDays + 1;
      let foundOffset: number | null = null;
      const MAX_SEARCH_DAYS = 365;

      for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
        const testDate = new Date(baseTime.getTime() + offset * 86400000);

        const cz = getCurrentZodiac(testDate, lon || 139.6917, zodiacTimeBasis);
        if (
          personalVoidZodiac.includes(cz.yearZodiac) ||
          personalVoidZodiac.includes(cz.monthZodiac) ||
          personalVoidZodiac.includes(cz.dayZodiac)
        ) {
          offset++;
          continue;
        }

        const testEnv = getCurrentEnvironmentalFrequencies(
          testDate,
          lon || 139.6917,
          physicalMonthMode,
        );
        const yB = generateBoard(
          useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar,
        );
        const mB = generateBoard(
          useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar,
        );
        const dB = generateBoard(
          useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar,
        );

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB,
          mB,
          dB,
          personalVoidZodiac,
          testEnv.raw.lunarNode,
          actionIntent,
          testDate,
          lon || 139.6917,
          useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
          useClassicalBoard ? "traditional" : "physical",
        );

        if (targetDirInfo) {
          // 判定は真北（上の targetDirection の注記と同じ理由）。
          const s =
            vectorData.finalVectors[targetDirInfo.trueDirection as Direction];
          if (s === "SAFE" || s === "OPTIMAL") {
            foundOffset = offset;
            break;
          }
        } else {
          const hasOptimal = Object.values(vectorData.finalVectors).includes(
            "OPTIMAL",
          );
          if (hasOptimal) {
            foundOffset = offset;
            break;
          }
        }
        offset++;
      }

      setIsAutoSearching(false);

      if (foundOffset !== null) {
        setTimeOffsetDays(foundOffset);
      } else {
        alert(
          "365日以内に完全に安全な移動タイミングが見つかりませんでした。目的（Action Intent）を変更して再検索するか、目的地を変えてください。",
        );
      }
    }, 50);
  };

  const birthSolarData = React.useMemo(() => {
    if (!birthDate || !birthLon) return null;
    const d = new Date(birthDate);
    if (isNaN(d.getTime())) return null;
    return calculateSolarTime(d, birthLon);
  }, [birthDate, birthLon]);

  const env = React.useMemo(() => {
    if (!solarData?.solarTime || isNaN(solarData.solarTime.getTime())) {
      if (!ephemerisTime || isNaN(ephemerisTime.getTime())) return null;
      return getCurrentEnvironmentalFrequencies(
        ephemerisTime,
        lon || 139.6917,
        physicalMonthMode,
      );
    }
    return getCurrentEnvironmentalFrequencies(
      solarData.solarTime,
      lon || 139.6917,
      physicalMonthMode,
    );
  }, [ephemerisTime, solarData, lon, physicalMonthMode]);

  /**
   * 方位盤の評価時刻。選択中の日の正午（太陽時）に固定する。
   *
   * 地図の扇形は時計の現在時刻で、ヒートマップは正午で計算していたため、
   * 太陽時に直したときに日をまたぎ、同じ日・同じ方位でも別の判定になっていた。
   * ヒートマップと同じ関数から出すことで、両者が食い違わないようにする。
   * 時盤・八門など時刻そのものが要る表示は従来どおり env（現在時刻）を使う。
   */
  const boardInstantMs = React.useMemo(() => {
    if (!baseTime) return null;
    return directionBoardInstant(
      baseTime,
      timeOffsetDays,
      lon || 139.6917,
    ).getTime();
    // baseTime は毎分更新されるが、正午に丸めるので同じ日なら結果は変わらない。
  }, [baseTime, timeOffsetDays, lon]);

  const boardEnv = React.useMemo(() => {
    if (boardInstantMs === null) return env;
    return getCurrentEnvironmentalFrequencies(
      new Date(boardInstantMs),
      lon || 139.6917,
      physicalMonthMode,
    );
  }, [boardInstantMs, lon, physicalMonthMode, env]);

  const birthEnv = React.useMemo(() => {
    if (!birthSolarData || isNaN(birthSolarData.solarTime.getTime()))
      return null;
    return getCurrentEnvironmentalFrequencies(
      birthSolarData.solarTime,
      birthLon || 139.6917,
    );
  }, [birthSolarData, birthLon]);

  const honmeiStar = React.useMemo(() => {
    if (
      birthSolarData?.solarTime &&
      !isNaN(birthSolarData.solarTime.getTime())
    ) {
      return getHonmeiStar(birthSolarData.solarTime);
    }
    if (birthDate) {
      const d = new Date(birthDate);
      if (!isNaN(d.getTime())) {
        return getHonmeiStar(d);
      }
    }
    return null;
  }, [birthDate, birthSolarData]);

  const getsuMeiStar = React.useMemo(() => {
    if (
      birthSolarData?.solarTime &&
      !isNaN(birthSolarData.solarTime.getTime())
    ) {
      return getClassicalMonthStar(new Date(birthSolarData.solarTime));
    }
    if (birthDate) {
      const d = new Date(birthDate);
      if (!isNaN(d.getTime())) {
        return getClassicalMonthStar(d);
      }
    }
    return null;
  }, [birthDate, birthSolarData]);

  const {
    layers: rawLayers,
    physicalLayers: rawPhysicalLayers,
    classicalLayers: rawClassicalLayers,
    physicalIndepLayers: rawPhysicalIndepLayers,
    physicalCoupledLayers: rawPhysicalCoupledLayers,
    physicalYearBoard,
    physicalMonthBoard,
    physicalDayBoard,
    physicalMonthIndepBoard,
    physicalMonthCoupledBoard,
    classicalYearBoard,
    classicalMonthBoard,
    classicalDayBoard,
  } = React.useMemo(() => {
    if (!env || !boardEnv || !honmeiStar)
      return {
        board: null,
        layers: null,
        physicalLayers: null,
        classicalLayers: null,
        physicalIndepLayers: null,
        physicalCoupledLayers: null,
        physicalYearBoard: null,
        physicalMonthBoard: null,
        physicalDayBoard: null,
        physicalMonthIndepBoard: null,
        physicalMonthCoupledBoard: null,
        classicalYearBoard: null,
        classicalMonthBoard: null,
        classicalDayBoard: null,
      };

    const bDate = new Date(birthDate);
    if (isNaN(bDate.getTime()))
      return {
        board: null,
        layers: null,
        physicalLayers: null,
        classicalLayers: null,
        physicalIndepLayers: null,
        physicalCoupledLayers: null,
        physicalYearBoard: null,
        physicalMonthBoard: null,
        physicalDayBoard: null,
        physicalMonthIndepBoard: null,
        physicalMonthCoupledBoard: null,
        classicalYearBoard: null,
        classicalMonthBoard: null,
        classicalDayBoard: null,
      };

    // Boards for internal calculation based on user preference toggle
    const yB = generateBoard(
      useClassicalBoard ? boardEnv.classicalYearStar : boardEnv.yearStar,
    );
    const mB = generateBoard(
      useClassicalBoard ? boardEnv.classicalMonthStar : boardEnv.monthStar,
    );
    const dB = generateBoard(
      useClassicalBoard ? boardEnv.classicalDayStar : boardEnv.dayStar,
    );

    // Strict Physical boards for UI display
    const pyB = generateBoard(boardEnv.yearStar);
    const pmB = generateBoard(boardEnv.monthStar);
    const pdB = generateBoard(boardEnv.dayStar);

    // Strict Classical boards for UI display
    const cyB = generateBoard(boardEnv.classicalYearStar);
    const cmB = generateBoard(boardEnv.classicalMonthStar);
    const cdB = generateBoard(boardEnv.classicalDayStar);

    const voidZodiacArray = voidZodiacOverride
      ? voidZodiacOverride.split("")
      : getPersonalVoidZodiac(bDate);
    // 盤の評価時刻。ヒートマップと同じ「その日の正午（太陽時）」を使う。
    const tDate =
      boardInstantMs !== null
        ? new Date(boardInstantMs)
        : solarData?.solarTime || ephemerisTime || new Date();

    // Strict Physical boards for Independent and Coupled modes
    const pmStar_indep = getPhysicalMonthStar(tDate, "independent");
    const pmStar_coupled = getPhysicalMonthStar(tDate, "coupled");

    const pmB_indep = generateBoard(pmStar_indep);
    const pmB_coupled = generateBoard(pmStar_coupled);

    const vectorData = calculateVectorCollision(
      useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
      yB,
      mB,
      dB,
      voidZodiacArray,
      boardEnv.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
      useClassicalBoard ? "traditional" : "physical",
    );

    const physicalVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB,
      pmB,
      pdB,
      voidZodiacArray,
      boardEnv.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      undefined,
      "physical",
    );

    const classicalVectorData = calculateVectorCollision(
      honmeiStar.classical,
      cyB,
      cmB,
      cdB,
      voidZodiacArray,
      boardEnv.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      getsuMeiStar || undefined,
      "traditional",
    );

    const physicalIndepVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB,
      pmB_indep,
      pdB,
      voidZodiacArray,
      boardEnv.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      undefined,
      "physical",
    );

    const physicalCoupledVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB,
      pmB_coupled,
      pdB,
      voidZodiacArray,
      boardEnv.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      undefined,
      "physical",
    );

    return {
      board: dB,
      layers: vectorData,
      physicalLayers: physicalVectorData,
      classicalLayers: classicalVectorData,
      physicalIndepLayers: physicalIndepVectorData,
      physicalCoupledLayers: physicalCoupledVectorData,
      physicalYearBoard: pyB,
      physicalMonthBoard: pmB,
      physicalDayBoard: pdB,
      physicalMonthIndepBoard: pmB_indep,
      physicalMonthCoupledBoard: pmB_coupled,
      classicalYearBoard: cyB,
      classicalMonthBoard: cmB,
      classicalDayBoard: cdB,
    };
  }, [
    honmeiStar,
    getsuMeiStar,
    boardEnv,
    boardInstantMs,
    birthDate,
    actionIntent,
    voidZodiacOverride,
    useClassicalBoard,
    solarData,
    ephemerisTime,
    env,
    lon,
  ]);

  const filteredLayers = React.useMemo(() => {
    if (
      !rawLayers ||
      !rawPhysicalLayers ||
      !rawClassicalLayers ||
      !rawPhysicalIndepLayers ||
      !rawPhysicalCoupledLayers ||
      !honmeiStar
    ) {
      return {
        layers: null,
        physicalLayers: null,
        classicalLayers: null,
        physicalIndepLayers: null,
        physicalCoupledLayers: null,
      };
    }

    const bDate = new Date(birthDate);
    if (isNaN(bDate.getTime()))
      return {
        layers: null,
        physicalLayers: null,
        classicalLayers: null,
        physicalIndepLayers: null,
        physicalCoupledLayers: null,
      };

    const personalStar = useClassicalBoard
      ? honmeiStar.classical
      : honmeiStar.physical;
    const voidZodiacArray = voidZodiacOverride
      ? voidZodiacOverride.split("")
      : getPersonalVoidZodiac(bDate);

    return {
      layers: filterLayerData(
        rawLayers,
        personalStar,
        useClassicalBoard ? getsuMeiStar : null,
        voidZodiacArray,
        directionFilterMode,
        useClassicalBoard ? classicalYearBoard : physicalYearBoard,
        useClassicalBoard ? classicalMonthBoard : physicalMonthBoard,
        useClassicalBoard ? classicalDayBoard : physicalDayBoard,
      ),
      physicalLayers: filterLayerData(
        rawPhysicalLayers,
        honmeiStar.physical,
        null,
        voidZodiacArray,
        directionFilterMode,
        physicalYearBoard,
        physicalMonthBoard,
        physicalDayBoard,
      ),
      classicalLayers: filterLayerData(
        rawClassicalLayers,
        honmeiStar.classical,
        getsuMeiStar,
        voidZodiacArray,
        directionFilterMode,
        classicalYearBoard,
        classicalMonthBoard,
        classicalDayBoard,
      ),
      physicalIndepLayers: filterLayerData(
        rawPhysicalIndepLayers,
        honmeiStar.physical,
        null,
        voidZodiacArray,
        directionFilterMode,
        physicalYearBoard,
        physicalMonthIndepBoard,
        physicalDayBoard,
      ),
      physicalCoupledLayers: filterLayerData(
        rawPhysicalCoupledLayers,
        honmeiStar.physical,
        null,
        voidZodiacArray,
        directionFilterMode,
        physicalYearBoard,
        physicalMonthCoupledBoard,
        physicalDayBoard,
      ),
    };
  }, [
    rawLayers,
    rawPhysicalLayers,
    rawClassicalLayers,
    rawPhysicalIndepLayers,
    rawPhysicalCoupledLayers,
    directionFilterMode,
    useClassicalBoard,
    honmeiStar,
    getsuMeiStar,
    voidZodiacOverride,
    birthDate,
    physicalYearBoard,
    physicalMonthBoard,
    physicalDayBoard,
    physicalMonthIndepBoard,
    physicalMonthCoupledBoard,
    classicalYearBoard,
    classicalMonthBoard,
    classicalDayBoard,
  ]);

  const layers = filteredLayers.layers;
  const physicalLayers = filteredLayers.physicalLayers;
  const classicalLayers = filteredLayers.classicalLayers;
  const physicalIndepLayers = filteredLayers.physicalIndepLayers;
  const physicalCoupledLayers = filteredLayers.physicalCoupledLayers;

  const activeVectors = React.useMemo<Partial<Record<Direction, string>>>(() => {
    let av: Partial<Record<Direction, string>> = layers?.finalVectors || {};
    if (activeLayerMode === "year") av = layers?.yearLayer || {};
    else if (activeLayerMode === "month") av = layers?.monthLayer || {};
    else if (activeLayerMode === "day") av = layers?.dayLayer || {};
    return av;
  }, [layers, activeLayerMode]);

  // getStatusScore は home/ScorecardPanel と共用になったので
  // lib/scoreTier へ移した（判定ステータス → 0〜100 の点）。

  /**
   * 30 日ぶんの予報・ヒートマップを組み立てる基準日（その日の正午）。
   *
   * baseTime は時計として 60 秒ごとに差し替わる。これをそのまま予報の
   * 依存に置くと、**日付が変わっていないのに 1 分ごとに 30 日ぶんを
   * 作り直す。**実測（この環境）で
   *
   *   scorecard30DaysForecast          79ms
   *   scorecard30DaysForecastAllModels 97ms
   *
   * の計 176ms が毎分メインスレッドを止めていた。地図の操作が引っかかる
   * のはこれが大きい（手元より遅い端末では数倍になる）。
   *
   * 正午に寄せるのは、**地図と同じ時刻で評価する**ため。地図と
   * ヒートマップは directionBoardInstant でその日の正午を使っている。
   * 予報だけ「今この瞬間」で評価していたので、節入りが日中に来る日は
   * 地図と予報で盤が食い違っていた（2026 年は 12 回。__tests__ に実例を
   * 固定してある）。
   *
   * 正午は日付の境目を跨がないので、見出しの日付は変わらない。
   */
  const forecastAnchorMs = useMemo(
    () => (baseTime ? toForecastAnchorMs(baseTime) : null),
    [baseTime],
  );

  const scorecard30DaysForecast = React.useMemo(() => {
    if (forecastAnchorMs === null || !honmeiStar) return null;
    const anchor = new Date(forecastAnchorMs);
    const dirs: ScorecardDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const voidZodiacArray = voidZodiacOverride
      ? voidZodiacOverride.split("")
      : getPersonalVoidZodiac(parseSafeDate(birthDate));

    const result: Record<
      Direction,
      {
        luckyDays: number;
        dates: { dateStr: string; status: string; score: number }[];
      }
    > = {
      N: { luckyDays: 0, dates: [] },
      NE: { luckyDays: 0, dates: [] },
      E: { luckyDays: 0, dates: [] },
      SE: { luckyDays: 0, dates: [] },
      S: { luckyDays: 0, dates: [] },
      SW: { luckyDays: 0, dates: [] },
      W: { luckyDays: 0, dates: [] },
      NW: { luckyDays: 0, dates: [] },
      CENTER: { luckyDays: 0, dates: [] },
    };

    for (let i = 0; i < 30; i++) {
      const testDateLocal = new Date(forecastAnchorMs + i * 86400000);
      // 地図と同じ関数で評価時刻を出す。別々に組み立てていたせいで、
      // 節入りが日中に来る日は地図と予報で月盤が食い違っていた。
      const testDate = directionBoardInstant(anchor, 0, lon || 139.6917, i);
      const testEnv = getCurrentEnvironmentalFrequencies(
        testDate,
        lon || 139.6917,
        physicalMonthMode,
      );
      const yB = generateBoard(
        useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar,
      );
      const mB = generateBoard(
        useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar,
      );
      const dB = generateBoard(
        useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar,
      );

      const vectorData = calculateVectorCollision(
        useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
        yB,
        mB,
        dB,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
        useClassicalBoard ? "traditional" : "physical",
      );

      const filteredV = filterVectors(
        vectorData,
        useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        yB,
        mB,
        dB,
        directionFilterMode,
        useClassicalBoard ? getsuMeiStar : null,
        activeLayerMode,
      );

      dirs.forEach((dir) => {
        const status = filteredV[dir] || "SAFE";
        const isLucky =
          status === "SAFE" ||
          status === "OPTIMAL" ||
          status === "OPTIMAL_REGULAR";
        const score = getStatusScore(status);

        if (isLucky) {
          result[dir].luckyDays += 1;
        }
        result[dir].dates.push({
          dateStr: toJapanDateString(testDateLocal),
          status,
          score,
        });
      });
    }
    return result;
  }, [
    // 時計の毎分更新で作り直さないよう、日単位に丸めた基準日を使う
    forecastAnchorMs,
    honmeiStar,
    voidZodiacOverride,
    birthDate,
    lon,
    useClassicalBoard,
    getsuMeiStar,
    directionFilterMode,
    activeLayerMode,
    physicalMonthMode,
  ]);

  const scorecard30DaysForecastAllModels = React.useMemo(() => {
    if (forecastAnchorMs === null || !honmeiStar) return null;
    const anchor = new Date(forecastAnchorMs);
    const dirs: ScorecardDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const voidZodiacArray = voidZodiacOverride
      ? voidZodiacOverride.split("")
      : getPersonalVoidZodiac(parseSafeDate(birthDate));

    // APIデータからアストロボーナスを抽出してマップ化する
    const astroBonusMap: Record<Direction, number> = {
      N: 0,
      NE: 0,
      E: 0,
      SE: 0,
      S: 0,
      SW: 0,
      W: 0,
      NW: 0,
      CENTER: 0,
    };
    if (wealthData && wealthData.length > 0) {
      dirs.forEach((dir) => {
        const item = wealthData.find(
          // 突き合わせも真北。API 側が真北で判定するようになった（#382）ので、
          // magneticDirection と突き合わせると別の方位の枠に入る。
          (w) => w.direction === dir,
        );
        if (item && item.astrologyStatus) {
          let bonus = 0;
          if (
            item.astrologyStatus.includes("JUPITER_ASC") ||
            item.astrologyStatus.includes("JUPITER_MC")
          )
            bonus += 30;
          if (
            item.astrologyStatus.includes("VENUS_ASC") ||
            item.astrologyStatus.includes("VENUS_MC")
          )
            bonus += 15;
          astroBonusMap[dir] = bonus;
        }
      });
    }

    const result: ScorecardDayForecastEntry[] = [];

    for (let i = 0; i < 30; i++) {
      const testDateLocal = new Date(forecastAnchorMs + i * 86400000);
      /*
        暦は**日本時間で**引く（#456・#458 と同じ直し方）。前は
        Solar.fromDate で、ブラウザの時間帯で年月日を読んでいた。
        国内の利用者（JST）には差が出ないが、海外から開くと、この
        30 日予報の天中殺だけがブラウザの日付で判定され、同じ画面の
        ヒートマップ（getCurrentZodiac 経由 = 日本時間固定）と
        食い違っていた。判定は日本時間に揃える。
      */
      const jstFields = getZonedDateTimeFields(testDateLocal, 9);
      const testSolar = Solar.fromYmdHms(
        jstFields.year,
        jstFields.month,
        jstFields.day,
        jstFields.hours,
        jstFields.minutes,
        jstFields.seconds,
      );
      const testLunar = testSolar.getLunar();

      const testDate = directionBoardInstant(anchor, 0, lon || 139.6917, i);
      const testEnv = getCurrentEnvironmentalFrequencies(
        testDate,
        lon || 139.6917,
        physicalMonthMode,
      );

      // 天中殺ペナルティの計算
      const testYearZodiac = testLunar.getYearZhi();
      const testMonthZodiac = testLunar.getMonthZhi();
      const testDayZodiac = testLunar.getDayZhi();
      const isVoidDay =
        voidZodiacArray.includes(testYearZodiac) ||
        voidZodiacArray.includes(testMonthZodiac) ||
        voidZodiacArray.includes(testDayZodiac);
      const voidPenalty = isVoidDay ? -100 : 0;

      // 月相補正の計算
      const lp = calculateLunarPhaseCondition(testDate, "MIGRATION");
      const lunarPhaseScore = lp.scoreModifier;

      // 1. Classical Model
      const yB_class = generateBoard(testEnv.classicalYearStar);
      const mB_class = generateBoard(testEnv.classicalMonthStar);
      const dB_class = generateBoard(testEnv.classicalDayStar);
      const vec_class = calculateVectorCollision(
        honmeiStar.classical,
        yB_class,
        mB_class,
        dB_class,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        getsuMeiStar || undefined,
        "traditional",
      );
      const filtered_class = filterVectors(
        vec_class,
        honmeiStar.classical,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        yB_class,
        mB_class,
        dB_class,
        directionFilterMode,
        getsuMeiStar,
        activeLayerMode,
      );
      const doyou_class = vec_class.doyouState?.isDoyouHazard ? -30 : 0;
      const timeGate_class =
        doyou_class + (lunarPhaseModifier ? lunarPhaseScore : 0);

      // 2. Physical Independent Model
      const yB_indep = generateBoard(testEnv.yearStar);
      const mB_indep = generateBoard(testEnv.monthStar);
      const dB_indep = generateBoard(testEnv.dayStar);
      const vec_indep = calculateVectorCollision(
        honmeiStar.physical,
        yB_indep,
        mB_indep,
        dB_indep,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        undefined,
        "physical",
      );
      const filtered_indep = filterVectors(
        vec_indep,
        honmeiStar.physical,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        yB_indep,
        mB_indep,
        dB_indep,
        directionFilterMode,
        null,
        activeLayerMode,
      );
      const doyou_indep = vec_indep.doyouState?.isDoyouHazard ? -30 : 0;
      const timeGate_indep =
        voidPenalty + doyou_indep + (lunarPhaseModifier ? lunarPhaseScore : 0);

      // 3. Physical Coupled Model
      const pMonthStarCoupled = getPhysicalMonthStar(testDate, "coupled");
      const yB_coupled = generateBoard(testEnv.yearStar);
      const mB_coupled = generateBoard(pMonthStarCoupled);
      const dB_coupled = generateBoard(testEnv.dayStar);
      const vec_coupled = calculateVectorCollision(
        honmeiStar.physical,
        yB_coupled,
        mB_coupled,
        dB_coupled,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        undefined,
        "physical",
      );
      const filtered_coupled = filterVectors(
        vec_coupled,
        honmeiStar.physical,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        yB_coupled,
        mB_coupled,
        dB_coupled,
        directionFilterMode,
        null,
        activeLayerMode,
      );
      const doyou_coupled = vec_coupled.doyouState?.isDoyouHazard ? -30 : 0;
      const timeGate_coupled =
        voidPenalty +
        doyou_coupled +
        (lunarPhaseModifier ? lunarPhaseScore : 0);

      const dayModelData: (typeof result)[number] = {
        dateStr: toJapanDateString(testDateLocal),
        weekday: testDateLocal.getDay(),
        models: {
          classical: emptyScorecardDirectionCells(),
          physicalIndep: emptyScorecardDirectionCells(),
          physicalCoupled: emptyScorecardDirectionCells(),
        },
      };

      dirs.forEach((dir) => {
        const status_class = filtered_class[dir] || "SAFE";
        const kigaku_class = getStatusScore(status_class);
        const score_class = Math.max(
          0,
          Math.min(100, kigaku_class + timeGate_class),
        );
        dayModelData.models.classical[dir] = {
          status: status_class,
          score: score_class,
          kigakuScore: kigaku_class,
          astroBonus: 0,
          timeGateModifier: timeGate_class,
        };

        const status_indep = filtered_indep[dir] || "SAFE";
        const kigaku_indep = getStatusScore(status_indep);
        const astro_indep = astroBonusMap[dir];
        const score_indep = Math.max(
          0,
          Math.min(100, kigaku_indep + astro_indep + timeGate_indep),
        );
        dayModelData.models.physicalIndep[dir] = {
          status: status_indep,
          score: score_indep,
          kigakuScore: kigaku_indep,
          astroBonus: astro_indep,
          timeGateModifier: timeGate_indep,
        };

        const status_coupled = filtered_coupled[dir] || "SAFE";
        const kigaku_coupled = getStatusScore(status_coupled);
        const astro_coupled = astroBonusMap[dir];
        const score_coupled = Math.max(
          0,
          Math.min(100, kigaku_coupled + astro_coupled + timeGate_coupled),
        );
        dayModelData.models.physicalCoupled[dir] = {
          status: status_coupled,
          score: score_coupled,
          kigakuScore: kigaku_coupled,
          astroBonus: astro_coupled,
          timeGateModifier: timeGate_coupled,
        };
      });

      result.push(dayModelData);
    }

    return result;
  }, [
    // 時計の毎分更新で作り直さないよう、日単位に丸めた基準日を使う
    forecastAnchorMs,
    honmeiStar,
    voidZodiacOverride,
    birthDate,
    lon,
    getsuMeiStar,
    directionFilterMode,
    activeLayerMode,
    physicalMonthMode,
    wealthData,
    lunarPhaseModifier,
  ]);

  const scorecardHonmeiStarsForecast = React.useMemo(() => {
    if (!baseTime) return null;
    const dirs: ScorecardDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const targetDateLocal = baseTime
      ? new Date(baseTime.getTime() + timeOffsetDays * 86400000)
      : new Date();
    const testDateSolar = calculateSolarTime(targetDateLocal, lon || 139.6917);
    const testDate = testDateSolar.solarTime;
    const testEnv = getCurrentEnvironmentalFrequencies(
      testDate,
      lon || 139.6917,
      physicalMonthMode,
    );

    const honmeiStarIds: StarFrequency[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const dummyVoidZodiac: string[] = [];

    // APIデータからアストロボーナスを抽出してマップ化する
    const astroBonusMap: Record<Direction, number> = {
      N: 0,
      NE: 0,
      E: 0,
      SE: 0,
      S: 0,
      SW: 0,
      W: 0,
      NW: 0,
      CENTER: 0,
    };
    if (wealthData && wealthData.length > 0) {
      dirs.forEach((dir) => {
        const item = wealthData.find(
          // 突き合わせも真北。API 側が真北で判定するようになった（#382）ので、
          // magneticDirection と突き合わせると別の方位の枠に入る。
          (w) => w.direction === dir,
        );
        if (item && item.astrologyStatus) {
          let bonus = 0;
          if (
            item.astrologyStatus.includes("JUPITER_ASC") ||
            item.astrologyStatus.includes("JUPITER_MC")
          )
            bonus += 30;
          if (
            item.astrologyStatus.includes("VENUS_ASC") ||
            item.astrologyStatus.includes("VENUS_MC")
          )
            bonus += 15;
          astroBonusMap[dir] = bonus;
        }
      });
    }

    const result: ScorecardStarForecastEntry[] = [];

    const doyou_today = checkIsDoyouHazard(testDate) ? -30 : 0;
    const lp_today = calculateLunarPhaseCondition(testDate, "MIGRATION");
    const lunarPhase_today = lp_today.scoreModifier;
    const timeGate_today =
      doyou_today + (lunarPhaseModifier ? lunarPhase_today : 0);

    honmeiStarIds.forEach((star) => {
      // 1. Classical Model
      const yB_class = generateBoard(testEnv.classicalYearStar);
      const mB_class = generateBoard(testEnv.classicalMonthStar);
      const dB_class = generateBoard(testEnv.classicalDayStar);
      const vec_class = calculateVectorCollision(
        star,
        yB_class,
        mB_class,
        dB_class,
        dummyVoidZodiac,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        undefined,
        "traditional",
      );
      const filtered_class = filterVectors(
        vec_class,
        star,
        dummyVoidZodiac,
        testEnv.raw.lunarNode,
        yB_class,
        mB_class,
        dB_class,
        directionFilterMode,
        null,
        activeLayerMode,
      );

      // 2. Physical Independent Model
      const yB_indep = generateBoard(testEnv.yearStar);
      const mB_indep = generateBoard(testEnv.monthStar);
      const dB_indep = generateBoard(testEnv.dayStar);
      const vec_indep = calculateVectorCollision(
        star,
        yB_indep,
        mB_indep,
        dB_indep,
        dummyVoidZodiac,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        undefined,
        "physical",
      );
      const filtered_indep = filterVectors(
        vec_indep,
        star,
        dummyVoidZodiac,
        testEnv.raw.lunarNode,
        yB_indep,
        mB_indep,
        dB_indep,
        directionFilterMode,
        null,
        activeLayerMode,
      );

      // 3. Physical Coupled Model
      const pMonthStarCoupled = getPhysicalMonthStar(testDate, "coupled");
      const yB_coupled = generateBoard(testEnv.yearStar);
      const mB_coupled = generateBoard(pMonthStarCoupled);
      const dB_coupled = generateBoard(testEnv.dayStar);
      const vec_coupled = calculateVectorCollision(
        star,
        yB_coupled,
        mB_coupled,
        dB_coupled,
        dummyVoidZodiac,
        testEnv.raw.lunarNode,
        "MIGRATION",
        testDate,
        lon || 139.6917,
        undefined,
        "physical",
      );
      const filtered_coupled = filterVectors(
        vec_coupled,
        star,
        dummyVoidZodiac,
        testEnv.raw.lunarNode,
        yB_coupled,
        mB_coupled,
        dB_coupled,
        directionFilterMode,
        null,
        activeLayerMode,
      );

      const starData: (typeof result)[number] = {
        star,
        label: `${star} (${["一白水星", "二黒土星", "三碧木星", "四緑木星", "五黄土星", "六白金星", "七赤金星", "八白土星", "九紫火星"][star - 1]})`,
        models: {
          classical: emptyScorecardDirectionCells(),
          physicalIndep: emptyScorecardDirectionCells(),
          physicalCoupled: emptyScorecardDirectionCells(),
        },
      };

      dirs.forEach((dir) => {
        const status_class = filtered_class[dir] || "SAFE";
        const kigaku_class = getStatusScore(status_class);
        const score_class = Math.max(
          0,
          Math.min(100, kigaku_class + timeGate_today),
        );
        starData.models.classical[dir] = {
          status: status_class,
          score: score_class,
          kigakuScore: kigaku_class,
          astroBonus: 0,
          timeGateModifier: timeGate_today,
        };

        const status_indep = filtered_indep[dir] || "SAFE";
        const kigaku_indep = getStatusScore(status_indep);
        const astro_indep = astroBonusMap[dir];
        const score_indep = Math.max(
          0,
          Math.min(100, kigaku_indep + astro_indep + timeGate_today),
        );
        starData.models.physicalIndep[dir] = {
          status: status_indep,
          score: score_indep,
          kigakuScore: kigaku_indep,
          astroBonus: astro_indep,
          timeGateModifier: timeGate_today,
        };

        const status_coupled = filtered_coupled[dir] || "SAFE";
        const kigaku_coupled = getStatusScore(status_coupled);
        const astro_coupled = astroBonusMap[dir];
        const score_coupled = Math.max(
          0,
          Math.min(100, kigaku_coupled + astro_coupled + timeGate_today),
        );
        starData.models.physicalCoupled[dir] = {
          status: status_coupled,
          score: score_coupled,
          kigakuScore: kigaku_coupled,
          astroBonus: astro_coupled,
          timeGateModifier: timeGate_today,
        };
      });

      result.push(starData);
    });

    return result;
  }, [
    baseTime,
    timeOffsetDays,
    lon,
    directionFilterMode,
    activeLayerMode,
    physicalMonthMode,
    wealthData,
    lunarPhaseModifier,
  ]);

  const scorecardSummary = React.useMemo(() => {
    const dirs: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const dirMapJa: Record<Direction, string> = {
      N: "北",
      NE: "北東",
      E: "東",
      SE: "南東",
      S: "南",
      SW: "南西",
      W: "西",
      NW: "北西",
      CENTER: "中央",
    };

    return dirs.map((dir) => {
      const status = activeVectors[dir] || "SAFE";
      const score = getStatusScore(status);
      const isNoise = status.startsWith("NOISE");
      const forecast = scorecard30DaysForecast?.[dir] || {
        luckyDays: 0,
        dates: [],
      };

      const areasForDir = wealthData.filter((item) => {
        // 真北で束ねる（上と同じ理由）。
        const itemDir = item.direction;
        return itemDir === dir;
      });
      const topAreas = [...areasForDir].sort(
        (a, b) => (b.incomePerCapita || 0) - (a.incomePerCapita || 0),
      );
      const topArea = topAreas[0] || null;

      const rentalsForDir = propertiesData.filter((item) => {
        // 真北で束ねる（上と同じ理由）。
        const itemDir = item.direction;
        return itemDir === dir;
      });
      // 総合スコアは廃止した（#304〜#308）。物件を方位で探す画面と同じく
      // 家賃の安い順にする。ここは方位ごとの代表を 1 件出すだけ。
      const topRentals = [...rentalsForDir].sort(
        (a, b) => (a.totalRent || 0) - (b.totalRent || 0),
      );
      const topRental = topRentals[0] || null;

      // Comparative Model Calculations
      const classicalStatus = classicalLayers?.finalVectors[dir] || "SAFE";
      const classicalScore = getStatusScore(classicalStatus);

      const physicalIndepStatus =
        physicalIndepLayers?.finalVectors[dir] || "SAFE";
      const physicalIndepScore = getStatusScore(physicalIndepStatus);

      const physicalCoupledStatus =
        physicalCoupledLayers?.finalVectors[dir] || "SAFE";
      const physicalCoupledScore = getStatusScore(physicalCoupledStatus);

      // Consensus / Divergence Highlights
      const isClassicalHigh = !classicalStatus.startsWith("NOISE");
      const isPhysicalIndepHigh = !physicalIndepStatus.startsWith("NOISE");
      const isPhysicalCoupledHigh = !physicalCoupledStatus.startsWith("NOISE");

      const isConsensusClear =
        isClassicalHigh && isPhysicalIndepHigh && isPhysicalCoupledHigh;

      const hasHigh =
        isClassicalHigh || isPhysicalIndepHigh || isPhysicalCoupledHigh;
      const hasLow =
        !isClassicalHigh || !isPhysicalIndepHigh || !isPhysicalCoupledHigh;
      const isDivergenceAlert = hasHigh && hasLow;

      return {
        direction: dir,
        labelJa: dirMapJa[dir],
        status,
        score,
        isNoise,
        luckyDays: forecast.luckyDays,
        dates: forecast.dates,
        topArea,
        topAreas: topAreas.slice(0, 5),
        topRental,
        topRentals: topRentals.slice(0, 5),

        // Extended comparative fields
        classicalStatus,
        classicalScore,
        physicalIndepStatus,
        physicalIndepScore,
        physicalCoupledStatus,
        physicalCoupledScore,
        isConsensusClear,
        isDivergenceAlert,
      };
    });
  }, [
    activeVectors,
    scorecard30DaysForecast,
    wealthData,
    propertiesData,
    classicalLayers,
    physicalIndepLayers,
    physicalCoupledLayers,
  ]);

  // parseBreakdown / getCellBgColor / getDimensionCellBgColor は
  // 「総合スコア」タブと一緒に home/ScorecardPanel へ移した。

  const handleExportGridCsv = () => {
    if (scorecardActiveGridTab === "dates") {
      if (!scorecard30DaysForecastAllModels) return;
      const headers = [
        "日付",
        "曜日",
        "方位",
        "合意判定",
        "古典_総合スコア",
        "古典_判定ステータス",
        "古典_気学スコア",
        "古典_時間ゲート調整",
        "物理独立_総合スコア",
        "物理独立_判定ステータス",
        "物理独立_気学スコア",
        "物理独立_アストロボーナス",
        "物理独立_時間ゲート調整",
        "伝統連動_総合スコア",
        "伝統連動_判定ステータス",
        "伝統連動_気学スコア",
        "伝統連動_アストロボーナス",
        "伝統連動_時間ゲート調整",
      ];
      const rows: (string | number)[][] = [];
      const dirs: ScorecardDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

      scorecard30DaysForecastAllModels.forEach((day) => {
        dirs.forEach((dir) => {
          const classData = day.models.classical[dir];
          const indepData = day.models.physicalIndep[dir];
          const coupledData = day.models.physicalCoupled[dir];

          const isClassHigh = !classData.status.startsWith("NOISE");
          const isIndepHigh = !indepData.status.startsWith("NOISE");
          const isCoupledHigh = !coupledData.status.startsWith("NOISE");
          const isConsensusClear = isClassHigh && isIndepHigh && isCoupledHigh;
          const hasHigh = isClassHigh || isIndepHigh || isCoupledHigh;
          const hasLow = !isClassHigh || !isIndepHigh || !isCoupledHigh;
          const isDivergenceAlert = hasHigh && hasLow;

          let consensusLabel = "-";
          if (isConsensusClear) consensusLabel = "トリプル大吉 🌟";
          else if (isDivergenceAlert) consensusLabel = "位相差警告 ⚠️";

          rows.push([
            day.dateStr,
            weekdays[day.weekday],
            dir,
            consensusLabel,
            classData.score,
            classData.status,
            classData.kigakuScore,
            classData.timeGateModifier,
            indepData.score,
            indepData.status,
            indepData.kigakuScore,
            indepData.astroBonus,
            indepData.timeGateModifier,
            coupledData.score,
            coupledData.status,
            coupledData.kigakuScore,
            coupledData.astroBonus,
            coupledData.timeGateModifier,
          ]);
        });
      });

      const csvContent =
        "\uFEFF" +
        [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `30day_pattern_scorecard_${scorecardPrefecture}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (!scorecardHonmeiStarsForecast) return;
      const headers = [
        "本命星",
        "方位",
        "合意判定",
        "古典_総合スコア",
        "古典_判定ステータス",
        "古典_気学スコア",
        "古典_時間ゲート調整",
        "物理独立_総合スコア",
        "物理独立_判定ステータス",
        "物理独立_気学スコア",
        "物理独立_アストロボーナス",
        "物理独立_時間ゲート調整",
        "伝統連動_総合スコア",
        "伝統連動_判定ステータス",
        "伝統連動_気学スコア",
        "伝統連動_アストロボーナス",
        "伝統連動_時間ゲート調整",
      ];
      const rows: (string | number)[][] = [];
      const dirs: ScorecardDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

      scorecardHonmeiStarsForecast.forEach((star) => {
        dirs.forEach((dir) => {
          const classData = star.models.classical[dir];
          const indepData = star.models.physicalIndep[dir];
          const coupledData = star.models.physicalCoupled[dir];

          const isClassHigh = !classData.status.startsWith("NOISE");
          const isIndepHigh = !indepData.status.startsWith("NOISE");
          const isCoupledHigh = !coupledData.status.startsWith("NOISE");
          const isConsensusClear = isClassHigh && isIndepHigh && isCoupledHigh;
          const hasHigh = isClassHigh || isIndepHigh || isCoupledHigh;
          const hasLow = !isClassHigh || !isIndepHigh || !isCoupledHigh;
          const isDivergenceAlert = hasHigh && hasLow;

          let consensusLabel = "-";
          if (isConsensusClear) consensusLabel = "トリプル大吉 🌟";
          else if (isDivergenceAlert) consensusLabel = "位相差警告 ⚠️";

          rows.push([
            star.label.replace(/,/g, " "),
            dir,
            consensusLabel,
            classData.score,
            classData.status,
            classData.kigakuScore,
            classData.timeGateModifier,
            indepData.score,
            indepData.status,
            indepData.kigakuScore,
            indepData.astroBonus,
            indepData.timeGateModifier,
            coupledData.score,
            coupledData.status,
            coupledData.kigakuScore,
            coupledData.astroBonus,
            coupledData.timeGateModifier,
          ]);
        });
      });

      const csvContent =
        "\uFEFF" +
        [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `honmei_stars_scorecard_${scorecardPrefecture}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportForGemini = async () => {
    setIsExporting(true);
    try {
      const queryParams = new URLSearchParams({
        birth_date: birthDate || "",
        birth_lat: birthLat?.toString() || "",
        birth_lon: birthLon?.toString() || "",
        base_lat: lat?.toString() || "",
        base_lon: lon?.toString() || "",
        use_classical: useClassicalBoard.toString(),
        physical_month_mode: physicalMonthMode,
        use_true_north: useTrueNorth.toString(),
        layer_mode: activeLayerMode,
        direction_filter_mode: directionFilterMode,
        date: evalDate.toISOString(),
        action_intent: actionIntent,
        target_lat: targetLat?.toString() || "",
        target_lon: targetLon?.toString() || "",
        target_elevation: targetElevation?.toString() || "",
      });
      const res = await fetch(
        `/api/relocation/export?${queryParams.toString()}`,
      );
      if (!res.ok) throw new Error("エクスポートAPIエラー");
      const data = await res.json();

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `oracle_engine_gemini_export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadUnifiedDataset = async () => {
    setIsExporting(true);
    try {
      const queryParams = new URLSearchParams({
        birth_date: birthDate || "",
        birth_lat: birthLat?.toString() || "",
        birth_lon: birthLon?.toString() || "",
        base_lat: lat?.toString() || "",
        base_lon: lon?.toString() || "",
        use_classical: useClassicalBoard.toString(),
        physical_month_mode: physicalMonthMode,
        use_true_north: useTrueNorth.toString(),
        layer_mode: activeLayerMode,
        direction_filter_mode: directionFilterMode,
        date: evalDate.toISOString(),
        action_intent: actionIntent,
        target_lat: targetLat?.toString() || "",
        target_lon: targetLon?.toString() || "",
        target_elevation: targetElevation?.toString() || "",
      });
      const res = await fetch(
        `/api/relocation/export?${queryParams.toString()}`,
      );
      if (!res.ok) throw new Error("エクスポートAPIエラー");
      const apiData = await res.json();


      const unifiedPayload = {
        ...apiData,
        exportedAt: new Date().toISOString(),
        realtimeBiometrics: {
          hrv,
          gsr,
          ansLoad,
          shieldCapacity,
          zScoreHRV,
          hardwareDisplacementPenalty,
          circadianMultiplier,
          baselines: {
            hrvMean: baselineHrvMean,
            hrvStd: baselineHrvStd,
            gsrMean: baselineGsrMean,
            gsrStd: baselineGsrStd,
          },
        },
        realtimeGeomagnetism: geoData,
        realtimeSpaceWeather: spaceWeather,
        voidTimeDiagnostics: {
          kimon,
          currentZodiac,
          isPersonalVoid,
          isYearVoid,
          isMonthVoid,
          isDayVoid,
          isGlobalVoid,
        },
        prompt_suggestion: `あなたは超科学・生体磁気学・東洋占星術（九星気学、四柱推命）を融合したメタフィジカル意思決定のアドバイザーです。
以下のJSONデータをもとに、目標日（${evalDate.toLocaleDateString()}）の判定、および現在時刻の生体磁気状態や将来のバイオリズムを総合的に解釈し、行動方針のアドバイスを日本語で論理的に解説してください。
特に、生体センサーデータ（HRV、GSR、ANS Overload）と環境磁場、九星の衝突配置、マルチインテントマトリクス（DEFAULT, MIGRATION, BUSINESS, RESTの差）、天中殺やドラゴニックノードの干渉などを関連付けて説明し、実用的なアドバイスを提供してください。`,
      };

      const jsonStr = JSON.stringify(unifiedPayload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = toJapanDateString(evalDate);
      link.download = `metaphysical_unified_master_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(`エクスポートに失敗しました: ${toUserMessage(e)}`);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    // 基準日は予報と共通（forecastAnchorMs）。ここに 2 つ目の丸めを
    // 置かない。同じ「その日の正午」を 2 か所で作っていた。
    if (
      heatmapMode === "none" ||
      forecastAnchorMs === null ||
      !honmeiStar ||
      !env
    )
      return;
    const baseTime = new Date(forecastAnchorMs);

    const data = [];
    const voidZodiacArray = voidZodiacOverride
      ? voidZodiacOverride.split("")
      : getPersonalVoidZodiac(parseSafeDate(birthDate));

    if (heatmapMode === "30days") {
      for (let i = 0; i < 30; i++) {
        // 地図側とまったく同じ関数で評価時刻を出す。
        // 別々に組み立てていたせいで、同じ日でも地図とヒートマップで
        // 判定が食い違っていた。
        const testDate = directionBoardInstant(
          baseTime,
          timeOffsetDays,
          lon || 139.6917,
          i,
        );
        const testEnv = getCurrentEnvironmentalFrequencies(
          testDate,
          lon || 139.6917,
          physicalMonthMode,
        );
        const yB = generateBoard(
          useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar,
        );
        const mB = generateBoard(
          useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar,
        );
        const dB = generateBoard(
          useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar,
        );

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB,
          mB,
          dB,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          actionIntent,
          testDate,
          lon || 139.6917,
          useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
          useClassicalBoard ? "traditional" : "physical",
        );

        const filteredV = filterVectors(
          vectorData,
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          yB,
          mB,
          dB,
          directionFilterMode,
          useClassicalBoard ? getsuMeiStar : null,
          activeLayerMode,
        );

        data.push({
          label: `${testDate.getMonth() + 1}/${testDate.getDate()}`,
          vectors: filteredV,
          rawVectorData: vectorData,
          tendoDir: vectorData.tendoDirection,
          // 同じ引数の getCurrentZodiac を some の中で 3 回呼んでいた。
          // voidZodiacArray の要素数ぶん繰り返されるので、実測で 30 日分の
          // 構築が 89ms → 45ms になる。1 日 1 回に減らす。
          isVoid: (() => {
            const z = getCurrentZodiac(
              testDate,
              lon || 139.6917,
              zodiacTimeBasis,
            );
            const zodiacs = [z.yearZodiac, z.monthZodiac, z.dayZodiac];
            return voidZodiacArray.some((v) => zodiacs.includes(v));
          })(),
          offsetDays: timeOffsetDays + i,
        });
      }
    } else if (heatmapMode === "12months") {
      // 九星気学の月は暦の 1 日ではなく節入りで替わる。以前は「その暦月の
      // 15 日」を代表点にしていたため、節入り前の日に見ると、地図は前の節月
      // なのにヒートマップの先頭列は次の節月、という別々の盤を並べていた。
      // 実測（2026-08-07・立秋当日）で 8 方位中 5 方位が食い違っていた。
      // 節月そのもので刻む。
      const anchorBase = calculateSolarTime(
        new Date(baseTime.getTime() + timeOffsetDays * 86400000),
        lon || 139.6917,
      ).solarTime;
      for (let i = 0; i < 12; i++) {
        // 節月の平均は約 30.44 日。中ほどから進めて、その都度その節月の
        // 中ほどへ寄せ直すので、月の長短でずれない。
        const testDate = solarTermMonthAnchor(
          new Date(
            solarTermMonthAnchor(anchorBase).getTime() + i * 30.44 * 86400000,
          ),
        );
        const testEnv = getCurrentEnvironmentalFrequencies(
          testDate,
          lon || 139.6917,
          physicalMonthMode,
        );
        const yB = generateBoard(
          useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar,
        );
        const mB = generateBoard(
          useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar,
        );
        const dB = generateBoard(
          useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar,
        );

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB,
          mB,
          dB,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          actionIntent,
          testDate,
          lon || 139.6917,
          useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
          useClassicalBoard ? "traditional" : "physical",
          // 12 ヶ月表示は「その月の傾向」なので日盤を外す。判定そのものは
          // エンジンに任せる（以前はここで finalVectors を組み直しており、
          // 天道の上書きが失われて、地図が「大吉」の方位を「個人不調」と
          // 出していた）。
          true,
        );

        const filteredV = filterVectors(
          vectorData,
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          yB,
          mB,
          dB,
          directionFilterMode,
          useClassicalBoard ? getsuMeiStar : null,
          activeLayerMode === "day" ? "month" : activeLayerMode,
        );

        const diffDays = Math.round(
          (testDate.getTime() - baseTime.getTime()) / 86400000,
        );
        data.push({
          label: `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, "0")}`,
          vectors: filteredV,
          rawVectorData: vectorData,
          tendoDir: vectorData.tendoDirection,
          isVoid: (() => {
            const z = getCurrentZodiac(
              testDate,
              lon || 139.6917,
              zodiacTimeBasis,
            );
            const zodiacs = [z.yearZodiac, z.monthZodiac];
            return voidZodiacArray.some((v) => zodiacs.includes(v));
          })(),
          offsetDays: diffDays,
        });
      }
    }
    setHeatmapData(data);
  }, [
    heatmapMode,
    // 時計の毎分更新で作り直さないよう、日単位に丸めた基準日を使う
    forecastAnchorMs,
    timeOffsetDays,
    honmeiStar,
    getsuMeiStar,
    actionIntent,
    useClassicalBoard,
    voidZodiacOverride,
    birthDate,
    env,
    directionFilterMode,
    activeLayerMode,
    physicalMonthMode,
    lon,
    // 時刻基準を切り替えたら作り直す。入れないと切り替えが反映されない。
    zodiacTimeBasis,
  ]);

  const exportMasterTelemetry = () => {
    const timestampStr = new Date().getTime();
    const header = [
      "Timestamp",
      "Base_Lat",
      "Base_Lon",
      "Birth_Date",
      "Birth_Lat",
      "Birth_Lon",
      "Honmei_Phys",
      "Honmei_Class",
      "Birth_Year_Star",
      "Birth_Month_Star",
      "Birth_Day_Star",
      "Birth_Jupiter_Lon",
      "Birth_Lunar_Lon",
      "Birth_Solar_Lon",
      "Current_Time",
      "Current_Year_Star",
      "Current_Month_Star",
      "Current_Day_Star",
      "Current_Jupiter_Lon",
      "Current_Lunar_Lon",
      "Current_Solar_Lon",
      "Space_Kp_Index",
      "Space_Xray_Flux",
      "Geo_Magnetic_F",
      "Geo_Magnetic_D",
      "Geo_Magnetic_I",
      "Bio_HRV",
      "Bio_GSR",
      "Bio_ANS_Load",
      "Bio_Shield_Capacity",
      "Timing_Target_Date",
      "Timing_Psychology",
      "Timing_Kigaku",
      "Timing_Astrology",
      "Phys_N",
      "Phys_NE",
      "Phys_E",
      "Phys_SE",
      "Phys_S",
      "Phys_SW",
      "Phys_W",
      "Phys_NW",
      "Class_N",
      "Class_NE",
      "Class_E",
      "Class_SE",
      "Class_S",
      "Class_SW",
      "Class_W",
      "Class_NW",
      "PhysIndep_N",
      "PhysIndep_NE",
      "PhysIndep_E",
      "PhysIndep_SE",
      "PhysIndep_S",
      "PhysIndep_SW",
      "PhysIndep_W",
      "PhysIndep_NW",
      "PhysCoupled_N",
      "PhysCoupled_NE",
      "PhysCoupled_E",
      "PhysCoupled_SE",
      "PhysCoupled_S",
      "PhysCoupled_SW",
      "PhysCoupled_W",
      "PhysCoupled_NW",
      "NBA_Suggested_Action",
      "NBA_Expected_Reward",
      "NBA_Confidence",
      "Micro_Stress",
      "Micro_Resilience",
      "DS_Ephemeris_Source",
      "DS_Ephemeris_Detail",
      "DS_Astrology_Source",
      "DS_Astrology_Detail",
      "DS_RAG_Source",
      "DS_RAG_Detail",
      "NBA_EnvRisk",
      "NBA_SolarPhase",
      "Ephemeris_Sun",
      "Ephemeris_Moon",
      "Ephemeris_Jupiter",
      "Ephemeris_LunarNode",
      "Bazi_DayMaster",
      "Western_Aspects",
      "Vedic_Nakshatra",
      "Vedic_MoonProgress",
      "Vedic_SunNakshatra",
      "Vedic_SunProgress",
      "Vedic_Tithi",
      "Vedic_Ayanamsa",
      "IChing_HexNumber",
      "IChing_HexName",
      "IChing_RiskMod",
      "IChing_ConfBoost",
      "NBA_LogicTrace",
    ].join(",");

    const row = [
      new Date().toISOString(),
      lat,
      lon,
      birthDate,
      birthLat,
      birthLon,
      honmeiStar?.physical || "",
      honmeiStar?.classical || "",
      birthEnv?.yearStar || "",
      birthEnv?.monthStar || "",
      birthEnv?.dayStar || "",
      birthEnv?.raw?.jupiterLon?.toFixed(4) || "",
      birthEnv?.raw?.moonLon?.toFixed(4) || "",
      birthEnv?.raw?.sunLon?.toFixed(4) || "",
      ephemerisTime?.toISOString() || "",
      env?.yearStar || "",
      env?.monthStar || "",
      env?.dayStar || "",
      env?.raw?.jupiterLon?.toFixed(4) || "",
      env?.raw?.moonLon?.toFixed(4) || "",
      env?.raw?.sunLon?.toFixed(4) || "",
      spaceWeather?.kpIndex !== null ? spaceWeather?.kpIndex : "",
      spaceWeather?.xrayFlux !== null ? spaceWeather?.xrayFlux : "",
      geoData?.intensity || "",
      geoData?.declination || "",
      geoData?.inclination || "",
      hrv,
      gsr,
      ansLoad,
      shieldCapacity,
      toJapanDateString(evalDate), // Timing_Target_Date (YYYY-MM-DD)
      timingOptimization?.details.find((d) => d.name.includes("Psychology"))
        ?.phenomenon || "",
      timingOptimization?.details.find((d) => d.name.includes("Kigaku"))
        ?.phenomenon || "",
      timingOptimization?.details.find((d) => d.name.includes("Astrology"))
        ?.phenomenon || "",
      physicalLayers?.finalVectors?.N || "",
      physicalLayers?.finalVectors?.NE || "",
      physicalLayers?.finalVectors?.E || "",
      physicalLayers?.finalVectors?.SE || "",
      physicalLayers?.finalVectors?.S || "",
      physicalLayers?.finalVectors?.SW || "",
      physicalLayers?.finalVectors?.W || "",
      physicalLayers?.finalVectors?.NW || "",
      classicalLayers?.finalVectors?.N || "",
      classicalLayers?.finalVectors?.NE || "",
      classicalLayers?.finalVectors?.E || "",
      classicalLayers?.finalVectors?.SE || "",
      classicalLayers?.finalVectors?.S || "",
      classicalLayers?.finalVectors?.SW || "",
      classicalLayers?.finalVectors?.W || "",
      classicalLayers?.finalVectors?.NW || "",
      physicalIndepLayers?.finalVectors?.N || "",
      physicalIndepLayers?.finalVectors?.NE || "",
      physicalIndepLayers?.finalVectors?.E || "",
      physicalIndepLayers?.finalVectors?.SE || "",
      physicalIndepLayers?.finalVectors?.S || "",
      physicalIndepLayers?.finalVectors?.SW || "",
      physicalIndepLayers?.finalVectors?.W || "",
      physicalIndepLayers?.finalVectors?.NW || "",
      physicalCoupledLayers?.finalVectors?.N || "",
      physicalCoupledLayers?.finalVectors?.NE || "",
      physicalCoupledLayers?.finalVectors?.E || "",
      physicalCoupledLayers?.finalVectors?.SE || "",
      physicalCoupledLayers?.finalVectors?.S || "",
      physicalCoupledLayers?.finalVectors?.SW || "",
      physicalCoupledLayers?.finalVectors?.W || "",
      physicalCoupledLayers?.finalVectors?.NW || "",
      nbaData?.nba.actionResult.suggestedAction || "",
      nbaData?.nba.actionResult.expectedReward?.toFixed(4) || "",
      nbaData?.nba.actionResult.confidence?.toFixed(4) || "",
      nbaData?.micro.ansLoad || "",
      nbaData?.micro.shieldCapacity || "",
      nbaData?.nba.stateVector.ephemerisData?.source || "",
      /*
        _Detail の 3 列は中身がオブジェクトや配列。そのまま並べると
        `${v}` で "[object Object]" になり、列として読めなかった
        （型が any だったので tsc も止められなかった）。CSV の 1 セルに
        収まる形へ畳んでから出す。
      */
      formatCsvDetail(
        nbaData?.nba.stateVector.ephemerisData?.planetaryPositions,
      ),
      nbaData?.nba.stateVector.astrologyData?.source || "",
      formatCsvDetail(nbaData?.nba.stateVector.astrologyData?.transits),
      nbaData?.nba.stateVector.ragContext?.source || "",
      formatCsvDetail(nbaData?.nba.stateVector.ragContext?.classicalRules),
      nbaData?.nba.stateVector.environmentalRisk ?? "",
      nbaData?.nba.stateVector.solarPhase ?? "",
      nbaData?.macro.streams?.ephemeris?.sun ?? "",
      nbaData?.macro.streams?.ephemeris?.moon ?? "",
      nbaData?.macro.streams?.ephemeris?.jupiter ?? "",
      nbaData?.macro.streams?.ephemeris?.lunarNode ?? "",
      nbaData?.macro.streams?.personalBazi?.summary?.dayMaster ??
        nbaData?.macro.streams?.environmentalBazi?.summary?.dayMaster ??
        "",
      nbaData?.macro.streams?.westernAstrology?.aspects?.join(" | ") ?? "",
      nbaData?.macro.streams?.vedicAstrology?.nakshatra ?? "",
      nbaData?.macro.streams?.vedicAstrology?.moonProgress ?? "",
      nbaData?.macro.streams?.vedicAstrology?.sunNakshatra ?? "",
      nbaData?.macro.streams?.vedicAstrology?.sunProgress ?? "",
      nbaData?.macro.streams?.vedicAstrology?.tithi ?? "",
      nbaData?.macro.streams?.vedicAstrology?.ayanamsa ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.number ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.name ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.riskModifier ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.confidenceBoost ?? "",
      nbaData?.nba.actionResult.logicTrace?.join(" | ") ?? "",
    ]
      .map((v) => `"${v}"`)
      .join(","); // wrap fields in quotes to prevent comma breaks

    const csvContent = "\uFEFF" + header + "\n" + row;
    const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.setAttribute("href", csvUrl);
    link.setAttribute(
      "download",
      `metaphysical_unified_export_${timestampStr}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(csvUrl);

    // Export Unified JSON (Full State)
    const fullState = {
      timestamp: new Date().toISOString(),
      location: { lat, lon, targetLat, targetLon },
      personalProfile: {
        birthDate,
        birthLat,
        birthLon,
        honmeiStar,
        personalVoidZodiac,
      },
      biometrics: {
        hrv,
        gsr,
        ansLoad,
        shieldCapacity,
        zScoreHRV,
        hardwareDisplacementPenalty,
        circadianMultiplier,
      },
      baselines: {
        hrvMean: baselineHrvMean,
        hrvStd: baselineHrvStd,
        gsrMean: baselineGsrMean,
        gsrStd: baselineGsrStd,
      },
      geomagnetism: geoData,
      spaceWeather: spaceWeather,
      ephemeris: env,
      birthEphemeris: birthEnv,
      solarData: solarData,
      spatialVectors: {
        physical: physicalLayers,
        classical: classicalLayers,
        physicalIndependent: physicalIndepLayers,
        physicalCoupled: physicalCoupledLayers,
        activeModel: useClassicalBoard ? "classical" : "physical",
        activeLayerMode: activeLayerMode,
      },
      timingOptimization: timingOptimization,
      optimizerPreferences: {
        usePsychologyScorer,
        useKigakuScorer,
        useAstrologyScorer,
      },
      nbaEngine: nbaData,
      actionIntent,
      timeOffsetDays,
      targetEvaluation: {
        evalDate: evalDate.toISOString(),
        targetDirInfo,
        targetVectorStatus,
      },
      voidTimeDiagnostics: {
        kimon,
        currentZodiac,
        isPersonalVoid,
        isYearVoid,
        isMonthVoid,
        isDayVoid,
        isGlobalVoid,
      },
    };
    const jsonBlob = new Blob([JSON.stringify(fullState, null, 2)], {
      type: "application/json",
    });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement("a");
    jsonLink.setAttribute("href", jsonUrl);
    jsonLink.setAttribute(
      "download",
      `metaphysical_unified_state_${timestampStr}.json`,
    );
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);
  };

  /*
    「データベースに保存」は撤去した。名前と実態が合っておらず、
    直しても意味のある機能にならなかった。

      - **DB に入っていなかった。**保存先は /api/metaphysical-log で、
        process.cwd()/data/metaphysical_logs.jsonl への追記だった。
        Cloud Run のコンテナは使い捨てなので、**次の起動で消える。**
        Prisma の MetaphysicalStateLog には誰も書き込んでいなかった
        （管理画面の書き出しはこの表を読むので、常に空だった）
      - **認可が無かった。**誰でも POST できて、生年月日から出した本命星・
        座標・盤の全体を、そのまま行として書き足せた
      - **失敗しても「保存しました」と出ていた。**res.ok しか見ておらず、
        書き込みの成否は応答の中身に入っていなかった

    盤を残したいときは、隣の「テレメトリ書き出し」（CSV / JSON）が
    端末に落とすので、そちらで足りる。表（MetaphysicalStateLog）は
    残してある。消すと本番 DB への一方向の変更になるため、扱いは別途。
  */

  useEffect(() => {
    const now = new Date();
    setBaseTime(now);
    setEphemerisTime(now);

    const fastTimer = setInterval(() => setBaseTime(new Date()), 60000);
    const slowTimer = setInterval(() => setEphemerisTime(new Date()), 60000);

    return () => {
      clearInterval(fastTimer);
      clearInterval(slowTimer);
    };
  }, []);

  useEffect(() => {
    // NOAA を直接叩かず /api/space-weather を経由する。
    // fetchSpaceWeather の中の `next: { revalidate }` はサーバの fetch でしか
    // 効かないので、ブラウザから呼ぶと利用者ごとに毎回 3 本走っていた。
    fetch("/api/space-weather")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SpaceWeatherData | null) => {
        if (data) setSpaceWeather(data);
      })
      .catch(() => {
        // 取れなくても画面は動く（既定値で計算する）。元の実装も
        // 失敗時は null 揃いのオブジェクトを返すだけだった。
      });
  }, []);

  useEffect(() => {
    // 気圧（気象病モデルの入力）。判定に使うのは「いる場所」の気圧なので、
    // 目的地を選んでいればそちら、無ければ現在地で引く。
    const pLat = targetLat || lat;
    const pLon = targetLon || lon;
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return;

    let alive = true;
    fetch(`/api/surface-pressure?lat=${pLat}&lon=${pLon}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SurfacePressureData | null) => {
        if (!alive || !data) return;
        /*
          「数として使えるか」で見る。以前は `=== null` だけを見ていたが、
          応答の形が崩れて項目ごと無いとき（undefined）を素通りさせ、
          {current: undefined} を state に入れていた。読む側は
          .toFixed() を呼ぶので、その瞬間に画面ごと落ちる。
          2026-08-14 に本番を真っ白にしたのと同じ形（#320）。
          外から来る値は「無い」だけでなく「壊れている」ことがある。
        */
        const current = data.current;
        const drop = data.drop;
        if (typeof current !== "number" || !Number.isFinite(current) ||
            typeof drop !== "number" || !Number.isFinite(drop)) {
          // 取れていない。0 を入れて「変化なし」と見せない。
          setPressureData(null);
          setPressureDrop(0);
          return;
        }
        setPressureData({
          current,
          drop,
          timestamp: data.timestamp,
        });
        setPressureDrop(drop);
      })
      .catch(() => {
        // 宇宙天気と同じ。外部が落ちても画面は動かす。
      });
    return () => {
      alive = false;
    };
  }, [lat, lon, targetLat, targetLon]);

  useEffect(() => {
    // 物件ピンは「出す」と押した人にだけ取りに行く。一度取ったら使い回す。
    // ここは公開のホームなので、開いただけの人に 500 件を引かせない。
    if (!showProperties || mapProperties.length > 0 || propertiesLoading) {
      return;
    }
    let alive = true;
    setPropertiesLoading(true);
    setPropertiesError(null);
    fetch("/api/rentals/map?limit=500")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((rows) => {
        if (!alive) return;
        setMapProperties(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!alive) return;
        setPropertiesError(
          "物件を読み込めませんでした。もう一度押すと再取得します。",
        );
        setShowProperties(false);
      })
      .finally(() => {
        if (alive) setPropertiesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [showProperties, mapProperties.length, propertiesLoading]);

  useEffect(() => {
    if (baseTime && lon) {
      const targetTime = new Date(
        baseTime.getTime() + timeOffsetDays * 86400000,
      );
      setSolarData(calculateSolarTime(targetTime, targetLon || lon));
    }
  }, [baseTime, lon, timeOffsetDays, targetLon]);

  useEffect(() => {
    if (lat && lon) {
      const targetTime = baseTime
        ? baseTime.getTime() + timeOffsetDays * 86400000
        : new Date().getTime();
      getGeomagneticData(lat, lon, targetTime).then((data) => setGeoData(data));
    }
  }, [lat, lon, baseTime, timeOffsetDays]);

  useEffect(() => {
    if (baseSyncTimestamp) {
      const arrivedDate = new Date(baseSyncTimestamp);
      const targetDate = baseTime
        ? new Date(baseTime.getTime() + timeOffsetDays * 86400000)
        : new Date();
      const diffTime = targetDate.getTime() - arrivedDate.getTime();
      let diffDays = diffTime / (1000 * 3600 * 24);
      diffDays = Math.max(0, diffDays);
      setBaseSyncDays(Number(diffDays.toFixed(2)));
    }
  }, [baseSyncTimestamp, baseTime, timeOffsetDays]);

  useEffect(() => {
    if (!baseTime) return;

    let solarHours = 12.0;
    if (solarData?.solarTime) {
      solarHours =
        solarData.solarTime.getHours() + solarData.solarTime.getMinutes() / 60;
    }

    const LUNAR_MONTH = 29.530588853 * 24 * 60 * 60 * 1000;
    const KNOWN_NEW_MOON = 947182440000;
    const targetDate = new Date(baseTime.getTime() + timeOffsetDays * 86400000);
    const diffMs = targetDate.getTime() - KNOWN_NEW_MOON;
    let phase = (diffMs % LUNAR_MONTH) / LUNAR_MONTH;
    if (phase < 0) phase += 1;

    const metrics = calculateBioMetrics({
      currentHRV: hrv,
      currentGSR: gsr,
      baselineHRVMean: baselineHrvMean,
      baselineHRVStd: baselineHrvStd,
      baselineGSRMean: baselineGsrMean,
      baselineGSRStd: baselineGsrStd,
      birthLat: birthLat,
      birthLon: birthLon,
      currentLat: targetLat || lat,
      currentLon: targetLon || lon,
      elevation: targetElevation || 0,
      kpIndex: spaceWeather?.kpIndex || 2,
      solarTimeHours: solarHours,
      pressureDrop: pressureDrop,
      lunarPhase: phase,
      baseSyncDays: baseSyncDays,
    });

    setShieldCapacity(metrics.shieldCapacity);
    setAnsLoad(metrics.ansLoad);
    setZScoreHRV(metrics.zScoreHRV);
    setHardwareDisplacementPenalty(metrics.hardwareDisplacementPenalty);
    setCircadianMultiplier(metrics.circadianMultiplier);
  }, [
    hrv,
    gsr,
    baselineHrvMean,
    baselineHrvStd,
    baselineGsrMean,
    baselineGsrStd,
    baseSyncDays,
    spaceWeather,
    targetElevation,
    targetLat,
    targetLon,
    lat,
    lon,
    birthLat,
    birthLon,
    solarData,
    pressureDrop,
    baseTime,
    timeOffsetDays,
  ]);

  useEffect(() => {
    if (!baseTime) return;

    const targetDate = new Date(baseTime.getTime() + timeOffsetDays * 86400000);

    let timingActionType: "focus" | "creative" | "social" | "rest" = "focus";
    if (actionIntent === "REST") timingActionType = "rest";
    if (actionIntent === "BUSINESS") timingActionType = "social";

    const optimizer = createPersonalizedOptimizer({
      usePsychology: usePsychologyScorer,
      useEasternAstrology: useKigakuScorer,
      useWesternAstrology: useAstrologyScorer,
    });

    let userKigakuStar: number | undefined;
    const activeHonmeiStar = useClassicalBoard
      ? honmeiStar?.classical
      : honmeiStar?.physical;
    if (activeHonmeiStar) {
      if (typeof activeHonmeiStar === "number") {
        userKigakuStar = activeHonmeiStar;
      } else if (typeof activeHonmeiStar === "string") {
        const match = String(activeHonmeiStar).match(/([一二三四五六七八九])/);
        if (match) {
          const numMap: Record<string, number> = {
            一: 1,
            二: 2,
            三: 3,
            四: 4,
            五: 5,
            六: 6,
            七: 7,
            八: 8,
            九: 9,
          };
          userKigakuStar = numMap[match[1]];
        } else {
          const numMatch = String(activeHonmeiStar).match(/(\d)/);
          if (numMatch) userKigakuStar = parseInt(numMatch[1], 10);
        }
      }
    }

    const dirInfo = getTargetDirectionInfo();
    /*
      時期の最適化に渡す目的地の方位。**判定は必ず真北**なので、
      ここも trueDirection で固定する（#381 と同じ理由）。
      磁北を渡していたときは、同じ目的地でもホームの地図と時期の提案が
      別の方位を見ていることがあった。
    */
    const targetDirection = dirInfo
      ? (dirInfo.trueDirection as Direction)
      : undefined;

    const result = optimizer.evaluate({
      targetDate,
      userBirthDate: birthDate ? parseSafeDate(birthDate) : undefined,
      userKigakuStar,
      actionType: timingActionType,
      latitude: targetLat || lat,
      longitude: targetLon || lon,
      useClassical: useClassicalBoard,
      targetDirection,
      actionIntent,
    });

    setTimingOptimization(result);
  }, [
    baseTime,
    timeOffsetDays,
    actionIntent,
    usePsychologyScorer,
    useKigakuScorer,
    useAstrologyScorer,
    honmeiStar,
    birthDate,
    targetLat,
    lat,
    targetLon,
    lon,
    useClassicalBoard,
    useTrueNorth,
    getTargetDirectionInfo,
  ]);

  const basePersonalVoidZodiac = React.useMemo(() => {
    if (!birthDate) return [];
    const d = new Date(birthDate);
    if (isNaN(d.getTime())) return [];
    return getPersonalVoidZodiac(d);
  }, [birthDate]);

  const personalVoidZodiac = voidZodiacOverride
    ? voidZodiacOverride.split("")
    : basePersonalVoidZodiac;
  const kimon = solarData ? getKimonHour(solarData.solarTime) : null;
  const isPersonalVoid = kimon
    ? personalVoidZodiac.includes(kimon.japanese)
    : false;

  const targetDirInfo = getTargetDirectionInfo();
  let targetVectorStatus: string | null = null;

  if (targetDirInfo && activeVectors) {
    // 判定は真北。磁北の方位は「方位磁針で測るとずれる」注意にだけ使う。
    targetVectorStatus =
      activeVectors[targetDirInfo.trueDirection as Direction] ?? null;
  }

  /*
    ポータルの時間帯（下の useMemo）が評価日を見るので、毎回別物の
    Date にすると依存が毎描画で変わってしまう。ここで固定する。
  */
  const evalDate = React.useMemo(
    () =>
      baseTime
        ? new Date(baseTime.getTime() + timeOffsetDays * 86400000)
        : new Date(),
    [baseTime, timeOffsetDays],
  );
  const currentZodiac = getCurrentZodiac(
    evalDate,
    lon || 139.6917,
    zodiacTimeBasis,
  );
  /**
   * ポータルが読む 2 時間ごとの時間帯。詳細画面（SolarTimeTable）と
   * 同じ関数・同じ引数で出す。別々に出すと、同じ日なのに画面によって
   * 時間帯がずれる。
   */
  const portalSchedule = React.useMemo(
    () => getDailySolarSchedule(evalDate, lon || 139.6917),
    [evalDate, lon],
  );
  const isYearVoid = personalVoidZodiac.includes(currentZodiac.yearZodiac);
  const isMonthVoid = personalVoidZodiac.includes(currentZodiac.monthZodiac);
  const isDayVoid = personalVoidZodiac.includes(currentZodiac.dayZodiac);
  const isGlobalVoid = isYearVoid || isMonthVoid;


  // renderMatrixCell / TooltipCell は「相談」タブと一緒に home/ConsultPanel へ移した。

  if (!baseTime || !solarData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-emerald-500 font-mono text-xs tracking-[0.3em] uppercase md:animate-pulse">
        Initializing Tactical Systems...
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-[#fdfbf7] via-[#fff5f5] to-[#fef2f2] text-stone-800 font-sans selection:bg-rose-100 pt-2 md:pt-8 pb-8 md:pb-16 relative overflow-x-hidden">
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(244, 63, 94, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(244, 63, 94, 0.08) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      ></div>

      {isGlobalVoid && (
        <div className="w-full max-w-[1700px] px-3 md:px-4 mt-2 animate-fade-in z-50">
          <div className="bg-white border-2 border-red-200 rounded-md p-3 md:p-4 shadow-[0_0_20px_rgba(239,68,68,0.2)] flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
              <h2 className="text-red-500 font-bold tracking-[0.2em] text-sm md:text-base uppercase">
                Global Time Check Error
              </h2>
            </div>
            <p className="text-stone-600 text-xs md:text-sm font-mono leading-relaxed">
              現在は
              <strong>「{isYearVoid ? "年の天中殺" : "月の天中殺"}」</strong>
              期間です。
              <br className="hidden md:block" />
              空間の吉凶に関わらず、時間構造にノイズが発生しているため、能動的な大きな移動・決断は推奨されません。
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center space-y-4 md:space-y-6 z-10 w-full max-w-[1700px] px-3 md:px-4 animate-fade-in-up mt-4">
        <div className="w-full max-w-[1700px] text-center mb-2 px-4">
          {/* このコンポーネントはトップページの中に埋め込まれており、
              ページの h1 は別にある。h1 を 2 つ置くと文書構造が壊れるので h2 にする。 */}
          <h2 className="text-emerald-500 font-mono text-xl tracking-[0.2em] font-bold mb-2 uppercase drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] flex items-center justify-center gap-3">
            Bio-Location Simulator
          </h2>
          <p className="text-stone-500 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto mb-4">
            引越し・移住・長期滞在など、人生の大きな決断において
            <strong className="text-stone-700">「最適な移動地（方位）」</strong>
            と
            <strong className="text-stone-700">
              「最適なタイミング（時間）」
            </strong>
            を導き出すためのデータサイエンス・ダッシュボードです。
          </p>
          <button
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="text-[10px] text-emerald-700 hover:text-emerald-800 font-mono uppercase tracking-widest border border-emerald-200 bg-emerald-50 px-4 py-1.5 transition-colors"
          >
            {showHowItWorks
              ? "[-] CLOSE ALGORITHM WORKFLOW"
              : "[?] どのように引越し方位とタイミングを割り出しているのか（統合ワークフロー）"}
          </button>
        </div>


        {showHowItWorks && (
          <div className="w-full max-w-[1700px] animate-fade-in px-4">
            <div className="bg-stone-50 border border-stone-200 p-4 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col gap-4 text-justify text-stone-600 text-xs sm:text-sm font-sans leading-relaxed">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
              <h2 className="text-emerald-500 font-bold uppercase tracking-widest border-b border-stone-200 pb-2 mb-2 font-mono text-[11px] sm:text-xs flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                引越し・移住の「空間」と「時間」を統合する4つのステップ
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <strong className="text-stone-700 bg-white px-2 py-1 border border-stone-200 text-[10px] sm:text-[11px] font-mono">
                    STEP 1: ゼロポイント（現在地）と波長の特定
                  </strong>
                  <p className="text-[10px] sm:text-xs">
                    「Profile」タブにて、あなたの生年月日と現在の拠点（緯度・経度）を入力します。生年月日からはあなたのベースとなる「本命星（固有周波数帯）」と、行動がエラーを起こしやすい「天中殺（VOID
                    TIME）」が算出されます。現在地はすべての方位を割り出すための「原点（ゼロポイント）」となります。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <strong className="text-stone-700 bg-white px-2 py-1 border border-stone-200 text-[10px] sm:text-[11px] font-mono">
                    STEP 2: 干渉ノイズの排除（長・中・短期の合成）
                  </strong>
                  <p className="text-[10px] sm:text-xs">
                    「Destination」タブにおいて、現在地から見た全方位の空間ベクトルを評価します。このダッシュボードでは、東洋暦（年盤・月盤・日盤）の3つのレイヤーを同時に重ね合わせ（Phase
                    Interference
                    Diagnosis）、五黄殺（致命的な環境ノイズ）や本命殺（あなたとの波長不一致）が1つでも含まれる方向をレッドゾーン（進入非推奨）として除外します。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <strong className="text-stone-700 bg-white px-2 py-1 border border-stone-200 text-[10px] sm:text-[11px] font-mono">
                    STEP 3: 相生（共鳴）する目的地・方位の決定
                  </strong>
                  <p className="text-[10px] sm:text-xs">
                    ノイズの無いブルーゾーン（SAFE）の中から、さらに引越し先の空間周波数（九星）とあなたの本命星が「木火土金水」の陰陽五行理論で「相生（エネルギーを生み出す）」または「相比（同調する）」関係にある方向（OPTIMAL）を導き出し、目的地を確定させます。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <strong className="text-stone-700 bg-white px-2 py-1 border border-stone-200 text-[10px] sm:text-[11px] font-mono">
                    STEP 4: 最終出発日時の確定（真太陽時と吉門）
                  </strong>
                  <p className="text-[10px] sm:text-xs">
                    「Timing」タブでタイムラインを展開します。目的地が決まったら、今度は「その方位がOPTIMALになる日」を探します。そしてその日のリストの中から、「天中殺（VOID）」の時間帯を避け、かつ「八門（生・休・開）」のフィルターがオンになっている2時間を「家を出発する・契約印を押す」ためのゴールデンタイムとして確定します。
                  </p>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 p-3 mt-2 text-[10px] sm:text-[11px]">
                <strong className="text-emerald-600 font-bold mb-1 block">
                  なぜこの統合計算が必要なのか？
                </strong>
                引越しなどの長距離・長期間の空間移動は、新しい土地の地球磁場とあなたの生体磁気が順応（シンクロ）するまでに膨大な自律神経のエネルギー（ANS
                Load）を消費します。空間（ノイズのない方位）と時間（天中殺ではない時間）を天文学的に一致させることで、この順応コストを最小限に抑え、新しい環境でのパフォーマンスを最大化することが本システムの目的です。
              </div>
            </div>
          </div>
        )}

        {/*
            タブは常に折り返す。以前は sm 以上で flex-nowrap にしていたが、
            7 つの札が 1 行に収まらない幅（タブレット）では札の側が縮み、
            「ホーム」が「ホ／ー／ム」と 1 文字ずつ縦に割れていた。
            横スクロールにはしない。流れる帯は「押して選ぶのか分からない」
            と利用者から指摘された形そのものなので、2 段に積む。

            ## 配色を揃えた理由（利用者の指摘）

            以前は札ごとに色を変えていたが、次の 3 つが問題だった。

            1. **「2. 目的地/健康」と「5. 総合スコア」がどちらも emerald**
               だった。text の濃さ（500 と 600）しか違わず、選択中の札が
               どちらなのか見分けられない
            2. **段階色と衝突していた。**このサイトは緑＝吉・赤＝凶を
               判定の意味に使っている。移動の手段でしかないタブに緑や
               琥珀を割り当てると、「緑のタブ＝良い」と読めてしまう
            3. 9px は小さすぎた（極小フォントを読める大きさへ、という
               以前の対応から漏れていた）

            **札の識別は色ではなく番号と語で行う。**選択中だけを濃い地色に
            して、それ以外は地色を持たない。7 つ並んでも意味が濁らない。

            uppercase も外した。日本語には効かず、英数字（ホーム以外の
            「1.」など）だけが対象になって揃わない。
          */}
        <div className="w-full max-w-[1700px] flex items-center justify-center p-1 bg-white/80 border border-stone-200 rounded-3xl xl:rounded-full md:backdrop-blur-sm sticky top-4 z-40 flex-wrap gap-1">
          {(
            [
              { id: "portal", label: "ホーム" },
              { id: "profile", label: "1. プロフィール" },
              { id: "destination", label: "2. 目的地/健康" },
              { id: "timing", label: "3. タイミング" },
              { id: "consult", label: "4. 環境データ" },
              { id: "scorecard", label: "5. 総合スコア" },
              { id: "history", label: "6. 履歴" },
            ] as const
          ).map((tab) => {
            const on = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                aria-current={on ? "page" : undefined}
                className={`px-4 sm:px-6 py-2 rounded-full text-[11px] sm:text-xs font-mono tracking-wide whitespace-nowrap transition-all ${
                  on
                    ? "bg-stone-800 text-white border border-stone-800"
                    : "text-stone-600 border border-transparent hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* --- TAB CONTENT: 1. PROFILE --- */}
        {/* --- TAB CONTENT: 0. PORTAL（1 枚目。要点だけを枠で並べる） --- */}
        {activeTab === "portal" && (
          <HomePortal
            onOpenTab={selectTab}
            evalDate={evalDate}
            vectors={activeVectors}
            schedule={portalSchedule}
            personalVoidZodiac={personalVoidZodiac}
            honmeiStar={honmeiStar}
            useClassicalBoard={useClassicalBoard}
            forecast={scorecard30DaysForecast}
            kpIndex={spaceWeather?.kpIndex ?? null}
            pressure={pressureData}
            declination={geoData?.declination ?? null}
            hasBirthDate={Boolean(birthDate)}
          />
        )}

        {activeTab === "profile" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in max-w-[1700px]">
            {/* Action Intent Selector */}
            <div className="w-full bg-white border border-stone-200 rounded-xl p-4 flex flex-col shadow-lg z-10 shrink-0">
              <label
                htmlFor="home-action-intent"
                className="text-[10px] text-stone-600 uppercase font-mono tracking-widest mb-2 flex items-center gap-1"
              >
                <span className="text-emerald-500">◆</span> 移住・移動の目的
              </label>
              <select
                id="home-action-intent"
                value={actionIntent}
                onChange={(e) =>
                  setActionIntent(e.target.value as ActionIntent)
                }
                className="w-full bg-white/70 border border-stone-300 text-sm text-stone-600 rounded px-3 py-2 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="DEFAULT">日常の行動・短期旅行</option>
                <option value="REST">休養・療養を目的とした移動</option>
                <option value="BUSINESS">交渉・ビジネスを目的とした移動</option>
                <option value="MIGRATION">引越し・長期移住・拠点の変更</option>
              </select>
              <p className="text-[9px] text-stone-600 mt-3 leading-relaxed">
                「引越し」や「療養」など、目的に応じて最適な方位（磁場ベクトル）の吉凶判定アルゴリズムが自動的に切り替わります。
              </p>
            </div>

            {/*
              広い画面では 2 枚を横に並べる。1 列に積んだままだと、
              器を 1700px にしても中の札が伸びるだけで幅が何も買わない
              （CLAUDE.md 3 節）。この 2 枚はどちらも 900px 前後で
              自然に収まるので、並べるとちょうど埋まる。
            */}
            <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Hardware Init & Anchor Config */}
            <PersonalProfileConfig
              birthDate={birthDate}
              setBirthDate={setBirthDate}
              birthLat={birthLat}
              setBirthLat={setBirthLat}
              birthLon={birthLon}
              setBirthLon={setBirthLon}
              baseLat={lat}
              setBaseLat={setLat}
              baseLon={lon}
              setBaseLon={setLon}
              onSave={handleSaveConfig}
              isSaving={isSaving}
              onLoad={() => handleLoadConfig(false)}
              onGetGPS={handleGetGPS}
              voidZodiacOverride={voidZodiacOverride}
              setVoidZodiacOverride={setVoidZodiacOverride}
              geminiKey={geminiKey}
              setGeminiKey={setGeminiKey}
              baselineHrvMean={baselineHrvMean}
              setBaselineHrvMean={setBaselineHrvMean}
              baselineHrvStd={baselineHrvStd}
              setBaselineHrvStd={setBaselineHrvStd}
              baselineGsrMean={baselineGsrMean}
              setBaselineGsrMean={setBaselineGsrMean}
              baseSyncTimestamp={baseSyncTimestamp}
              setBaseSyncTimestamp={setBaseSyncTimestamp}
              usePsychologyScorer={usePsychologyScorer}
              setUsePsychologyScorer={setUsePsychologyScorer}
              useKigakuScorer={useKigakuScorer}
              setUseKigakuScorer={setUseKigakuScorer}
              useAstrologyScorer={useAstrologyScorer}
              setUseAstrologyScorer={setUseAstrologyScorer}
              derivedHonmeiStar={honmeiStar}
              derivedPersonalVoid={personalVoidZodiac}
            />
            <TenchusatsuVisualizer birthDateStr={birthDate} />
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: 2. DESTINATION --- */}
        {activeTab === "destination" && (
          <div className="w-full flex flex-col items-center space-y-8">
            {/* BioMagnetic Dashboard (Load Prediction) */}
            <div className="w-full max-w-[1700px]">
              <BioMagneticDashboard
                kpIndex={spaceWeather?.kpIndex || null}
                xrayFlux={spaceWeather?.xrayFlux || null}
                magneticF={geoData?.intensity || null}
                magneticD={geoData?.declination || null}
                magneticI={geoData?.inclination || null}
                eot={solarData.equationOfTime}
                hrv={hrv}
                setHrv={setHrv}
                gsr={gsr}
                setGsr={setGsr}
                baseSyncDays={baseSyncDays}
                setBaseSyncDays={setBaseSyncDays}
                ansLoad={ansLoad}
                shieldCapacity={shieldCapacity}
                pressure={pressureData}
                timingDetails={timingOptimization?.details}
                timingRecommendation={timingOptimization?.recommendationText}
              />
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: 3. TIMING --- */}
        {activeTab === "timing" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">
            {/* Temporal HUD (Main Clock Focus) */}
            <ClockDisplay
              kimon={kimon}
              isVoidTime={isPersonalVoid}
              solarTime={solarData.solarTime}
              eot={solarData.equationOfTime}
              longOffset={solarData.longitudeCorrection}
              targetDate={evalDate}
            />

            {/* Module 3: Temporal Filter Matrix */}
            <SolarTimeTable
              date={evalDate}
              longitude={lon || 135.7681}
              latitude={lat}
              eot={solarData.equationOfTime}
              kpIndex={spaceWeather?.kpIndex || null}
              xrayFlux={spaceWeather?.xrayFlux || null}
              ansLoad={ansLoad}
              shieldCapacity={shieldCapacity}
              vectors={activeVectors || null}
              honmeiStar={honmeiStar}
              envData={env}
              personalVoidZodiac={personalVoidZodiac}
              useClassical={useClassicalBoard}
              zodiacTimeBasis={zodiacTimeBasis}
            />
          </div>
        )}

        {/* --- TAB CONTENT: 4. CONSULT (AI & Telemetry) --- */}
        {activeTab === "consult" && (
          <ConsultPanel
            honmeiStar={honmeiStar}
            env={env}
            birthEnv={birthEnv}
            layers={layers}
            physicalLayers={physicalLayers}
            classicalLayers={classicalLayers}
            physicalYearBoard={physicalYearBoard}
            physicalMonthBoard={physicalMonthBoard}
            physicalDayBoard={physicalDayBoard}
            classicalDayBoard={classicalDayBoard}
            classicalMonthBoard={classicalMonthBoard}
            classicalYearBoard={classicalYearBoard}
            useClassicalBoard={useClassicalBoard}
            personalVoidZodiac={personalVoidZodiac}
            currentZodiac={currentZodiac}
          />
        )}

        {/* --- TAB CONTENT: 5. SCORECARD --- */}
        {/*
          総合スコアのタブ本体と方位詳細ドロワーは home/ScorecardPanel に
          分割してある（タブ分割 2/3）。ドロワーは selectedDirection で
          開くので、タブを離れても開いたままにする従来挙動を保つため、
          マウント条件に selectedDirection を含める。
        */}
        {(activeTab === "scorecard" || selectedDirection !== null) && (
          <ScorecardPanel
            active={activeTab === "scorecard"}
            scorecardLoading={scorecardLoading}
            scorecardSummary={scorecardSummary}
            scorecard30DaysForecastAllModels={scorecard30DaysForecastAllModels}
            scorecardHonmeiStarsForecast={scorecardHonmeiStarsForecast}
            selectedDirection={selectedDirection}
            setSelectedDirection={setSelectedDirection}
            showNoiseDirections={showNoiseDirections}
            setShowNoiseDirections={setShowNoiseDirections}
            scorecardPrefecture={scorecardPrefecture}
            setScorecardPrefecture={setScorecardPrefecture}
            gridModelView={gridModelView}
            setGridModelView={setGridModelView}
            scorecardActiveGridTab={scorecardActiveGridTab}
            setScorecardActiveGridTab={setScorecardActiveGridTab}
            gridDimension={gridDimension}
            setGridDimension={setGridDimension}
            isExporting={isExporting}
            handleExportGridCsv={handleExportGridCsv}
            handleExportForGemini={handleExportForGemini}
            handleDownloadUnifiedDataset={handleDownloadUnifiedDataset}
            nbaData={nbaData}
            honmeiStar={honmeiStar}
            useClassicalBoard={useClassicalBoard}
            lat={lat}
            lon={lon}
            baseTime={baseTime}
            birthDate={birthDate}
            wealthData={wealthData}
          />
        )}

        {/* --- MAP CONTENT (Appended to DESTINATION tab) --- */}
        {/* 目的地タブの後半（Spatial Targeting・地図・方位の手引き）は
            home/DestinationMapPanel に分割してある（タブ分割 3/3）。 */}
        {activeTab === "destination" && (
          <DestinationMapPanel
            lat={lat}
            lon={lon}
            baseTime={baseTime}
            birthDate={birthDate}
            evalDate={evalDate}
            timeOffsetDays={timeOffsetDays}
            setTimeOffsetDays={setTimeOffsetDays}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            playSpeedDays={playSpeedDays}
            setPlaySpeedDays={setPlaySpeedDays}
            targetLat={targetLat}
            setTargetLat={setTargetLat}
            targetLon={targetLon}
            setTargetLon={setTargetLon}
            targetElevation={targetElevation}
            setTargetElevation={setTargetElevation}
            targetDirInfo={targetDirInfo}
            targetDirection={targetDirection}
            targetVectorStatus={targetVectorStatus}
            showMapPicker={showMapPicker}
            setShowMapPicker={setShowMapPicker}
            actionIntent={actionIntent}
            setActionIntent={setActionIntent}
            useClassicalBoard={useClassicalBoard}
            setUseClassicalBoard={setUseClassicalBoard}
            useTrueNorth={useTrueNorth}
            setUseTrueNorth={setUseTrueNorth}
            physicalMonthMode={physicalMonthMode}
            setPhysicalMonthMode={setPhysicalMonthMode}
            activeLayerMode={activeLayerMode}
            setActiveLayerMode={setActiveLayerMode}
            directionFilterMode={directionFilterMode}
            setDirectionFilterMode={setDirectionFilterMode}
            heatmapMode={heatmapMode}
            toggleHeatmapMode={toggleHeatmapMode}
            heatmapData={heatmapData}
            selectedTrendCell={selectedTrendCell}
            setSelectedTrendCell={setSelectedTrendCell}
            focusedDirection={focusedDirection}
            setFocusedDirection={setFocusedDirection}
            highlightDirection={highlightDirection}
            moveTargetToDirection={moveTargetToDirection}
            handleAutoSearch={handleAutoSearch}
            isAutoSearching={isAutoSearching}
            physicalLayers={physicalLayers}
            classicalLayers={classicalLayers}
            honmeiStar={honmeiStar}
            geoData={geoData}
            spaceWeather={spaceWeather}
            ansLoad={ansLoad}
            shieldCapacity={shieldCapacity}
            mapProperties={mapProperties}
            showProperties={showProperties}
            setShowProperties={setShowProperties}
            showOnlyNewBuild={showOnlyNewBuild}
            setShowOnlyNewBuild={setShowOnlyNewBuild}
            propertiesLoading={propertiesLoading}
            propertiesError={propertiesError}
            hudLayers={hudLayers}
            setHudLayers={setHudLayers}
          />
        )}

        {/* --- TAB CONTENT: 6. INSIGHTS (HISTORY) --- */}
        {activeTab === "history" && (
          <div className="w-full max-w-[1700px] flex flex-col gap-6 animate-fade-in mt-4">
            {/*
              何を見る画面なのかが書いてなかった。グラフが 5 枚並ぶだけで、
              利用者から「見方が分からない」と言われた。読み方をここに書く。
            */}
            <div className="w-full bg-white/80 border border-stone-200 rounded-xl p-5">
              <h2 className="text-sm font-bold text-stone-700 mb-2">
                日ごとの記録
              </h2>
              <p className="text-xs text-stone-500 leading-relaxed max-w-[70ch]">
                {"引越しの前後で環境と体調がどう動いたかを、後から見返すための画面です。夜間の巡回が 1 日 1 件ずつ記録します。"}
                <strong className="text-stone-700">
                  ここで吉凶は判定しません。
                </strong>
                {"方位と日取りは 2〜5 のタブで決めます。"}
              </p>
              <ul className="text-xs text-stone-500 mt-3 space-y-1 list-disc pl-5">
                <li>
                  {"天体黄経 — 太陽・月・木星の位置。月盤と年盤の切り替わりがここに出ます"}
                </li>
                <li>
                  {"宇宙天気・地磁気 — Kp 指数と磁場。体調が崩れやすい日の裏付けに使います"}
                </li>
                <li>
                  {"生体 — HRV・GSR・自律神経の負荷。入れた基準値と比べます"}
                </li>
                <li>
                  {"気学星・月相 — その日の年盤・月盤・日盤の星と月の満ち欠け"}
                </li>
              </ul>
            </div>
            <TelemetryChart />
          </div>
        )}

        {/*
          暦カレンダーと選んだ日の詳細は /calendar に同じものがある。
          ここにも置いていたので、同じ道具が 2 か所にあり、画面 1 枚ぶんを
          占めていた。利用者の指示で /calendar に一本化し、ここは導線だけ
          にする。**表示の分だけホームが軽くなる。**
        */}
        <div className="w-full max-w-[1700px] px-4">
          <Link
            href="/calendar"
            className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors"
          >
            <span className="flex flex-col">
              <span className="text-xs font-bold text-stone-700">
                引越しの日取りを選ぶ（暦カレンダー）
              </span>
              <span className="text-[10px] text-stone-600">
                天赦日・一粒万倍日・天中殺と、方位の吉凶を月ごとに見ます。
              </span>
            </span>
            <span className="text-indigo-500 text-xs shrink-0">開く →</span>
          </Link>
        </div>
      </div>
      {/* Telemetry and Audit Log */}
      <SystemTelemetryLog
        lat={lat}
        lon={lon}
        solarTime={solarData?.solarTime}
        declination={geoData?.declination || null}
        env={env}
      />

      <div className="fixed bottom-6 left-6 lg:left-72 z-50 flex flex-col sm:flex-row gap-3">
        <button
          onClick={exportMasterTelemetry}
          className="px-4 py-3 bg-emerald-700 text-white font-bold font-mono text-[10px] tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-500 hover:scale-105 transition-all flex items-center gap-2 border border-emerald-200 backdrop-blur-md"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          マスター状態を出力 (CSV/JSON)
        </button>
      </div>
    </div>
  );
};

"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { toLogMessage, toUserMessage } from "@/lib/errorMessage";
import {
  calculateSolarTime,
  getKimonHour,
  type SolarTimeResult,
} from "../utils/solarTime";
import { calculateBioMetrics } from "../utils/bioModelingEngine";
import type { SpaceWeatherData } from "../utils/spaceWeather";
import type { SurfacePressureData } from "../utils/surfacePressure";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";
import { Solar } from "lunar-javascript";

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
import { loadSettings, saveSettings } from "@/lib/userSettings";
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
import { directionBoardInstant } from "@/utils/boardInstant";
import { statusForLayerMode, type LayerMode } from "@/utils/directionStatus";

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
const TacticalMagneticMap = dynamic(
  () => import("./TacticalMagneticMap").then((mod) => mod.TacticalMagneticMap),
  { ssr: false },
);
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
    <div className="w-full h-40 flex items-center justify-center font-mono text-xs text-stone-400">
      [ 診断ボードを読込中... ]
    </div>
  ),
});

const ScorecardPanel = dynamic(() => import("./home/ScorecardPanel"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-40 flex items-center justify-center font-mono text-xs text-stone-400">
      [ 総合スコアを読込中... ]
    </div>
  ),
});

const CosmicCalendar = dynamic(
  () => import("./widgets/CosmicCalendar").then((mod) => mod.CosmicCalendar),
  { ssr: false },
);
import type { DayData } from "./widgets/CosmicCalendar";

/**
 * 環境テレメトリの折れ線（recharts）。「6. 履歴」タブの 1 か所でしか
 * 使わないので、静的に読むとホームを開いた全員が recharts を読むことになる。
 */
const TelemetryChart = dynamic(() => import("./TelemetryChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-400">
      [ LOADING TELEMETRY CHART... ]
    </div>
  ),
});

const LocationPickerInner = dynamic(() => import("./LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-400">
      [ INITIALIZING MAP INTERFACE... ]
    </div>
  ),
});

/**
 * 時期のヒートマップ 1 列ぶん。30 日表示は 1 日、12 ヶ月表示は 1 ヶ月。
 *
 * 外から来る応答ではなく、このファイルの中で組み立てている。形はそこで
 * 確定しているので、読む枝だけでなく作る側の全項目を書いている。
 */
interface HeatmapColumn {
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
interface TrendCell {
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
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<DayData | null>(null);


  const [baseTime, setBaseTime] = useState<Date | null>(null);
  const [ephemerisTime, setEphemerisTime] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<SolarTimeResult | null>(null);
  const [activeTab, setActiveTab] = useState<
    "profile" | "destination" | "timing" | "consult" | "history" | "scorecard"
  >("profile");

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
      ["profile", "destination", "timing", "consult", "history", "scorecard"].includes(
        saved,
      )
    ) {
      setActiveTab(saved as typeof activeTab);
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
  // 設定がこの端末だけのものか、クラウドにも同期されているか。
  // 「永久保存」と称して端末にしか残していなかったので、状態を明示する。
  const [isSavingLog, setIsSavingLog] = useState(false);

  // Future Simulation & Intent State
  const [timeOffsetDays, setTimeOffsetDays] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedDays, setPlaySpeedDays] = useState(1);
  const [actionIntent, setActionIntent] = useState<ActionIntent>("DEFAULT");
  const [useClassicalBoard, setUseClassicalBoard] = useState<boolean>(true);
  const [physicalMonthMode, setPhysicalMonthMode] = useState<
    "coupled" | "independent"
  >("independent");
  const [useTrueNorth, setUseTrueNorth] = useState<boolean>(false);
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
  const targetDirection = useMemo(() => {
    const info = getTargetDirectionInfo();
    if (!info) return null;
    return useTrueNorth ? info.trueDirection : info.magneticDirection;
  }, [getTargetDirectionInfo, useTrueNorth]);

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

    const dest = destinationForDirection(
      lat,
      lon,
      dir as CompassDirection,
      distanceKm,
      geoData?.declination ?? 0,
      useTrueNorth,
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

        const cz = getCurrentZodiac(testDate, lon || 139.6917);
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
          const s =
            vectorData.finalVectors[
              (useTrueNorth
                ? targetDirInfo.trueDirection
                : targetDirInfo.magneticDirection) as Direction
            ];
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

  const scorecard30DaysForecast = React.useMemo(() => {
    if (!baseTime || !honmeiStar) return null;
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
      const testDateLocal = new Date(baseTime.getTime() + i * 86400000);
      const testDateSolar = calculateSolarTime(testDateLocal, lon || 139.6917);
      const testDate = testDateSolar.solarTime;
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
    baseTime,
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
    if (!baseTime || !honmeiStar) return null;
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
          (w) => (useTrueNorth ? w.direction : w.magneticDirection) === dir,
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
      const testDateLocal = new Date(baseTime.getTime() + i * 86400000);
      const testSolar = Solar.fromDate(testDateLocal);
      const testLunar = testSolar.getLunar();

      const testDateSolar = calculateSolarTime(testDateLocal, lon || 139.6917);
      const testDate = testDateSolar.solarTime;
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
    baseTime,
    honmeiStar,
    voidZodiacOverride,
    birthDate,
    lon,
    getsuMeiStar,
    directionFilterMode,
    activeLayerMode,
    physicalMonthMode,
    wealthData,
    useTrueNorth,
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
          (w) => (useTrueNorth ? w.direction : w.magneticDirection) === dir,
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
    useTrueNorth,
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
        const itemDir = useTrueNorth ? item.direction : item.magneticDirection;
        return itemDir === dir;
      });
      const topAreas = [...areasForDir].sort(
        (a, b) => (b.incomePerCapita || 0) - (a.incomePerCapita || 0),
      );
      const topArea = topAreas[0] || null;

      const rentalsForDir = propertiesData.filter((item) => {
        const itemDir = useTrueNorth ? item.direction : item.magneticDirection;
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
    useTrueNorth,
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

  // ヒートマップの基準日。
  //
  // baseTime は時計として 60 秒ごとに更新される。これをそのまま依存に置くと、
  // 日付が変わっていないのに 30日分（または12ヶ月分）の盤を毎分作り直していた。
  // 実測で 1 回あたり約 90ms かかり、そのぶんメインスレッドが止まる。
  // 日単位に丸めて、日付か条件が変わったときだけ組み直す。
  // 正午に寄せているのは、読み込んだ時刻によって結果が揺れないようにするため。
  const heatmapAnchorMs = useMemo(() => {
    if (!baseTime) return null;
    const d = new Date(baseTime);
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  }, [baseTime]);

  useEffect(() => {
    if (heatmapMode === "none" || heatmapAnchorMs === null || !honmeiStar || !env)
      return;
    const baseTime = new Date(heatmapAnchorMs);

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
            const z = getCurrentZodiac(testDate, lon || 139.6917);
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
            const z = getCurrentZodiac(testDate, lon || 139.6917);
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
    heatmapAnchorMs,
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
      nbaData?.nba.stateVector.ephemerisData?.planetaryPositions || "",
      nbaData?.nba.stateVector.astrologyData?.source || "",
      nbaData?.nba.stateVector.astrologyData?.transits || "",
      nbaData?.nba.stateVector.ragContext?.source || "",
      nbaData?.nba.stateVector.ragContext?.classicalRules || "",
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

  const handleSaveStateToDatabase = async () => {
    if (!env || !layers) {
      alert("保存するデータが準備されていません。");
      return;
    }

    setIsSavingLog(true);
    try {
      const payload = {
        targetDate: baseTime
          ? new Date(
              baseTime.getTime() + timeOffsetDays * 86400000,
            ).toISOString()
          : new Date().toISOString(),
        environmentalBazi: env,
        personalBazi: honmeiStar,
        physicalLayers: physicalLayers,
        classicalLayers: classicalLayers,
        physicalIndependentLayers: physicalIndepLayers,
        physicalCoupledLayers: physicalCoupledLayers,
        ansLoad: ansLoad,
        kpIndex: spaceWeather?.kpIndex || null,
        metadata: {
          actionIntent,
          geoData,
          shieldCapacity,
          timeOffsetDays,
        },
      };

      const res = await fetch("/api/metaphysical-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("APIエラーが発生しました");
      }

      alert("現在のステータスをデータベースに保存しました。");
    } catch (err) {
      console.error("Save Log Error:", err);
      alert(`保存に失敗しました: ${toUserMessage(err)}`);
    } finally {
      setIsSavingLog(false);
    }
  };

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
        if (data.current === null || data.drop === null) {
          // 取れていない。0 を入れて「変化なし」と見せない。
          setPressureData(null);
          setPressureDrop(0);
          return;
        }
        setPressureData({
          current: data.current,
          drop: data.drop,
          timestamp: data.timestamp,
        });
        setPressureDrop(data.drop);
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
    const targetDirection = dirInfo
      ? ((useTrueNorth
          ? dirInfo.trueDirection
          : dirInfo.magneticDirection) as Direction)
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
    targetVectorStatus =
      activeVectors[
        (useTrueNorth
          ? targetDirInfo.trueDirection
          : targetDirInfo.magneticDirection) as Direction
      ] ?? null;
  }

  const evalDate = baseTime
    ? new Date(baseTime.getTime() + timeOffsetDays * 86400000)
    : new Date();
  const currentZodiac = getCurrentZodiac(evalDate, lon || 139.6917);
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
        <div className="w-full max-w-[1600px] px-3 md:px-4 mt-2 animate-fade-in z-50">
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

      <div className="flex flex-col items-center space-y-4 md:space-y-6 z-10 w-full max-w-[1600px] px-3 md:px-4 animate-fade-in-up mt-4">
        <div className="w-full max-w-[1400px] text-center mb-2 px-4">
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
            className="text-[10px] text-emerald-600 hover:text-emerald-600 font-mono uppercase tracking-widest border border-emerald-200 bg-emerald-50 px-4 py-1.5 transition-colors"
          >
            {showHowItWorks
              ? "[-] CLOSE ALGORITHM WORKFLOW"
              : "[?] どのように引越し方位とタイミングを割り出しているのか（統合ワークフロー）"}
          </button>
        </div>

        <div className="w-full max-w-[1600px] grid grid-cols-1 xl:grid-cols-12 gap-6 px-4 items-start">
          {/* Cosmic Calendar Widget (Calendar Grid) */}
          <div className="xl:col-span-7 bg-white/80 border border-stone-200 rounded-2xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all flex flex-col overflow-hidden">
            <CosmicCalendar
              view="calendar"
              selectedDayState={calendarSelectedDay}
              setSelectedDayState={setCalendarSelectedDay}
            />
          </div>

          {/* Cosmic Calendar Widget (Telemetry Details) */}
          <div className="xl:col-span-5 bg-white/80 border border-stone-200 rounded-2xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all flex flex-col overflow-hidden">
            <CosmicCalendar
              view="telemetry"
              selectedDayState={calendarSelectedDay}
              setSelectedDayState={setCalendarSelectedDay}
            />
          </div>
        </div>

        {showHowItWorks && (
          <div className="w-full max-w-[1400px] animate-fade-in px-4">
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

        <div className="w-full max-w-[1400px] flex items-center justify-center p-1 bg-white/80 border border-stone-200 rounded-full md:backdrop-blur-sm sticky top-4 z-40 flex-wrap sm:flex-nowrap gap-1">
          <button
            onClick={() => selectTab("profile")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "profile"
                ? "bg-purple-500/10 text-purple-600 border border-purple-200"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            1. プロフィール
          </button>
          <button
            onClick={() => selectTab("destination")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "destination"
                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-200"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            2. 目的地/健康
          </button>
          <button
            onClick={() => selectTab("timing")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "timing"
                ? "bg-indigo-500/10 text-indigo-600 border border-indigo-200"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            3. タイミング
          </button>
          <button
            onClick={() => selectTab("consult")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "consult"
                ? "bg-amber-500/10 text-amber-500 border border-amber-200"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            4. 環境データ
          </button>
          <button
            onClick={() => selectTab("scorecard")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "scorecard"
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-200"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            5. 総合スコア
          </button>
          <button
            onClick={() => selectTab("history")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "history"
                ? "bg-sky-500/10 text-sky-600 border border-sky-200"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            6. 履歴
          </button>
        </div>

        {/* --- TAB CONTENT: 1. PROFILE --- */}
        {activeTab === "profile" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in max-w-[1400px]">
            {/* Action Intent Selector */}
            <div className="w-full bg-white border border-stone-200 rounded-xl p-4 flex flex-col shadow-lg z-10 shrink-0">
              <label
                htmlFor="home-action-intent"
                className="text-[10px] text-stone-400 uppercase font-mono tracking-widest mb-2 flex items-center gap-1"
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
              <p className="text-[9px] text-stone-400 mt-3 leading-relaxed">
                「引越し」や「療養」など、目的に応じて最適な方位（磁場ベクトル）の吉凶判定アルゴリズムが自動的に切り替わります。
              </p>
            </div>

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
        )}

        {/* --- TAB CONTENT: 2. DESTINATION --- */}
        {activeTab === "destination" && (
          <div className="w-full flex flex-col items-center space-y-8">
            {/* BioMagnetic Dashboard (Load Prediction) */}
            <div className="w-full max-w-[1400px]">
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
        {activeTab === "destination" && (
          <div className="w-full flex flex-col items-center space-y-8 mt-8">
            <div className="w-full max-w-[1400px] mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* Spatial Targeting */}
              <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <div className="flex items-center gap-2 mb-1 border-b border-stone-200 pb-2">
                  <span className="text-emerald-500 animate-pulse">▶</span>
                  <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest">
                    Spatial Targeting{" "}
                    <span className="text-[9px] text-stone-400 font-normal ml-1">
                      / 空間・目的の捕捉
                    </span>
                  </h3>
                </div>
                <p className="text-[10px] text-stone-400 mb-4 h-8 mt-1">
                  目的地の方位に潜むノイズと、あなたの行動目的（戦闘か回復か）を照合・評価します。
                </p>
                <div className="flex flex-col gap-3 mt-auto">
                  {/* 狭い画面では select が幅を取り、左の説明文が 1 文字ずつに
                      折り返される（375px の実測で幅 42px）。縦に積む。 */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-white/70 p-2 border border-stone-200 rounded-sm">
                    <div className="flex flex-col min-w-0">
                      <label className="text-[10px] text-stone-400 uppercase tracking-widest">
                        Action Intent
                      </label>
                      <span className="text-[8px] text-stone-400">
                        行動の性質により吉凶の計算結果が変わります
                      </span>
                    </div>
                    <select
                      value={actionIntent}
                      onChange={(e) =>
                        setActionIntent(e.target.value as ActionIntent)
                      }
                      className="bg-transparent text-emerald-600 font-bold text-[10px] outline-none cursor-pointer text-right"
                    >
                      <option value="DEFAULT">DEFAULT (通常行動)</option>
                      <option value="REST">REST (回復・静養)</option>
                      <option value="BUSINESS">BUSINESS (事業・拡張)</option>
                      <option value="MIGRATION">
                        MIGRATION (引越し・長期滞在)
                      </option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center bg-white/70 p-2 border border-stone-200 rounded-sm mt-1">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-stone-400 uppercase tracking-widest">
                        Target Date
                      </label>
                      <span className="text-[8px] text-stone-400">
                        評価する目標日を指定します
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAutoSearch}
                        disabled={isAutoSearching}
                        className="text-[9px] text-emerald-600 border border-emerald-200 bg-emerald-50 px-2 py-1 rounded-sm hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.1)]"
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
                            (selectedDate.getTime() - baseCopy.getTime()) /
                              86400000,
                          );
                          setTimeOffsetDays(diffDays);
                        }}
                        className="bg-transparent text-emerald-600 font-bold text-[10px] outline-none cursor-pointer text-right [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-1 gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-white/70 p-0.5 border border-stone-200 rounded-sm">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${isPlaying ? "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.2)]" : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-50 shadow-[0_0_8px_rgba(59,130,246,0.2)]"}`}
                      >
                        {isPlaying ? "⏸ 一時停止" : "▶ 再生"}
                      </button>
                      <select
                        value={playSpeedDays}
                        onChange={(e) =>
                          setPlaySpeedDays(Number(e.target.value))
                        }
                        disabled={isPlaying}
                        className="bg-transparent text-stone-500 text-[8px] font-mono outline-none cursor-pointer"
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
                        className="text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"
                        title="Previous Day"
                      >
                        ◀
                      </button>
                      <button
                        onClick={() => setTimeOffsetDays((prev) => prev + 1)}
                        className="text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"
                        title="Next Day"
                      >
                        ▶
                      </button>
                      <div className="w-px h-3 bg-stone-100 my-auto mx-0.5"></div>
                                      <button
                        onClick={() => setTimeOffsetDays(0)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 0 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                      >
                        TODAY
                      </button>
                      <button
                        onClick={() => setTimeOffsetDays(30)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 30 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                      >
                        +30D
                      </button>
                      <button
                        onClick={() => setTimeOffsetDays(90)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 90 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                      >
                        +90D
                      </button>
                      <button
                        onClick={() => setTimeOffsetDays(180)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 180 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                      >
                        +180D
                      </button>
                      <button
                        onClick={() => setTimeOffsetDays(365)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 365 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-white/80 text-stone-400 border-stone-200 hover:border-emerald-200 hover:text-emerald-600"}`}
                      >
                        +1Y
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 bg-white/70 p-2 border border-stone-200 rounded-sm mt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-stone-400 uppercase tracking-widest flex items-center gap-1">
                        目的地座標{" "}
                        <span className="text-[9px] text-stone-400">
                          緯度/経度
                        </span>
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
                        className="flex-1 bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-xs px-2 py-1.5 rounded-sm outline-none transition-colors"
                        onChange={(e) => {
                          const val = e.target.value;
                          // Google Mapsの "@lat,lon" と、コピーした単なる "lat,lon" の両方に対応
                          const match = val.match(
                            /(?:@|^|\s)(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
                          );
                          if (match) {
                            setTargetLat(
                              Number(parseFloat(match[1]).toFixed(5)),
                            );
                            setTargetLon(
                              Number(parseFloat(match[2]).toFixed(5)),
                            );
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
                          setTargetLat(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
                      />
                      <input
                        type="number"
                        placeholder="経度"
                        value={targetLon ?? ""}
                        onChange={(e) =>
                          setTargetLon(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
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
                        className="bg-white border border-stone-300 focus:border-emerald-200 text-stone-600 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
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
                              "座標をコピーしました: " +
                                `${targetLat},${targetLon}`,
                            );
                          }}
                          className="flex-1 bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900 border border-stone-300 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-sm transition-colors"
                        >
                          📋 座標をコピー
                        </button>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-800/50 border border-blue-800/50 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-sm transition-colors text-center block"
                        >
                          🗺️ Googleマップで開く
                        </a>
                      </div>
                    )}{" "}
                    {targetDirInfo && targetVectorStatus && (
                      <div
                        className={`mt-1 text-[10px] font-mono p-1 border rounded-sm flex items-center justify-between gap-2 ${
                          targetVectorStatus.startsWith("NOISE_VOID")
                            ? "bg-stone-50 border-stone-200 text-stone-400 repeating-linear-gradient-45"
                            : targetVectorStatus.startsWith("NOISE_NODE")
                              ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
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
                            className={`font-bold border px-1 ${useTrueNorth ? "text-emerald-600 border-emerald-200" : "text-stone-400 border-stone-300"}`}
                            title="真北基準"
                          >
                            真北: {targetDirInfo.trueDirection}
                          </span>
                          <span
                            className={`font-bold border px-1 ${!useTrueNorth ? "text-emerald-600 border-emerald-200" : "text-stone-400 border-stone-300"}`}
                            title="磁北基準"
                          >
                            磁北: {targetDirInfo.magneticDirection}
                          </span>
                          <span>{targetVectorStatus}</span>
                          {(() => {
                            const currentTendo = classicalLayers?.tendoDirection || physicalLayers?.tendoDirection;
                            const isTargetTendo = currentTendo && (targetDirInfo.magneticDirection === currentTendo || targetDirInfo.trueDirection === currentTendo);
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
                              className="text-[9px] text-amber-500 border border-amber-200 px-1 py-0.5 rounded bg-amber-500/5 animate-pulse cursor-help font-bold font-mono"
                              title="【境界線偏角アラート】真北と磁北で判定する方位セクターが異なっています。基準北トグルの切り替えにより方位評価が変化します。"
                            >
                              ⚠️偏角ズレ
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] opacity-70">
                          TARGET EVAL
                        </span>
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
                    <span className="text-stone-400 animate-pulse">◆</span>
                    <h3 className="text-xs text-stone-600 font-bold uppercase tracking-widest">
                      ゾーン分類{" "}
                      <span className="text-[9px] text-stone-400 font-normal ml-1">
                        / 空間分類
                      </span>
                    </h3>
                  </div>
                  <div className="flex flex-col gap-1.5 mb-2 bg-white/70 p-2.5 rounded-sm border border-stone-200 shadow-inner">
                    <div className="text-[9px] text-stone-400 font-mono flex justify-between items-center border-b border-stone-200 pb-1">
                      <span>BASE GEO (基準地)</span>
                      <span className="text-stone-600 font-bold">
                        {lat?.toFixed(4)}N, {lon?.toFixed(4)}E
                      </span>
                    </div>
                    <div className="text-[9px] text-stone-400 font-mono flex justify-between items-center border-b border-stone-200 pb-1">
                      <span>TARGET DATE (目標日)</span>
                      <span className="text-emerald-600 font-bold">
                        {evalDate.toLocaleDateString()}{" "}
                        <span className="text-stone-400 font-normal ml-1">
                          (
                          {timeOffsetDays > 0
                            ? `+${timeOffsetDays}`
                            : timeOffsetDays}
                          d)
                        </span>
                      </span>
                    </div>
                    <div className="text-[9px] text-stone-400 font-mono flex justify-between items-center">
                      <span>SUBJECT (対象波長)</span>
                      <span className="text-purple-600 font-bold">
                        {honmeiStar
                          ? `本命星 ${useClassicalBoard ? honmeiStar.classical : honmeiStar.physical}`
                          : "Unset"}{" "}
                        <span className="text-stone-400 font-normal ml-1">
                          ({birthDate.split("T")[0]})
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 mt-2 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
                    {(() => {
                      const renderZone = (
                        fv:
                          | Partial<Record<Direction, string>>
                          | null
                          | undefined,
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
                              <span className="text-[8px] opacity-70 font-normal">
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
                                        <span className="text-[8px] animate-pulse">
                                          🎯
                                        </span>
                                      )}
                                      <span className="text-[10px] font-bold tracking-wider">
                                        {map[dir]}
                                      </span>
                                    </div>
                                    <span className="text-[7px] font-mono opacity-80 mt-0.5 whitespace-nowrap">
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
                        let titleSuffix = "FINAL LAYER (統合)";

                        if (activeLayerMode === "year") {
                          physVectors = physicalLayers?.yearLayer;
                          classVectors = classicalLayers?.yearLayer;
                          titleSuffix = "YEAR LAYER (年盤)";
                        } else if (activeLayerMode === "month") {
                          physVectors = physicalLayers?.monthLayer;
                          classVectors = classicalLayers?.monthLayer;
                          titleSuffix = "MONTH LAYER (月盤)";
                        } else if (activeLayerMode === "day") {
                          physVectors = physicalLayers?.dayLayer;
                          classVectors = classicalLayers?.dayLayer;
                          titleSuffix = "DAY LAYER (日盤)";
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
                                `PHYSICAL - ${titleSuffix}`,
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
                                `CLASSICAL - ${titleSuffix}`,
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
              <div className="w-full max-w-[1400px] md:col-span-2 bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rose-100/60 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-rose-500 font-bold text-base">◆</span>
                    <h3 className="text-base font-bold font-serif text-stone-900 flex flex-wrap items-center gap-2">
                      TREND ANALYTICS
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
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          heatmapMode === "30days"
                            ? "bg-rose-500 text-stone-900 shadow-xs font-bold"
                            : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        30 DAYS
                      </button>
                      <button
                        onClick={() => toggleHeatmapMode("12months")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          heatmapMode === "12months"
                            ? "bg-rose-500 text-stone-900 shadow-xs font-bold"
                            : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        12 MONTHS
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
                        className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
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
                        className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
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
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all border cursor-pointer ${
                            isPlaying && playSpeedDays === 30
                              ? "bg-rose-500 text-stone-900 border-rose-600 shadow-md shadow-rose-200 animate-pulse"
                              : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                          }`}
                        >
                          {isPlaying && playSpeedDays === 30 ? "⏸ 月次コマ送り一時停止" : "▶ 月次自動再生"}
                        </button>

                        <button
                          onClick={() => setTimeOffsetDays((prev) => prev - 30)}
                          className="px-2.5 py-1.5 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-lg cursor-pointer"
                          title="1ヶ月巻き戻し"
                        >
                          ◀ 前月
                        </button>
                        <button
                          onClick={() => setTimeOffsetDays((prev) => prev + 30)}
                          className="px-2.5 py-1.5 bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-lg cursor-pointer"
                          title="1ヶ月コマ送り"
                        >
                          次月 ▶
                        </button>
                        <button
                          onClick={() => setTimeOffsetDays(0)}
                          className="px-2.5 py-1.5 bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200 rounded-lg cursor-pointer font-bold"
                          title="現在月へリセット"
                        >
                          RESET
                        </button>
                      </div>

                      {/* Live Snapshot Header */}
                      <div className="flex items-center gap-2 text-stone-600 bg-white px-3 py-1.5 rounded-lg border border-stone-200 font-medium">
                        <span>📅 表示中: <strong className="text-rose-600 font-bold">{evalDate.getFullYear()}年{evalDate.getMonth() + 1}月</strong></span>
                        <span className="text-stone-300">|</span>
                        <span className="text-amber-600 font-bold">
                          ✨ 月の天道: {
                            (() => {
                              const currentTendo = classicalLayers?.tendoDirection || physicalLayers?.tendoDirection;
                              const mapDir: Record<string, string> = { N: "北", NE: "北東", E: "東", SE: "南東", S: "南", SW: "南西", W: "西", NW: "北西" };
                              return currentTendo ? `${mapDir[currentTendo] || currentTendo} (${currentTendo})` : "未算出";
                            })()
                          }
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
                            方位（{useTrueNorth ? "真北" : "磁北"}基準）。同じ行に印を付けています。
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
                          className="px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors"
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
                                  <span className="block text-[8px] leading-none text-rose-500">
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
                        {(
                          [
                            "N",
                            "NE",
                            "E",
                            "SE",
                            "S",
                            "SW",
                            "W",
                            "NW",
                          ] as const
                        ).map((dir) => (
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
                              const isLuckyFilter = directionFilterMode === "optimal_only";
                              const isExcludeFilter = directionFilterMode === "exclude_noise";
                              const isOptimal = st === "OPTIMAL" || st === "OPTIMAL_REGULAR";
                              const isMajorNoise =
                                st?.startsWith("NOISE_GOU") ||
                                st?.startsWith("NOISE_ANKEN") ||
                                st === "NOISE_HA";
                              // 凶除外モードでは大凶セルを消さずグレーで「除外済み」と明示する
                              const isExcluded = isExcludeFilter && isMajorNoise;

                              let bgClass = "bg-stone-50/50 text-stone-400";
                              if (isExcluded) {
                                bgClass =
                                  "bg-stone-300/70 text-stone-500 line-through opacity-70";
                              } else if (isOptimal) {
                                bgClass = isTendoActive
                                  ? "bg-gradient-to-br from-amber-400 via-emerald-400 to-amber-500 text-stone-950 font-bold border-2 border-amber-300 ring-2 ring-amber-400 shadow-md shadow-amber-200/50 scale-105 z-10"
                                  : "bg-emerald-500 text-stone-900 font-bold shadow-xs border border-emerald-400";
                              } else if (st === "SAFE") {
                                bgClass = isLuckyFilter ? "bg-blue-100/70 text-blue-700" : "bg-blue-100 text-blue-800 font-medium";
                              } else if (isMajorNoise) {
                                bgClass = isLuckyFilter ? "bg-rose-100/70 text-rose-700" : "bg-rose-500 text-stone-900 font-semibold";
                              } else if (
                                st?.startsWith("NOISE_HONMEI") ||
                                st?.startsWith("NOISE_TEKI") ||
                                st?.startsWith("NOISE_GETSUMEI") ||
                                st?.startsWith("NOISE_GETSUTEKI")
                              ) {
                                bgClass = isLuckyFilter ? "bg-purple-100/70 text-purple-700" : "bg-purple-500 text-stone-900 font-medium";
                              } else if (
                                st?.startsWith("NOISE_VOID") ||
                                st?.startsWith("NOISE_NODE")
                              ) {
                                bgClass = isLuckyFilter ? "bg-amber-100/70 text-amber-800" : "bg-amber-400 text-amber-950 font-medium";
                              } else if (st === "WARNING") {
                                bgClass = isLuckyFilter ? "bg-orange-100/70 text-orange-800" : "bg-orange-400 text-stone-900 font-medium";
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
                                      <span className="text-[11px] drop-shadow-xs">✨</span>
                                    ) : isOptimal ? (
                                      <span className="text-[10px]">★</span>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                      {heatmapMode === "12months" && (
                        <p className="mt-3 text-center text-[9px] text-stone-500 leading-relaxed">
                          12ヶ月表示は<b>節入り基準の月</b>（暦の1日ではなく立春・啓蟄などで替わる月）で刻み、「その月の傾向」を見るため<b>日盤を含めずに年盤＋月盤で判定</b>しています。地図も自動的に年盤＋月盤へ切り替わり、先頭列と同じ判定を表示します。
                        </p>
                      )}

                      {/* Legend Bar */}
                      <div className="flex gap-3 mt-3 text-[7px] font-mono text-stone-500 justify-center flex-wrap">
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <span className="text-amber-600 font-bold">✨</span> 天道 (Tendou) 回座
                        </span>
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <div className="w-2 h-2 bg-emerald-500/80"></div> OPTIMAL (大吉)
                        </span>
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <div className="w-2 h-2 bg-blue-500/20 border border-stone-300"></div> SAFE (吉)
                        </span>
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <div className="w-2 h-2 bg-red-500/80"></div> TYPE I (Gou/Anken/Ha)
                        </span>
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <div className="w-2 h-2 bg-purple-500/80"></div> TYPE II (Bio)
                        </span>
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <div className="w-2 h-2 bg-yellow-500/80"></div> VOID/NODE
                        </span>
                        <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-200">
                          <div className="w-2 h-2 bg-orange-500/80"></div> WARNING
                        </span>
                        {directionFilterMode === "exclude_noise" && (
                          <span className="flex items-center gap-1 bg-white/80 px-1.5 py-0.5 rounded border border-stone-300">
                            <div className="w-2 h-2 bg-stone-300"></div> ✕ 除外 (五黄・暗剣・歳破)
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-md animate-in fade-in duration-150">
                      <div className="relative w-full max-w-sm bg-white border border-stone-300 rounded-2xl p-5 text-stone-900 shadow-2xl space-y-3.5">
                        <button
                          onClick={() => setSelectedTrendCell(null)}
                          className="absolute top-3.5 right-3.5 text-stone-500 hover:text-stone-900 p-1 text-sm font-bold"
                        >
                          ✕
                        </button>

                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl border ${selectedTrendCell.isTendo ? "bg-amber-500/20 text-amber-600 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]" : "bg-indigo-500/20 text-indigo-600 border-indigo-200"}`}>
                            <span className="text-xl">{selectedTrendCell.isTendo ? "✨" : "🎯"}</span>
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-stone-800 flex items-center gap-2">
                              {selectedTrendCell.label} 【方位: {selectedTrendCell.dir}】
                            </h3>
                            <p className="text-[11px] text-stone-500 font-mono">
                              総合判定: <strong className="text-emerald-600 font-bold">{selectedTrendCell.status}</strong>
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
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
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
                              <p className="text-[10px] leading-relaxed text-amber-200/90">
                                この時期、<strong>{selectedTrendCell.dir} 方位</strong> には暦上の最高吉神「天道」が回座しています。天道の強力な吉パワーにより、本命殺や月命殺等の個人の凶作用が相殺・補正され、総合判定として<strong>大吉（OPTIMAL）</strong>へ昇格評価されています。
                              </p>
                            </div>
                          )}

                          <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-1.5">
                            <div className="font-bold text-stone-500 border-b border-stone-200 pb-1 text-[10px]">
                              レイヤー（層）別判定ブレイクダウン
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-stone-400">年盤 (Year):</span>
                              <span className="font-semibold text-stone-700">
                                {selectedTrendCell.raw?.yearLayer?.[selectedTrendCell.dir] || "SAFE"}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-stone-400">月盤 (Month):</span>
                              <span className="font-semibold text-stone-700">
                                {selectedTrendCell.raw?.monthLayer?.[selectedTrendCell.dir] || "SAFE"}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-stone-400">日盤 (Day):</span>
                              <span className="font-semibold text-stone-700">
                                {selectedTrendCell.raw?.dayLayer?.[selectedTrendCell.dir] || "SAFE"}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px] pt-1 border-t border-stone-200">
                              <span className="text-stone-400">天道作用:</span>
                              <span className={selectedTrendCell.isTendo ? "text-amber-600 font-bold" : "text-stone-400"}>
                                {selectedTrendCell.isTendo ? "✨ 回座中 (Active)" : "対象外"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedTrendCell(null)}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-stone-900 font-medium text-xs rounded-xl transition-colors cursor-pointer"
                        >
                          了解
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Module 4: Tactical Magnetic Map */}
            <div className="w-full max-w-[1400px] mt-0">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 w-full gap-2">
                {/* Cyberpunk Filter Selector */}
                <div className="flex items-center gap-1.5 bg-stone-50 p-1 border border-stone-200 rounded-sm flex-wrap">
                  <span className="text-[8px] font-mono text-stone-400 uppercase tracking-wider px-1">
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
                        ? "bg-yellow-950/40 text-yellow-400 border-yellow-500/50 shadow-[0_0_5px_rgba(234,179,8,0.2)]"
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
                      {physicalMonthMode === "independent"
                        ? "物理独立"
                        : "伝統連動"}
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
                        ? "bg-yellow-950/20 border-yellow-500/30 text-yellow-400"
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
                        <span className="font-bold">
                          【個人九星気学表示モード】
                        </span>
                        本命星・月命星による吉凶方位のみをマッピングしています。
                      </>
                    )}
                    {directionFilterMode === "personal_bazi" && (
                      <>
                        <span className="font-bold">
                          【個人天中殺表示モード】
                        </span>
                        四柱推命の生年月日干支から算出される天中殺方位のみをマッピングしています。
                      </>
                    )}
                    {directionFilterMode === "environmental" && (
                      <>
                        <span className="font-bold">
                          【環境方位表示モード】
                        </span>
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
                toggleLayer={(
                  layer: "terrain" | "weather" | "bio" | "hazard",
                ) =>
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
            <div className="w-full max-w-[1400px] mt-4">
              <details className="bg-white/80 border border-stone-200 rounded-md p-4 group cursor-pointer">
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
                          宇宙のリアルタイムな物理データ（NASA/Swiss
                          Ephemeris）を使用。木星の正確な黄経や、太陽・月のリアルな重力・磁場位相からダイレクトに空間の周波数を割り出します。
                          <br />
                          <br />
                          <span className="text-stone-600">推奨用途:</span>{" "}
                          今日の体調管理、集中力の最大化、リアルな環境干渉（自律神経への影響）の回避など。
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
                          有害なノイズ（凶殺）が一切存在しないことに加え、ユーザーの「本命星」とその方位の星が『相生（互いにエネルギーを与え合う関係）』になっています。
                          <br />
                          <br />
                          <span className="text-stone-600">意味:</span>{" "}
                          リスクがないだけでなく、行くことで「エネルギー的なバフ（運気・活力の向上）」が得られる、システムが最も推奨するベストな方位です。
                        </p>
                      </div>
                      <div className="bg-white/80 p-3 border-l-2 border-blue-500">
                        <div className="text-blue-500 font-bold mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          [ SAFE ] 進入可能方位
                        </div>
                        <p className="text-stone-500 text-[10px] sm:text-xs">
                          五黄殺、暗剣殺、天中殺といったあらゆる有害なノイズが一切存在しない方位です。
                          <br />
                          <br />
                          <span className="text-stone-600">意味:</span>{" "}
                          行ってもマイナス（ペナルティ）を受けることはありませんが、特別なボーナスも得られない「無害なニュートラルゾーン（安全地帯）」です。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: 6. INSIGHTS (HISTORY) --- */}
        {activeTab === "history" && (
          <div className="w-full max-w-[1400px] flex flex-col gap-6 animate-fade-in mt-4">
            <TelemetryChart />
          </div>
        )}
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
          onClick={handleSaveStateToDatabase}
          disabled={isSavingLog}
          className="px-4 py-3 bg-purple-600/90 text-white font-bold font-mono text-[10px] tracking-widest rounded-full shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:bg-purple-500 hover:scale-105 transition-all flex items-center gap-2 border border-purple-200 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSavingLog ? (
            <span className="animate-pulse">保存中...</span>
          ) : (
            <>
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
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              データベースに保存
            </>
          )}
        </button>

        <button
          onClick={exportMasterTelemetry}
          className="px-4 py-3 bg-emerald-600/90 text-white font-bold font-mono text-[10px] tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-500 hover:scale-105 transition-all flex items-center gap-2 border border-emerald-200 backdrop-blur-md"
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

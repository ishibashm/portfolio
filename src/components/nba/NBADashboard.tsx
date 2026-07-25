"use client";

/*
  METAPHYSICAL MATRIX RENDERING FIX:
  - Resolved rendering issue in the 占術・易学・算術マトリクス (Metaphysical Matrix) and 総合環境テレメトリ (Telemetry) tabs.
  - Replaced unsafe direct property accesses on data.macro.streams with secure optional chaining.
  - Added optional chaining safeguards to all dynamic string .split(" ") and array .map() / .join() operations 
    to prevent TypeError render crashes when data streams or sub-properties are undefined or during initialization.
*/

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Shield,
  CloudLightning,
  Compass,
  BrainCircuit,
  RefreshCcw,
  TerminalSquare,
  BookOpen,
  AlertTriangle,
  Navigation,
  Orbit,
  Zap,
  TrendingUp,
  Sparkles,
  Layers,
  Eye,
  Moon,
  Sun,
  Flame,
  Award,
  ChevronDown,
  ChevronUp,
  Star,
  CalendarDays,
  Rocket,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { CytoscapeNetwork } from "./CytoscapeNetwork";
import { BaziReport, BaziData } from "./BaziReport";
import { VedicReport, VedicData } from "./VedicReport";
import {
  MetaphysicalConfigBar,
  MetaphysicalConfig,
} from "@/components/layout/MetaphysicalConfigBar";

export interface TarotCard {
  name: string;
  suit: string;
  arcana: "Major" | "Minor";
  orientation: "Upright" | "Reversed";
  meaning: string;
  riskModifier: number;
}

export interface NumerologyData {
  lifePathNumber: number;
  description: string;
}

export interface MetaphysicalData {
  divineApi: {
    tarot: TarotCard;
    numerology: NumerologyData;
    sourceInfo: string;
  };
  astrologyApi: {
    horoscope: string;
    aspects: {
      aspect: string;
      angle: number;
      quality: "harmonious" | "discordant" | "neutral";
    }[];
    sourceInfo: string;
  };
  vedAstro: {
    activeDasha: string;
    ashtakavargaPoints: Record<string, number>;
    planetaryStrengths: Record<string, number>;
    sourceInfo: string;
  };
  chineseMetasoft: {
    qiMenGate: {
      name: string;
      direction: string;
      description: string;
      status: "Auspicious" | "Inauspicious" | "Neutral";
    };
    daYunPillar: {
      pillar: string;
      startAge: number;
      endAge: number;
      description: string;
    } | null;
    sourceInfo: string;
  };
  roxyApi: {
    ichingCast: {
      hexagramNumber: number;
      name: string;
      lines: number[];
      changingLines: number[];
      relatingHexagram: {
        number: number;
        name: string;
      } | null;
      interpretation: string;
    };
    sourceInfo: string;
  };
  ziWeiDouShu?: {
    selfPalaceStar: string;
    bodyPalaceStar: string;
    activeFlyingStar: string;
    palacePosition: string;
    dailyInsight: string;
    sourceInfo: string;
  };
  nineStarKi?: {
    yearStar: string;
    monthStar: string;
    dayStar: string;
    magicSquareLocation: string;
    dailyDirectionSafety: string;
    sourceInfo: string;
  };
  mayaTzolkin?: {
    kinNumber: number;
    solarSeal: { name: string; glyph: string; meaning: string };
    galacticTone: { tone: number; name: string; power: string };
    dailyGuidance: string;
    sourceInfo: string;
  };
  kabbalahTree?: {
    activeSephirah: string;
    pathOfResonance: string;
    hebrewLetter: string;
    dailyVibrationScore: number;
    insight: string;
    sourceInfo: string;
  };
  humanDesign?: {
    chartType: string;
    authority: string;
    profile: string;
    activeChannels: string[];
    dailyGateActivation: string;
    sourceInfo: string;
  };
  geomancy?: {
    figureName: string;
    binaryPoints: number[];
    element: string;
    astrologicalAssociation: string;
    interpretation: string;
    sourceInfo: string;
  };
}

export interface NBAData {
  micro: {
    hrv: number;
    gsr: number;
    ansLoad?: number;
    shieldCapacity?: number;
  };
  macro: {
    environmentalNoise: string;
    streams?: {
      ephemeris: {
        sun: string;
        moon: string;
        mercury: string;
        venus: string;
        mars: string;
        jupiter: string;
        saturn: string;
        lunarNode: string;
      };
      environmentalBazi?: BaziData & { context: string };
      personalBazi?:
        | (BaziData & { context: string; voidZodiac: string })
        | null;
      westernAstrology: {
        aspects: string[];
        retrogrades: string[];
      };
      vedicAstrology: VedicData;
      spaceWeather?: {
        kpIndex: number | null;
        xrayFlux: string | null;
        solarWindSpeed: number | null;
        timestamp: string | null;
        riskScore: number;
      };
      macroEconomics?: {
        vix: number;
        creditSpread: number;
        isMocked: boolean;
        riskScore: number;
      };
      lunarTide?: {
        distanceKm: number;
        tideIntensity: number;
        distanceCloseness: number;
        gravitationalTideScore: number;
        riskScore: number;
      };
      metaphysical?: MetaphysicalData;
      isVoidTime?: boolean;
      isConflictDay?: boolean;
      unifiedRiskScore?: number;
    };
  };
  nba: {
    stateVector: {
      ansLoad: number;
      shieldCapacity: number;
      environmentalRisk?: number;
      unifiedRiskScore?: number;
      isVoidTime?: boolean;
      isConflictDay?: boolean;
      solarPhase: number;
      stressLevel?: number;
      resilience?: string;
      ephemerisData?: {
        source: string;
        planetaryPositions: any;
      };
      astrologyData?: {
        source: string;
        transits: any;
      };
      ragContext?: {
        source: string;
        classicalRules: any;
        personalBazi?: any;
      };
      vedicAstrology?: any;
      ichingHexagram?: {
        number: number;
        name: string;
        riskModifier: number;
        confidenceBoost: number;
        actionAdvice: string;
      };
      environmentalNoise: string;
    };
    actionResult: {
      suggestedAction: string;
      confidence: number;
      expectedReward: number;
      policyType: string;
      qValues?: Record<string, number>;
      probabilities?: Record<string, number>;
      logicTrace?: string[];
      attentionMatrix?: number[][];
      sigmoidGates?: {
        ansStressGate: number;
        shieldVulnerabilityGate: number;
      };
      llmPredictionTrace?: string[];
    };
  };
}

export function NBADashboard({
  externalData,
  onRefresh,
}: {
  externalData?: NBAData | null;
  onRefresh?: () => void;
}) {
  const [internalData, setInternalData] = useState<NBAData | null>(null);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"telemetry" | "matrix" | "engine">(
    "telemetry",
  );

  // Metaphysical Engine Global Configuration States
  const [useClassical, setUseClassical] = useState(true);
  const [directionFilterMode, setDirectionFilterMode] = useState<
    "composite" | "personal_kigaku" | "personal_bazi" | "environmental"
  >("composite");
  const [actionIntent, setActionIntent] = useState<
    "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION"
  >("DEFAULT");

  // Collapse states for detailed reports
  const [showNatalBazi, setShowNatalBazi] = useState(false);
  const [showEnvBazi, setShowEnvBazi] = useState(false);
  const [showVedic, setShowVedic] = useState(false);

  const data = externalData !== undefined ? externalData : internalData;

  const fetchNBAData = async (cfg?: {
    useClassicalBoard?: boolean;
    directionFilterMode?: string;
    actionIntent?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const activeClassical =
        cfg?.useClassicalBoard !== undefined
          ? cfg.useClassicalBoard
          : useClassical;
      const activeFilter =
        cfg?.directionFilterMode !== undefined
          ? cfg.directionFilterMode
          : directionFilterMode;
      const activeIntent =
        cfg?.actionIntent !== undefined ? cfg.actionIntent : actionIntent;

      let birthDateVal: string | undefined = undefined;
      try {
        const localData = localStorage.getItem("tactical_config_v1");
        if (localData) {
          const config = JSON.parse(localData);
          if (config.birth_date) {
            birthDateVal = config.birth_date;
          }
        }
      } catch (e) {
        console.error("Failed to read birthDate from localStorage:", e);
      }

      const res = await fetch("/api/nba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useClassical: activeClassical,
          directionFilterMode: activeFilter,
          actionIntent: activeIntent,
          birthDate: birthDateVal,
        }),
      });
      if (!res.ok) throw new Error("Failed to fetch NBA data");
      const json = await res.json();
      if (json.success) {
        setInternalData(json.data);
      } else {
        throw new Error(json.error || "Unknown error");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchForecast = async (
    currentData: NBAData,
    cfg?: { useClassicalBoard?: boolean },
  ) => {
    setForecastLoading(true);
    try {
      const activeClassical =
        cfg?.useClassicalBoard !== undefined
          ? cfg.useClassicalBoard
          : useClassical;

      let birthDateVal: string | undefined = undefined;
      try {
        const localData = localStorage.getItem("tactical_config_v1");
        if (localData) {
          const config = JSON.parse(localData);
          if (config.birth_date) {
            birthDateVal = config.birth_date;
          }
        }
      } catch (e) {
        console.error("Failed to read birthDate from localStorage:", e);
      }

      const res = await fetch("/api/nba/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentShield: currentData.nba.stateVector.shieldCapacity,
          currentAnsLoad: currentData.nba.stateVector.ansLoad,
          useClassical: activeClassical,
          clientBirthDate: birthDateVal,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setForecastData(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch forecast:", err);
    } finally {
      setForecastLoading(false);
    }
  };

  useEffect(() => {
    if (externalData === undefined) {
      fetchNBAData();
    }
  }, [externalData]);

  useEffect(() => {
    if (data) {
      fetchForecast(data, { useClassicalBoard: useClassical });
    }
  }, [data, useClassical]);

  useEffect(() => {
    // Listen to updates from other pages / config bars
    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MetaphysicalConfig>;
      if (customEvent.detail) {
        setUseClassical(customEvent.detail.useClassicalBoard);
        setDirectionFilterMode(customEvent.detail.directionFilterMode);
        setActionIntent(customEvent.detail.actionIntent);

        if (externalData === undefined) {
          fetchNBAData({
            useClassicalBoard: customEvent.detail.useClassicalBoard,
            directionFilterMode: customEvent.detail.directionFilterMode,
            actionIntent: customEvent.detail.actionIntent,
          });
        }
      }
    };
    window.addEventListener(
      "metaphysical-config-updated",
      handleGlobalConfigUpdate,
    );
    return () => {
      window.removeEventListener(
        "metaphysical-config-updated",
        handleGlobalConfigUpdate,
      );
    };
  }, [externalData, useClassical, directionFilterMode, actionIntent]);

  // Unified Risk Variables
  const unifiedRisk = data?.macro.streams?.unifiedRiskScore ?? 50;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (unifiedRisk / 100) * circumference;

  const getRiskColor = (score: number) => {
    if (score < 30) return "text-emerald-400 stroke-emerald-400";
    if (score < 60) return "text-amber-400 stroke-amber-400";
    return "text-red-400 stroke-red-400";
  };

  const getRiskBg = (score: number) => {
    if (score < 30) return "bg-emerald-500/10 border-emerald-500/20";
    if (score < 60) return "bg-amber-500/10 border-amber-500/20";
    return "bg-red-500/10 border-red-500/20";
  };

  // Alignment Check Logic
  const getActionAlignment = () => {
    const suggested = data?.nba?.actionResult?.suggestedAction;
    const intent = actionIntent;

    if (!suggested || !intent) return null;

    let isAligned = true;
    let message = "";
    let status: "success" | "warning" | "error" = "success";

    if (suggested === "ABORT_AND_SHIELD") {
      if (intent === "MIGRATION" || intent === "BUSINESS") {
        isAligned = false;
        status = "error";
        message =
          "警告: 意思決定エンジンは「撤退（ABORT_AND_SHIELD）」を強く推奨していますが、主観的なアクション目的は「前進/ビジネス（MIGRATION/BUSINESS）」に設定されています。高リスクの電磁/生体障害が生じる恐れがあります。";
      } else {
        message =
          "整合性良好: 意思決定エンジンの「撤退」推奨に対し、目的は「標準/休息（DEFAULT/REST）」であり、安全志向で一致しています。";
      }
    } else if (suggested === "PREPARE_AND_WAIT") {
      if (intent === "MIGRATION" || intent === "BUSINESS") {
        isAligned = false;
        status = "warning";
        message =
          "不一致警告: エンジンは「準備・待機（PREPARE_AND_WAIT）」を推奨していますが、目的は活性（MIGRATION/BUSINESS）に設定されています。時期尚早または微小な障害発生のシグナルがあります。";
      } else {
        message =
          "整合性良好: 推奨行動とアクション目的は待機・安定期（DEFAULT/REST）で整合しています。";
      }
    } else if (
      suggested === "EXECUTE_RELOCATION" ||
      suggested === "EXECUTE_PURGE_RELOCATION"
    ) {
      if (intent === "REST") {
        isAligned = false;
        status = "warning";
        message =
          "注意: エンジンは「実行・前進（EXECUTE_RELOCATION）」を推奨していますが、目的は「休息（REST）」に設定されています。エネルギーの急激な消耗に備えてください。";
      } else {
        message =
          "整合性良好: 意思決定エンジンの「実行」推奨と、アクティブな目的（DEFAULT/MIGRATION/BUSINESS）が整合しています。";
      }
    } else {
      message =
        "整合性良好: 現在の意思決定ポリシーと選択されたアクション目的は一致しています。";
    }

    return { isAligned, status, message };
  };

  const alignment = getActionAlignment();

  const handleConfigChange = (newConfig: MetaphysicalConfig) => {
    setUseClassical(newConfig.useClassicalBoard);
    setDirectionFilterMode(newConfig.directionFilterMode);
    setActionIntent(newConfig.actionIntent);

    if (externalData === undefined) {
      fetchNBAData({
        useClassicalBoard: newConfig.useClassicalBoard,
        directionFilterMode: newConfig.directionFilterMode,
        actionIntent: newConfig.actionIntent,
      });
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 text-stone-800 relative font-sans space-y-8">
      {/* Metaphysical Configuration Bar */}
      <MetaphysicalConfigBar onConfigChange={handleConfigChange} />

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 bg-white/80 backdrop-blur-xl border border-rose-100/80 p-6 rounded-3xl shadow-xl shadow-rose-100/30">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold font-serif text-stone-900 flex items-center gap-3">
            <BrainCircuit className="w-9 h-9 text-rose-500 animate-pulse" />
            Agency Metaphysical System
          </h1>
          <p className="text-stone-600 mt-2 text-xs md:text-sm font-normal">
            生体テレメトリと時空マクロ環境を統合する次善行動（NBA）意思決定エンジン
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (onRefresh) onRefresh();
              else fetchNBAData();
            }}
            disabled={loading || (externalData !== undefined && !onRefresh)}
            className="p-2.5 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-semibold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-md shadow-rose-200"
            title="データを更新"
          >
            <RefreshCcw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
            <span className="text-xs">データ更新</span>
          </button>
        </div>
      </header>

      {/* Warning Banners */}
      <div className="space-y-3 mb-6">
        {data?.macro.streams?.isVoidTime && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-900 shadow-sm backdrop-blur-md"
          >
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 animate-bounce" />
            <div className="text-xs md:text-sm">
              <span className="font-bold tracking-wide mr-2">
                ⚠️ VOID TIME ACTIVE (天中殺/空亡期間)
              </span>
              <span className="text-amber-800">
                ユーザー空亡の十二支（戌亥）と現在の時盤が一致しています。能動的行動のQ値が補正されます。
              </span>
            </div>
          </motion.div>
        )}

        {data?.macro.streams?.isConflictDay && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-400/30 text-rose-900 shadow-sm backdrop-blur-md"
          >
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 animate-pulse" />
            <div className="text-xs md:text-sm">
              <span className="font-bold tracking-wide mr-2">
                ⚠️ CONFLICT DAY DETECTED (日支・年支相冲)
              </span>
              <span className="text-rose-800">
                現在の地支が日主の地支と反発。守備的行動（ABORT_AND_SHIELD）の優先度が引き上げられています。
              </span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-rose-200/80 mb-8 overflow-x-auto scrollbar-none gap-2 bg-white/70 backdrop-blur-xl p-2 rounded-2xl border shadow-sm">
        {(["telemetry", "matrix", "engine"] as const).map((tab) => {
          const labels = {
            telemetry: "総合環境テレメトリ",
            matrix: "占術・易学・算術マトリクス",
            engine: "RL意思決定エンジン",
          };
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-rose-500 text-white shadow-md shadow-rose-200"
                  : "text-stone-600 hover:bg-rose-50 hover:text-stone-900"
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Content Rendering */}
      {error ? (
        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-400 backdrop-blur-sm">
          データの読み込みエラー: {error}
        </div>
      ) : loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          <div className="h-48 bg-white/5 rounded-3xl border border-white/10"></div>
          <div className="h-48 bg-white/5 rounded-3xl border border-white/10"></div>
          <div className="h-48 bg-white/5 rounded-3xl border border-white/10"></div>
        </div>
      ) : data ? (
        <AnimatePresence mode="wait">
          {activeTab === "telemetry" && (
            <motion.div
              key="telemetry"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Unified Risk Engine Gauge Card */}
              <div className="p-6 rounded-3xl bg-white/80 border border-rose-100/80 backdrop-blur-xl flex flex-col items-center justify-center relative overflow-hidden shadow-xl shadow-rose-100/30">
                <div className="absolute top-0 left-0 p-4 w-full flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                    統合リスクエンジン (Unified Risk Engine)
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${getRiskBg(unifiedRisk)} ${getRiskColor(unifiedRisk)}`}
                  >
                    {unifiedRisk < 30
                      ? "低 (LOW)"
                      : unifiedRisk < 60
                        ? "警戒 (ELEVATED)"
                        : "危機 (CRITICAL)"}
                  </span>
                </div>

                {/* SVG Gauge */}
                <div className="relative w-36 h-36 flex items-center justify-center mt-6 mb-4">
                  <svg
                    className="w-full h-full transform -rotate-90"
                    viewBox="0 0 120 120"
                  >
                    {/* Background Circle */}
                    <circle
                      cx="60"
                      cy="60"
                      r={radius}
                      className="stroke-stone-200 fill-none"
                      strokeWidth="10"
                    />
                    {/* Progress Circle */}
                    <motion.circle
                      cx="60"
                      cy="60"
                      r={radius}
                      className={`fill-none ${getRiskColor(unifiedRisk)}`}
                      strokeWidth="10"
                      strokeDasharray={circumference}
                      initial={{ strokeDashoffset: circumference }}
                      animate={{ strokeDashoffset }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-3xl font-black font-mono tracking-tight text-stone-900">
                      {unifiedRisk.toFixed(1)}
                    </span>
                    <span className="text-[9px] text-stone-500 uppercase tracking-widest font-bold">
                      リスク指数
                    </span>
                  </div>
                </div>

                {/* Score breakdown bar */}
                <div className="w-full space-y-2.5 mt-2">
                  <div className="flex justify-between items-center text-[10px] font-mono text-stone-600">
                    <span className="flex items-center gap-1 font-semibold">
                      <CloudLightning className="w-3.5 h-3.5 text-amber-500" />{" "}
                      宇宙天気 (40%)
                    </span>
                    <span className="text-stone-900 font-bold">
                      {data?.macro.streams?.spaceWeather?.riskScore
                        ? data.macro.streams.spaceWeather.riskScore.toFixed(0)
                        : "0"}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-stone-600">
                    <span className="flex items-center gap-1 font-semibold">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-500" />{" "}
                      マクロ経済 (40%)
                    </span>
                    <span className="text-stone-900 font-bold">
                      {data?.macro.streams?.macroEconomics?.riskScore
                        ? data.macro.streams.macroEconomics.riskScore.toFixed(0)
                        : "0"}
                      %
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-stone-600">
                    <span className="flex items-center gap-1 font-semibold">
                      <Moon className="w-3.5 h-3.5 text-purple-500" /> 月面重力干渉
                      (20%)
                    </span>
                    <span className="text-stone-900 font-bold">
                      {data?.macro.streams?.lunarTide?.riskScore
                        ? data.macro.streams.lunarTide.riskScore.toFixed(0)
                        : "0"}
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Space Weather Telemetry Card */}
              <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-white/5 pb-3">
                    <div className="p-1.5 rounded-lg bg-orange-500/20">
                      <CloudLightning className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-orange-100">
                        宇宙天気 (Space Weather)
                      </h3>
                      <p className="text-[9px] text-gray-500">
                        NOAAリアルタイム太陽宇宙天気フィード
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400 font-medium">
                          地磁気活動指数 (Kp Index)
                        </span>
                        <span className="text-white font-mono font-bold">
                          {data?.macro.streams?.spaceWeather?.kpIndex ?? "N/A"}
                          /9
                        </span>
                      </div>
                      <div className="grid grid-cols-9 gap-1 h-2">
                        {Array.from({ length: 9 }).map((_, i) => {
                          const kp =
                            data?.macro.streams?.spaceWeather?.kpIndex ?? 3;
                          const active = i < kp;
                          let color = "bg-white/10";
                          if (active) {
                            color =
                              i < 3
                                ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.4)]"
                                : i < 6
                                  ? "bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.4)]"
                                  : "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.4)]";
                          }
                          return (
                            <div
                              key={i}
                              className={`h-full rounded-sm ${color} transition-all`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-400 font-medium">
                          太陽風速度 (Solar Wind Speed)
                        </span>
                        <span className="text-white font-mono font-bold">
                          {data?.macro.streams?.spaceWeather?.solarWindSpeed ??
                            "N/A"}{" "}
                          km/s
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full"
                          style={{
                            width: `${Math.min(100, (((data?.macro.streams?.spaceWeather?.solarWindSpeed ?? 300) - 300) / 500) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-gray-400 font-medium">
                        X線太陽フラックス (X-Ray Flux)
                      </span>
                      <span className="text-white font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10">
                        {data?.macro.streams?.spaceWeather?.xrayFlux ?? "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[8px] text-gray-500 font-mono text-right mt-4">
                  Last sync:{" "}
                  {data?.macro.streams?.spaceWeather?.timestamp
                    ? new Date(
                        data.macro.streams.spaceWeather.timestamp,
                      ).toLocaleTimeString()
                    : "N/A"}
                </div>
              </div>

              {/* Macroeconomics Card */}
              <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-white/5 pb-3">
                    <div className="p-1.5 rounded-lg bg-blue-500/20">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-blue-100">
                        金融市場 (Market Economics)
                      </h3>
                      <p className="text-[9px] text-gray-500">
                        Yahoo Finance市場リスク指標
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs p-3 rounded-xl bg-black/30 border border-white/5">
                      <div>
                        <p className="text-gray-400 font-medium">
                          市場ボラティリティ指数 (VIX)
                        </p>
                        <p className="text-[10px] text-gray-500">
                          恐怖指数ゲージ
                        </p>
                      </div>
                      <span
                        className={`text-xl font-black font-mono ${(data?.macro.streams?.macroEconomics?.vix ?? 0) > 25 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {data?.macro.streams?.macroEconomics?.vix
                          ? data.macro.streams.macroEconomics.vix.toFixed(2)
                          : "18.00"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs p-3 rounded-xl bg-black/30 border border-white/5">
                      <div>
                        <p className="text-gray-400 font-medium">
                          推定クレジットスプレッド
                        </p>
                        <p className="text-[10px] text-gray-500">
                          社債デフォルトリスク指標
                        </p>
                      </div>
                      <span className="text-xl font-black font-mono text-blue-300">
                        {data?.macro.streams?.macroEconomics?.creditSpread
                          ? data.macro.streams.macroEconomics.creditSpread.toFixed(
                              2,
                            )
                          : "4.20"}
                        %
                      </span>
                    </div>

                    {data.macro.streams?.macroEconomics?.isMocked && (
                      <div className="flex items-center gap-1.5 text-[9px] text-gray-500 bg-white/5 p-2 rounded-lg border border-white/5">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>
                          APIがオフラインまたは未設定です。フォールバックシミュレーションがアクティブです。
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[8px] text-gray-500 font-mono text-right mt-4">
                  データエンジン状態: 安定 (STABLE)
                </div>
              </div>

              {/* Lunar Tide Card */}
              <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-white/5 pb-3">
                    <div className="p-1.5 rounded-lg bg-indigo-500/20">
                      <Moon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-indigo-100">
                        重力・潮汐力 (Lunar Gravity)
                      </h3>
                      <p className="text-[9px] text-gray-500">
                        天体物理エンジン軌道計算
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-medium">
                        月・地球間距離 (Moon-Earth Distance)
                      </span>
                      <span className="text-white font-mono font-bold">
                        {data?.macro.streams?.lunarTide?.distanceKm
                          ? data.macro.streams.lunarTide.distanceKm.toLocaleString()
                          : "384,400"}{" "}
                        km
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-400 font-medium">
                          重力引力強度 (Gravitational Pull)
                        </span>
                        <span className="text-indigo-300 font-mono font-bold">
                          {data?.macro.streams?.lunarTide
                            ?.gravitationalTideScore ?? "10"}
                          /20
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full"
                          style={{
                            width: `${((data?.macro.streams?.lunarTide?.gravitationalTideScore ?? 10) / 20) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                        <p className="text-[9px] text-gray-500 uppercase">
                          潮汐状態 (Tide State)
                        </p>
                        <p className="text-xs font-bold text-white mt-0.5">
                          {(data?.macro.streams?.lunarTide?.tideIntensity ??
                            0) > 0.7
                            ? "大潮 (SPRING TIDE)"
                            : "小潮 (NEAP TIDE)"}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-center">
                        <p className="text-[9px] text-gray-500 uppercase">
                          軌道位置 (Orbit Position)
                        </p>
                        <p className="text-xs font-bold text-white mt-0.5">
                          {(data?.macro.streams?.lunarTide?.distanceCloseness ??
                            0) > 0.7
                            ? "近地点 (PERIGEE)"
                            : "遠地点 (APOGEE)"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[8px] text-gray-500 font-mono text-right mt-4">
                  Epoch: UTC2026
                </div>
              </div>

              {/* Micro biometrics card */}
              <div className="md:col-span-2 p-6 rounded-[2rem] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 backdrop-blur-md flex flex-col justify-between shadow-xl">
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-emerald-500/10 pb-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20">
                      <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-emerald-100">
                        バイオテレメトリ (Oura Biometrics)
                      </h3>
                      <p className="text-[9px] text-emerald-500/80">
                        マイクロレベル自律神経負荷と生体パラメーターストリーム
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        心拍変動 (Heart Rate Variability - HRV)
                      </p>
                      <div className="flex justify-between items-baseline mt-1.5">
                        <span className="text-2xl font-black text-white">
                          {data.micro.hrv}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium">
                          最適 (Optimal)
                        </span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${data.micro.hrv}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                        睡眠回復指標 (Sleep Quality Index - GSR)
                      </p>
                      <div className="flex justify-between items-baseline mt-1.5">
                        <span className="text-2xl font-black text-white">
                          {data.micro.gsr}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium">
                          良好 (Recharged)
                        </span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${data.micro.gsr}%` }}
                        />
                      </div>
                    </div>

                    {data.micro.ansLoad !== undefined && (
                      <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                          自律神経ストレス負荷 (ANS Load)
                        </p>
                        <div className="flex justify-between items-baseline mt-1.5">
                          <span className="text-2xl font-black text-white">
                            {data.micro.ansLoad.toFixed(0)}
                          </span>
                          <span
                            className={`text-[10px] font-medium ${data.micro.ansLoad > 60 ? "text-red-400" : "text-amber-400"}`}
                          >
                            {data.micro.ansLoad > 60
                              ? "上昇 (Elevated)"
                              : "中程度 (Moderate)"}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full ${data.micro.ansLoad > 60 ? "bg-red-400" : "bg-amber-400"}`}
                            style={{ width: `${data.micro.ansLoad}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-[8px] text-gray-500 font-mono text-right mt-4">
                  Oura連携アクティブ
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "matrix" && (
            <motion.div
              key="matrix"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              {/* Matrix Introduction Section */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border border-white/10 backdrop-blur-md text-xs md:text-sm text-gray-300 leading-relaxed shadow-lg">
                <p className="font-bold text-white mb-2 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  西洋・東洋の「占術・易学・算術」の関係性（宇宙・環境のモデリングアプローチ）
                </p>
                <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
                  これらのシステムは、
                  <strong>「何を観測して変化を予測するか」</strong>
                  というロジックの違いによって、大きく3つのグループに分類されます。宇宙や人間の状態を多角的にモデリングし、それぞれのAPIから取得したリアルタイムデータを統合して意思決定エンジンへフィードします。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-[11px] text-gray-400 border-t border-white/5 pt-3">
                  <div>
                    <span className="font-bold text-indigo-300 block mb-1">
                      【A. 天体観測系】
                    </span>
                    実際の空 of
                    星や計算上の天体配置（アスペクト等）から環境ステータスを座標軸として読み解きます。（DivineAPI
                    / AstrologyAPI / VedAstro）
                  </div>
                  <div>
                    <span className="font-bold text-amber-300 block mb-1">
                      【B. 暦・数理サイクル系】
                    </span>
                    星を直接見ず、時間そのものが持つ周期（十干十二支・九星・数秘等）の干渉パターンを計算式で測ります。（Luck
                    Pillars / Chinese Metasoft / KlavisAI MCP / DivineAPI）
                  </div>
                  <div>
                    <span className="font-bold text-purple-300 block mb-1">
                      【C. 偶然・シンクロ系】
                    </span>
                    偶然起きた出来事に全体の状況が縮小投影される「共時性（シンクロニシティ）」の原理に基づき変化の相を特定します。（RoxyAPI
                    / strobus/i-ching / DivineAPI）
                  </div>
                </div>
              </div>

              {/* Three Column Matrix Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                {/* Column A: Astronomical Observation */}
                <div className="p-6 rounded-[2rem] bg-gradient-to-b from-indigo-500/10 to-transparent border border-indigo-500/20 backdrop-blur-md flex flex-col justify-between shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Orbit className="w-32 h-32 text-indigo-400" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 mb-4 border-b border-indigo-500/25 pb-3">
                      <div className="p-1.5 rounded-lg bg-indigo-500/20">
                        <Orbit className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-indigo-100">
                          A. 天体観測系
                        </h3>
                        <p className="text-[9px] text-indigo-300">
                          実在の星の軌道と角度をモデル化
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Western Transits */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex justify-between items-baseline mb-2">
                          <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest flex items-center gap-1">
                            <Compass className="w-3 h-3" /> 西洋占星術 (Western
                            Transits)
                          </p>
                          <span className="text-[8px] text-gray-500">
                            {data.macro.streams?.metaphysical?.astrologyApi?.sourceInfo?.split(
                              " ",
                            )[0] || "AstrologyAPI"}
                          </span>
                        </div>
                        <div className="text-xs space-y-1 max-h-[100px] overflow-y-auto pr-1 custom-scrollbar">
                          {data.macro.streams?.metaphysical?.astrologyApi
                            ?.aspects ? (
                            data?.macro.streams?.metaphysical?.astrologyApi?.aspects?.map(
                              (asp, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between items-center text-gray-300 py-0.5"
                                >
                                  <span>{asp.aspect}</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                      asp.quality === "harmonious"
                                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/25"
                                        : asp.quality === "discordant"
                                          ? "bg-red-500/20 text-red-400 border border-red-500/25"
                                          : "bg-white/5 text-gray-400"
                                    }`}
                                  >
                                    {asp.quality === "harmonious"
                                      ? "調和 (吉)"
                                      : asp.quality === "discordant"
                                        ? "不調和 (凶)"
                                        : "中立"}
                                  </span>
                                </div>
                              ),
                            )
                          ) : (
                            <p className="text-gray-500 italic">
                              アスペクトデータを読み込み中...
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Vedic Astrology (VedAstro) */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex justify-between items-baseline mb-2">
                          <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest flex items-center gap-1">
                            <Star className="w-3 h-3" /> インド占星術 (Jyotish)
                          </p>
                          <span className="text-[8px] text-gray-500">
                            VedAstro MCP
                          </span>
                        </div>
                        <div className="space-y-2.5 text-xs text-gray-300">
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase">
                              現在のアクティブなダシャー周期 (Active Dasha)
                            </span>
                            <span className="font-bold text-white">
                              {data?.macro?.streams?.metaphysical?.vedAstro
                                ?.activeDasha ?? "Jupiter-Saturn"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase">
                              惑星の強さ (Shadbala)
                            </span>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1 text-[10px]">
                              {Object.entries(
                                data?.macro?.streams?.metaphysical?.vedAstro
                                  ?.planetaryStrengths || {},
                              ).map(([planet, val]) => (
                                <div
                                  key={planet}
                                  className="flex items-center justify-between"
                                >
                                  <span className="text-gray-400">
                                    {planet}
                                  </span>
                                  <span className="font-mono text-indigo-300 font-bold">
                                    {(val as number).toFixed(2)}x
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Zi Wei Dou Shu (紫微斗数) */}
                      {data?.macro?.streams?.metaphysical?.ziWeiDouShu && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex justify-between items-baseline mb-2">
                            <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest flex items-center gap-1">
                              <Star className="w-3 h-3" /> 紫微斗数 (Zi Wei Dou
                              Shu)
                            </p>
                            <span className="text-[8px] text-gray-500">
                              Calendar Stars
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs text-gray-300">
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                命宮 (Self Palace)
                              </span>
                              <span className="font-bold text-white text-[10px] truncate max-w-[120px]">
                                {
                                  data.macro.streams.metaphysical.ziWeiDouShu.selfPalaceStar?.split(
                                    " ",
                                  )[0]
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                身宮 (Body Palace)
                              </span>
                              <span className="font-bold text-white text-[10px] truncate max-w-[120px]">
                                {
                                  data.macro.streams.metaphysical.ziWeiDouShu.bodyPalaceStar?.split(
                                    " ",
                                  )[0]
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                飛星 (Active Flying Star)
                              </span>
                              <span className="text-indigo-300 font-bold text-[10px]">
                                {
                                  data.macro.streams.metaphysical.ziWeiDouShu.activeFlyingStar?.split(
                                    " ",
                                  )[0]
                                }
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-400 italic mt-1 border-t border-white/5 pt-1">
                              {
                                data.macro.streams.metaphysical.ziWeiDouShu
                                  .dailyInsight
                              }
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Human Design (ヒューマンデザイン) */}
                      {data.macro.streams?.metaphysical?.humanDesign && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex justify-between items-baseline mb-2">
                            <p className="text-[10px] text-indigo-400 uppercase font-bold tracking-widest flex items-center gap-1">
                              <Layers className="w-3 h-3" /> ヒューマンデザイン
                              (Human Design)
                            </p>
                            <span className="text-[8px] text-gray-500">
                              Synthesis Engine
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs text-gray-300">
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                タイプとプロファイル
                              </span>
                              <span className="font-bold text-white text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical?.humanDesign
                                    ?.chartType
                                }{" "}
                                (
                                {
                                  data?.macro.streams?.metaphysical?.humanDesign
                                    ?.profile
                                }
                                )
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                権威 (Authority)
                              </span>
                              <span className="text-indigo-300 font-bold text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical?.humanDesign
                                    ?.authority
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                アクティブチャネル
                              </span>
                              <span className="text-white font-mono text-[10px]">
                                {data?.macro.streams?.metaphysical?.humanDesign?.activeChannels?.join(
                                  ", ",
                                )}
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-400 italic mt-1 border-t border-white/5 pt-1">
                              ゲート:{" "}
                              {
                                data?.macro.streams?.metaphysical?.humanDesign
                                  ?.dailyGateActivation
                              }
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setShowVedic(!showVedic)}
                    className="w-full mt-4 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-2.5 cursor-pointer shadow-inner"
                  >
                    <span>インド占星術詳細レポート (Vedic Jyotish)</span>
                    {showVedic ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Column B: Calendar & Mathematical Cycles */}
                <div className="p-6 rounded-[2rem] bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20 backdrop-blur-md flex flex-col justify-between shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Layers className="w-32 h-32 text-amber-400" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 mb-4 border-b border-amber-500/25 pb-3">
                      <div className="p-1.5 rounded-lg bg-amber-500/20">
                        <Layers className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-amber-100">
                          B. 暦・数理サイクル系
                        </h3>
                        <p className="text-[9px] text-amber-300">
                          時間周期・数理振動数から環境変数を計算
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Bazi Luck Pillars & Day Master */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex justify-between items-baseline mb-2">
                          <p className="text-[10px] text-amber-400 uppercase font-bold tracking-widest flex items-center gap-1">
                            <Flame className="w-3 h-3" /> 四柱推命 / 大運 (BaZi
                            / Luck Pillars)
                          </p>
                          <span className="text-[8px] text-gray-500">
                            Luck Pillars / KlavisAI MCP
                          </span>
                        </div>
                        <div className="space-y-2 text-xs text-gray-300">
                          <div className="flex justify-between items-baseline">
                            <span className="text-gray-500 text-[9px] uppercase">
                              日主 (Day Master)
                            </span>
                            <span className="font-bold text-white text-sm bg-white/5 px-2 py-0.5 rounded border border-white/5">
                              {data.macro.streams?.personalBazi?.summary
                                ?.dayMaster
                                ? `${data.macro.streams.personalBazi.summary.dayMaster} (${data.macro.streams.personalBazi.summary.dayMasterWuxing}) - ${data.macro.streams.personalBazi.summary.strength}`
                                : "庚金 (Yang Metal) - Strong"}
                            </span>
                          </div>

                          {data.macro.streams?.metaphysical?.chineseMetasoft
                            ?.daYunPillar ? (
                            <div>
                              <span className="text-gray-500 block text-[9px] uppercase mb-1">
                                現在の大運 (Active Luck Pillar)
                              </span>
                              <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                                <div className="flex justify-between font-bold text-white">
                                  <span>
                                    {
                                      data?.macro.streams?.metaphysical
                                        ?.chineseMetasoft?.daYunPillar?.pillar
                                    }
                                  </span>
                                  <span>
                                    年齢:{" "}
                                    {
                                      data?.macro.streams?.metaphysical
                                        ?.chineseMetasoft?.daYunPillar?.startAge
                                    }
                                    -
                                    {
                                      data?.macro.streams?.metaphysical
                                        ?.chineseMetasoft?.daYunPillar?.endAge
                                    }
                                  </span>
                                </div>
                                <p className="text-[9px] text-gray-400 mt-1">
                                  {
                                    data?.macro.streams?.metaphysical
                                      ?.chineseMetasoft?.daYunPillar
                                      ?.description
                                  }
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-[10px]">
                              Natal Luck Cycle computed locally.
                            </p>
                          )}

                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase mb-1">
                              奇門遁甲 アクティブな門
                            </span>
                            <div className="flex justify-between items-center p-2 rounded-lg bg-white/5 border border-white/5">
                              <div>
                                <span className="font-bold text-white">
                                  {data.macro.streams?.metaphysical
                                    ?.chineseMetasoft?.qiMenGate?.name ??
                                    "生門 (Sheng Men)"}
                                </span>
                                <span className="text-[9px] text-gray-400 ml-1.5">
                                  方位:{" "}
                                  {data.macro.streams?.metaphysical
                                    ?.chineseMetasoft?.qiMenGate?.direction ??
                                    "NE"}
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                                  data.macro.streams?.metaphysical
                                    ?.chineseMetasoft?.qiMenGate?.status ===
                                  "Auspicious"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : data.macro.streams?.metaphysical
                                          ?.chineseMetasoft?.qiMenGate
                                          ?.status === "Inauspicious"
                                      ? "bg-red-500/20 text-red-400"
                                      : "bg-white/5 text-gray-400"
                                }`}
                              >
                                {data.macro.streams?.metaphysical
                                  ?.chineseMetasoft?.qiMenGate?.status ??
                                  "Auspicious"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Western Numerology */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex justify-between items-baseline mb-2">
                          <p className="text-[10px] text-amber-400 uppercase font-bold tracking-widest flex items-center gap-1">
                            <Award className="w-3 h-3" /> 数秘術 (Numerology)
                          </p>
                          <span className="text-[8px] text-gray-500">
                            DivineAPI
                          </span>
                        </div>
                        <div className="text-xs text-gray-300">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-gray-500 text-[9px] uppercase">
                              ライフパスナンバー
                            </span>
                            <span className="text-lg font-black text-amber-400 font-mono">
                              {data.macro.streams?.metaphysical?.divineApi
                                ?.numerology?.lifePathNumber ?? "8"}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-relaxed">
                            {data.macro.streams?.metaphysical?.divineApi
                              ?.numerology?.description ??
                              "The Achiever - Ambition, material success, authority, and karma."}
                          </p>
                        </div>
                      </div>

                      {/* Nine Star Ki (九星気学) */}
                      {data.macro.streams?.metaphysical?.nineStarKi && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex justify-between items-baseline mb-2">
                            <p className="text-[10px] text-amber-400 uppercase font-bold tracking-widest flex items-center gap-1">
                              <Layers className="w-3 h-3" /> 九星気学 (Nine Star
                              Ki)
                            </p>
                            <span className="text-[8px] text-gray-500">
                              9-Cycle Magic Square
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs text-gray-300">
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                年盤 / 月盤
                              </span>
                              <span className="font-bold text-white text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical?.nineStarKi?.yearStar?.split(
                                    " ",
                                  )[0]
                                }{" "}
                                /{" "}
                                {
                                  data?.macro.streams?.metaphysical?.nineStarKi?.monthStar?.split(
                                    " ",
                                  )[0]
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                日盤
                              </span>
                              <span className="text-amber-300 font-bold text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical?.nineStarKi?.dayStar?.split(
                                    " ",
                                  )[0]
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                現在の方位
                              </span>
                              <span className="text-white font-medium text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical?.nineStarKi
                                    ?.magicSquareLocation
                                }
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-400 italic mt-1 border-t border-white/5 pt-1 leading-normal">
                              {
                                data?.macro.streams?.metaphysical?.nineStarKi
                                  ?.dailyDirectionSafety
                              }
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Maya Calendar (マヤ暦) */}
                      {data.macro.streams?.metaphysical?.mayaTzolkin && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex justify-between items-baseline mb-2">
                            <p className="text-[10px] text-amber-400 uppercase font-bold tracking-widest flex items-center gap-1">
                              <Moon className="w-3 h-3" /> マヤ暦
                              (Tzolk&apos;in)
                            </p>
                            <span className="text-[8px] text-gray-500">
                              Sacred 260 Kin
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs text-gray-300">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500 text-[9px]">
                                キンナンバー
                              </span>
                              <span className="text-base font-black text-amber-400 font-mono">
                                Kin{" "}
                                {
                                  data?.macro.streams?.metaphysical?.mayaTzolkin
                                    ?.kinNumber
                                }
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500 text-[9px]">
                                太陽の紋章 (Solar Seal)
                              </span>
                              <span className="font-bold text-white flex items-center gap-1 text-[10px]">
                                <span className="text-sm">
                                  {
                                    data?.macro.streams?.metaphysical
                                      ?.mayaTzolkin?.solarSeal?.glyph
                                  }
                                </span>
                                {
                                  data?.macro.streams?.metaphysical?.mayaTzolkin
                                    ?.solarSeal?.name
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                銀河の音 (Galactic Tone)
                              </span>
                              <span className="text-white font-medium text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical?.mayaTzolkin
                                    ?.galacticTone?.tone
                                }{" "}
                                (
                                {
                                  data?.macro.streams?.metaphysical?.mayaTzolkin
                                    ?.galacticTone?.name
                                }
                                )
                              </span>
                            </div>
                            <p className="text-[9px] text-gray-400 leading-normal border-t border-white/5 pt-1">
                              {
                                data?.macro.streams?.metaphysical?.mayaTzolkin
                                  ?.galacticTone?.power
                              }
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Kabbalah Tree of Life (生命の樹) */}
                      {data.macro.streams?.metaphysical?.kabbalahTree && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex justify-between items-baseline mb-2">
                            <p className="text-[10px] text-amber-400 uppercase font-bold tracking-widest flex items-center gap-1">
                              <Award className="w-3 h-3" /> カバラ (生命の樹)
                            </p>
                            <span className="text-[8px] text-gray-500">
                              Resonance Path
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs text-gray-300">
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                アクティブ・セフィラ
                              </span>
                              <span className="font-bold text-white text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical
                                    ?.kabbalahTree?.activeSephirah
                                }
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500 text-[9px]">
                                共鳴のパス (Path of Resonance)
                              </span>
                              <span className="text-amber-300 font-bold text-[10px]">
                                {
                                  data?.macro.streams?.metaphysical
                                    ?.kabbalahTree?.pathOfResonance
                                }
                              </span>
                            </div>

                            <div>
                              <div className="flex justify-between text-[9px] text-gray-500 mb-1">
                                <span>共鳴強度 (Resonance Intensity)</span>
                                <span className="text-white font-bold">
                                  {
                                    data?.macro.streams?.metaphysical
                                      ?.kabbalahTree?.dailyVibrationScore
                                  }
                                  %
                                </span>
                              </div>
                              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-400"
                                  style={{
                                    width: `${data?.macro.streams?.metaphysical?.kabbalahTree?.dailyVibrationScore ?? 0}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <p className="text-[9px] text-gray-400 italic mt-1 border-t border-white/5 pt-1 leading-normal">
                              {
                                data?.macro.streams?.metaphysical?.kabbalahTree
                                  ?.insight
                              }
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-4">
                    <button
                      onClick={() => setShowNatalBazi(!showNatalBazi)}
                      className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-2.5 cursor-pointer shadow-inner"
                    >
                      <span>ネイタル四柱推命詳細レポート</span>
                      {showNatalBazi ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setShowEnvBazi(!showEnvBazi)}
                      className="w-full py-2 rounded-xl bg-amber-500/5 hover:bg-amber-500/15 border border-white/5 text-gray-300 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-2.5 cursor-pointer shadow-inner"
                    >
                      <span>トランジット四柱推命詳細レポート</span>
                      {showEnvBazi ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Column C: Synchronicity & Coincidence */}
                <div className="p-6 rounded-[2rem] bg-gradient-to-b from-purple-500/10 to-transparent border border-purple-500/20 backdrop-blur-md flex flex-col justify-between shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Compass className="w-32 h-32 text-purple-400" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 mb-4 border-b border-purple-500/25 pb-3">
                      <div className="p-1.5 rounded-lg bg-purple-500/20">
                        <Compass className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-purple-100">
                          C. 偶然・シンクロ系
                        </h3>
                        <p className="text-[9px] text-purple-300">
                          共時性の原理を基に「変化のフェーズ」を特定
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Roxy I-Ching Casting */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex justify-between items-baseline mb-2">
                          <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest mb-2 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> 易経 (I-Ching Casting)
                          </p>
                          <span className="text-[8px] text-gray-500">
                            RoxyAPI / strobus/i-ching
                          </span>
                        </div>

                        {data.macro.streams?.metaphysical?.roxyApi
                          ?.ichingCast ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-start gap-4">
                              <div className="space-y-1.5 flex flex-col justify-center items-center py-1">
                                {data?.macro.streams?.metaphysical?.roxyApi?.ichingCast?.lines
                                  ?.slice()
                                  ?.reverse()
                                  ?.map((line, idx) => {
                                    // 6 lines drawn from top to bottom
                                    const keyIdx = 5 - idx;
                                    const isChanging =
                                      data?.macro.streams?.metaphysical?.roxyApi?.ichingCast?.changingLines?.includes(
                                        keyIdx + 1,
                                      );
                                    const isYang = line === 7 || line === 9;

                                    return (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2"
                                      >
                                        {isYang ? (
                                          <div
                                            className={`w-14 h-2 bg-indigo-400 rounded-sm relative ${isChanging ? "shadow-[0_0_8px_rgba(239,68,68,0.7)] bg-rose-400" : "shadow-[0_0_5px_rgba(129,140,248,0.4)]"}`}
                                          />
                                        ) : (
                                          <div className="w-14 h-2 flex justify-between">
                                            <div
                                              className={`w-[45%] h-full bg-indigo-500/60 rounded-sm ${isChanging ? "bg-rose-500/60 shadow-[0_0_5px_rgba(239,68,68,0.4)]" : ""}`}
                                            />
                                            <div
                                              className={`w-[45%] h-full bg-indigo-500/60 rounded-sm ${isChanging ? "bg-rose-500/60 shadow-[0_0_5px_rgba(239,68,68,0.4)]" : ""}`}
                                            />
                                          </div>
                                        )}
                                        {isChanging && (
                                          <span className="text-[7px] text-red-400 font-black">
                                            ●
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>

                              <div className="flex-1 space-y-1">
                                <span className="text-gray-500 block text-[9px] uppercase">
                                  得卦 (Cast Hexagram)
                                </span>
                                <span className="font-bold text-white block truncate text-[10px]">
                                  {
                                    data?.macro.streams?.metaphysical?.roxyApi
                                      ?.ichingCast?.name
                                  }
                                </span>
                                {data?.macro.streams?.metaphysical?.roxyApi
                                  ?.ichingCast?.relatingHexagram && (
                                  <div className="mt-1">
                                    <span className="text-gray-500 text-[8px] block uppercase">
                                      之卦/変卦 (Relating)
                                    </span>
                                    <span className="text-gray-300 block text-[9px] truncate">
                                      {
                                        data?.macro.streams?.metaphysical
                                          ?.roxyApi?.ichingCast
                                          ?.relatingHexagram?.name
                                      }
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <p className="text-[9px] text-gray-400 leading-normal p-2 rounded bg-black/30 border border-white/5 italic">
                              {
                                data?.macro.streams?.metaphysical?.roxyApi
                                  ?.ichingCast?.interpretation
                              }
                            </p>
                          </div>
                        ) : (
                          <p className="text-gray-500 italic">
                            Cast data unavailable.
                          </p>
                        )}
                      </div>

                      {/* Tarot card container */}
                      <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col">
                        <div className="flex justify-between items-baseline mb-2">
                          <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest mb-3 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> タロット展開 (Tarot
                            Draw)
                          </p>
                          <span className="text-[8px] text-gray-500">
                            DivineAPI
                          </span>
                        </div>

                        {data?.macro.streams?.metaphysical?.divineApi?.tarot ? (
                          <div className="flex items-center gap-4">
                            <motion.div
                              whileHover={{ rotateY: 15, scale: 1.05 }}
                              style={{ perspective: 600 }}
                              className="w-16 h-28 shrink-0 rounded-lg bg-gradient-to-b from-indigo-950 via-purple-950 to-black border-2 border-amber-500/40 flex flex-col items-center justify-between p-2 text-center shadow-lg cursor-default relative overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent opacity-75" />
                              <span className="text-[6px] text-amber-500/70 font-extrabold uppercase tracking-widest">
                                {
                                  data?.macro.streams?.metaphysical?.divineApi
                                    ?.tarot?.arcana
                                }
                              </span>
                              <div className="p-1 rounded-full bg-white/5 border border-white/10">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                              </div>
                              <span className="text-[8px] font-black text-white leading-tight break-words truncate w-full">
                                {
                                  data?.macro.streams?.metaphysical?.divineApi
                                    ?.tarot?.name
                                }
                              </span>
                              <span className="text-[6px] text-gray-400 truncate w-full">
                                {
                                  data?.macro.streams?.metaphysical?.divineApi
                                    ?.tarot?.orientation
                                }
                              </span>
                            </motion.div>

                            <div className="flex-1 space-y-1">
                              <span className="text-gray-500 block text-[9px] uppercase">
                                カードの意味 (Draw Meaning)
                              </span>
                              <p className="text-[10px] text-gray-300 leading-normal font-medium">
                                {
                                  data?.macro.streams?.metaphysical?.divineApi
                                    ?.tarot?.meaning
                                }
                              </p>

                              <div className="mt-2.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-extrabold border ${
                                    (data?.macro.streams?.metaphysical
                                      ?.divineApi?.tarot?.riskModifier ?? 0) < 0
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-red-500/10 text-red-400 border-red-500/20"
                                  }`}
                                >
                                  <Shield className="w-2.5 h-2.5" />
                                  Q-Mod:{" "}
                                  {(data?.macro.streams?.metaphysical?.divineApi
                                    ?.tarot?.riskModifier ?? 0) > 0
                                    ? "+"
                                    : ""}
                                  {
                                    data?.macro.streams?.metaphysical?.divineApi
                                      ?.tarot?.riskModifier
                                  }
                                  % Risk
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500 italic">
                            Tarot draw loading...
                          </p>
                        )}
                      </div>

                      {/* Geomancy (ジオマンシー / 土占い) */}
                      {data.macro.streams?.metaphysical?.geomancy && (
                        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                          <div className="flex justify-between items-baseline mb-2">
                            <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest flex items-center gap-1">
                              <Compass className="w-3 h-3" /> ジオマンシー
                              (Geomancy)
                            </p>
                            <span className="text-[8px] text-gray-500">
                              Medieval 16 Figures Cast
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex flex-col items-center gap-1 bg-black/60 p-2 rounded border border-white/10 w-12 shrink-0 py-2">
                              {data?.macro.streams?.metaphysical?.geomancy?.binaryPoints?.map(
                                (val, idx) => (
                                  <div
                                    key={idx}
                                    className="flex justify-center gap-1 h-2 items-center"
                                  >
                                    {val === 1 ? (
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_4px_rgba(192,132,252,0.8)]" />
                                    ) : (
                                      <>
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/80" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/80" />
                                      </>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>

                            <div className="flex-1 space-y-1">
                              <div className="flex justify-between items-baseline">
                                <span className="font-bold text-white text-[12px]">
                                  {
                                    data?.macro.streams?.metaphysical?.geomancy
                                      ?.figureName
                                  }
                                </span>
                                <span className="text-[8px] text-purple-300 uppercase px-1 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                                  {
                                    data?.macro.streams?.metaphysical?.geomancy
                                      ?.element
                                  }
                                </span>
                              </div>
                              <span className="text-gray-500 block text-[9px] uppercase text-[9px]">
                                Astro:{" "}
                                {
                                  data?.macro.streams?.metaphysical?.geomancy
                                    ?.astrologicalAssociation
                                }
                              </span>
                              <p className="text-[9px] text-gray-400 italic leading-normal border-t border-white/5 pt-1">
                                {
                                  data?.macro.streams?.metaphysical?.geomancy
                                    ?.interpretation
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-10 mt-4 flex items-center justify-end text-[8px] text-gray-500 uppercase tracking-widest font-bold font-mono">
                    Synchronicity engine: ONLINE
                  </div>
                </div>
              </div>

              {/* Detailed Collapsible Reports */}
              {data.macro.streams?.personalBazi && showNatalBazi && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md overflow-hidden shadow-xl"
                >
                  <BaziReport 
                    data={data.macro.streams.personalBazi} 
                    title="四柱推命 精密命式分析 (ネイタル)"
                  />
                </motion.div>
              )}

              {data.macro.streams?.environmentalBazi && showEnvBazi && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md overflow-hidden shadow-xl"
                >
                  <BaziReport 
                    data={data.macro.streams.environmentalBazi} 
                    title="四柱推命 精密命式分析 (環境・トランジット)"
                  />
                </motion.div>
              )}

              {data.macro.streams?.vedicAstrology && showVedic && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md overflow-hidden shadow-xl"
                >
                  <VedicReport data={data.macro.streams.vedicAstrology} />
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "engine" && (
            <motion.div
              key="engine"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[minmax(180px,auto)]"
            >
              {/* Suggested Action Card - Spans 2 cols, 2 rows */}
              <div className="md:col-span-2 md:row-span-2 p-8 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 backdrop-blur-md relative overflow-hidden shadow-xl flex flex-col justify-between group">
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-25 transition-all duration-500">
                  <Compass
                    className="w-36 h-36 text-indigo-400 rotate-12"
                    strokeWidth={1}
                  />
                </div>

                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-4 border border-indigo-500/30">
                      計算された支配的ポリシー (Calculated Dominant Policy)
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-tight">
                      {data.nba.actionResult.suggestedAction ===
                        "PREPARE_AND_WAIT" &&
                      data.nba.actionResult.expectedReward < 0
                        ? "警戒待機（マイナス回避）"
                        : data.nba.actionResult.suggestedAction.replace(
                            /_/g,
                            " ",
                          )}
                    </h2>

                    {/* Action Alignment Indicator Widget */}
                    {alignment && (
                      <div
                        className={`mt-3 p-3.5 rounded-2xl border text-[11px] leading-relaxed backdrop-blur-sm shadow-sm ${
                          alignment.status === "error"
                            ? "bg-red-950/20 text-red-300 border-red-500/30"
                            : alignment.status === "warning"
                              ? "bg-amber-950/20 text-amber-300 border-amber-500/30"
                              : "bg-emerald-950/20 text-emerald-300 border-emerald-500/20"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold mb-1">
                          {alignment.status === "error" && (
                            <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                          )}
                          {alignment.status === "warning" && (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          )}
                          {alignment.status === "success" && (
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          )}
                          <span>
                            アクション目的整合性:{" "}
                            {alignment.status === "success"
                              ? "整合中 (Aligned)"
                              : "ミスマッチ (Mismatch)"}
                          </span>
                        </div>
                        <p className="opacity-90">{alignment.message}</p>
                      </div>
                    )}

                    {/* Q-Value and Probability Distribution Matrix */}
                    <div className="mt-6 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 backdrop-blur-sm shadow-inner">
                      <div className="flex justify-between items-end mb-3">
                        <h4 className="text-[10px] text-indigo-300 uppercase font-bold tracking-widest flex items-center gap-2">
                          <BrainCircuit className="w-3.5 h-3.5" />{" "}
                          行動ポリシー選択確率マトリクス
                        </h4>
                        <span className="text-[8px] text-indigo-400/70 font-mono">
                          Q = 期待報酬 / PROB = 選択確率
                        </span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(
                          data.nba.actionResult.probabilities || {},
                        )
                          .sort(([, a], [, b]) => b - a)
                          .map(([action, prob]) => {
                            const qValue =
                              data.nba.actionResult.qValues?.[action] ?? 0;
                            const isMax =
                              prob ===
                              Math.max(
                                ...Object.values(
                                  data.nba.actionResult.probabilities || {},
                                ),
                              );
                            const isDeactivated = qValue <= -900;
                            return (
                              <div
                                key={action}
                                className={`p-2 rounded-xl transition-all ${isMax ? "bg-white/5 border border-white/10 shadow-sm" : "bg-transparent border border-transparent"}`}
                              >
                                <div className="flex justify-between items-center text-[10px] font-mono mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={
                                        isMax
                                          ? "text-white font-bold tracking-wide"
                                          : "text-gray-400"
                                      }
                                    >
                                      {action.replace("_", " ")}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${isDeactivated ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse" : qValue > 0 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : qValue < 0 ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-gray-500/20 text-gray-400 border border-gray-500/30"}`}
                                    >
                                      {isDeactivated
                                        ? "Q: DEACTIVATED (天中殺)"
                                        : `Q: ${qValue > 0 ? "+" : ""}${qValue.toFixed(3)}`}
                                    </span>
                                  </div>
                                  <span
                                    className={
                                      isMax
                                        ? "text-emerald-400 font-bold text-xs"
                                        : "text-gray-400"
                                    }
                                  >
                                    {(prob * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden flex">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${prob * 100}%` }}
                                    className={`h-full rounded-full ${isMax ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-indigo-500/50"}`}
                                    transition={{
                                      duration: 0.8,
                                      ease: "easeOut",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
                      <p className="text-gray-400 text-xs uppercase font-medium mb-1">
                        確信度 (Confidence)
                      </p>
                      <p className="text-2xl font-bold text-emerald-400">
                        {(data.nba.actionResult.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
                      <p className="text-gray-400 text-xs uppercase font-medium mb-1">
                        ポリシーの種類 (Policy Type)
                      </p>
                      <p className="text-lg font-medium text-blue-300">
                        {data.nba.actionResult.policyType.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* State Vector Details */}
              <div className="md:col-span-2 p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-3">
                    <div className="p-1.5 rounded-lg bg-blue-500/20">
                      <Shield className="w-4 h-4 text-blue-400" />
                    </div>
                    <h3 className="font-bold text-sm text-blue-100">
                      FQI 状態ベクトルパラメーター (State Vector)
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 overflow-hidden">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                        ANS自律神経負荷
                      </p>
                      <p className="text-lg font-mono font-black text-white">
                        {Number(data.nba.stateVector.ansLoad).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 overflow-hidden">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                        シールド容量 (睡眠スコア)
                      </p>
                      <p className="text-lg font-mono font-black text-white">
                        {Number(data.nba.stateVector.shieldCapacity).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 overflow-hidden">
                      <p className="text-[10px] text-orange-500/70 uppercase font-bold tracking-wider mb-1">
                        環境リスクスコア (Risk)
                      </p>
                      <p className="text-lg font-mono font-black text-white">
                        {Number(
                          data.nba.stateVector.environmentalRisk || 50,
                        ).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 overflow-hidden">
                      <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                        太陽黄経位相 (Solar Phase)
                      </p>
                      <p className="text-lg font-mono font-black text-white">
                        {Number(data.nba.stateVector.solarPhase).toFixed(2)}°
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/30 border border-white/5 mt-4 flex justify-between items-center text-xs">
                  <span className="text-gray-400">
                    期待されるポリシー報酬 (Expected Reward)
                  </span>
                  <span
                    className={`font-mono font-bold ${data.nba.actionResult.expectedReward < 0 ? "text-red-400" : "text-emerald-400"}`}
                  >
                    {data.nba.actionResult.expectedReward > 0 ? "+" : ""}
                    {data.nba.actionResult.expectedReward.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Sigmoid Gating Thresholds Card */}
              <div className="md:col-span-1 p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/20">
                      <Activity className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h3 className="font-bold text-sm text-emerald-100">
                      シグモイド活性化ゲート
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {/* ANS Stress Gate */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-400 text-[10px]">
                          ANS負荷ゲート
                        </span>
                        <span className="font-mono text-[10px] text-gray-300">
                          {(data.nba.actionResult.sigmoidGates
                            ?.ansStressGate !== undefined
                            ? data.nba.actionResult.sigmoidGates.ansStressGate *
                              100
                            : 0
                          ).toFixed(0)}
                          %
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${data.nba.stateVector.ansLoad >= 65 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" : "bg-emerald-500"}`}
                          style={{ width: `${data.nba.stateVector.ansLoad}%` }}
                        />
                        <div
                          className="absolute left-[65%] top-0 w-0.5 h-full bg-red-400/80"
                          title="閾値 65%"
                        />
                      </div>
                      <div className="flex justify-between items-center text-[8px] text-gray-500 mt-1 font-mono">
                        <span>
                          負荷:{" "}
                          {Number(data.nba.stateVector.ansLoad).toFixed(0)}%
                        </span>
                        <span
                          className={
                            data.nba.stateVector.ansLoad >= 65
                              ? "text-red-400 font-bold"
                              : "text-gray-500"
                          }
                        >
                          閾値: 65%
                        </span>
                      </div>
                    </div>

                    {/* Shield Vulnerability Gate */}
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-400 text-[10px]">
                          シールド脆弱性ゲート
                        </span>
                        <span className="font-mono text-[10px] text-gray-300">
                          {(data.nba.actionResult.sigmoidGates
                            ?.shieldVulnerabilityGate !== undefined
                            ? data.nba.actionResult.sigmoidGates
                                .shieldVulnerabilityGate * 100
                            : 0
                          ).toFixed(0)}
                          %
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${100 - data.nba.stateVector.shieldCapacity >= 70 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" : "bg-emerald-500"}`}
                          style={{
                            width: `${100 - data.nba.stateVector.shieldCapacity}%`,
                          }}
                        />
                        <div
                          className="absolute left-[70%] top-0 w-0.5 h-full bg-red-400/80"
                          title="閾値 70%"
                        />
                      </div>
                      <div className="flex justify-between items-center text-[8px] text-gray-500 mt-1 font-mono">
                        <span>
                          脆弱性:{" "}
                          {(100 - data.nba.stateVector.shieldCapacity).toFixed(
                            0,
                          )}
                          %
                        </span>
                        <span
                          className={
                            100 - data.nba.stateVector.shieldCapacity >= 70
                              ? "text-red-400 font-bold"
                              : "text-gray-500"
                          }
                        >
                          閾値: 70%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[9px] text-gray-400/80 bg-black/20 p-1.5 rounded-xl border border-white/5">
                  {data.nba.stateVector.ansLoad >= 65 ||
                  100 - data.nba.stateVector.shieldCapacity >= 70 ? (
                    <span className="text-red-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />{" "}
                      ストレス閾値突破
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />{" "}
                      自律神経安定
                    </span>
                  )}
                </div>
              </div>

              {/* LLM Self-Attention Heatmap Card */}
              <div className="md:col-span-1 p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                    <div className="p-1.5 rounded-lg bg-indigo-500/20">
                      <BrainCircuit className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h3 className="font-bold text-sm text-indigo-100">
                      自己アテンション行列
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-7 gap-1 text-[8px] font-mono text-gray-500 text-center font-bold">
                      <div>Q \ K</div>
                      <div title="Year Star">年星</div>
                      <div title="Month Star">月星</div>
                      <div title="Day Star">日星</div>
                      <div title="Lunar Phase">月相</div>
                      <div title="Space Kp">宇宙</div>
                      <div title="VIX Risk">リスク</div>
                    </div>

                    {["本命", "月命", "日主"].map((queryName, qIdx) => {
                      const rowWeights = data.nba.actionResult
                        .attentionMatrix?.[qIdx] || [
                        0.16, 0.16, 0.16, 0.16, 0.16, 0.17,
                      ];
                      return (
                        <div
                          key={qIdx}
                          className="grid grid-cols-7 gap-1 items-center"
                        >
                          <div className="text-[9px] font-bold text-gray-400 font-mono text-left truncate">
                            {queryName}
                          </div>
                          {rowWeights.map((weight, kIdx) => {
                            const opacity = Math.min(1.0, weight * 4.5);
                            const isHigh = weight > 0.22;
                            return (
                              <div
                                key={kIdx}
                                className={`h-6 rounded flex items-center justify-center text-[8px] font-mono font-bold transition-all relative group ${isHigh ? "text-white border border-indigo-400/40 shadow-[0_0_8px_rgba(99,102,241,0.4)]" : "text-gray-300"}`}
                                style={{
                                  backgroundColor: `rgba(99, 102, 241, ${opacity})`,
                                }}
                                title={`Query: ${queryName}, Key: ${kIdx}, Weight: ${(weight * 100).toFixed(1)}%`}
                              >
                                {(weight * 100).toFixed(0)}%
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2 text-[8px] text-gray-500 font-mono text-center">
                  Softmax(QKᵀ / √d_k) 特徴量相関
                </div>
              </div>

              {/* 1-Year Forecast Simulation */}
              <div className="md:col-span-4 p-6 rounded-[2rem] bg-indigo-900/20 border border-indigo-500/20 backdrop-blur-md shadow-xl mt-2">
                <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-indigo-500/20">
                      <CalendarDays className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h3 className="font-bold text-sm text-indigo-100">
                      1年間の最適行動予測 (1-Year Action Forecast)
                    </h3>
                  </div>
                  <div className="ml-auto flex flex-col items-end">
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded">
                      ※現在のシールド値を基準とした予測
                    </span>
                  </div>
                </div>

                <div className="mb-6 p-3 rounded-xl bg-black/30 border border-white/5 text-xs text-gray-300 leading-relaxed">
                  <p className="font-bold text-indigo-300 mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />{" "}
                    シールド値（防御力）と計算ロジックについて
                  </p>
                  <p>
                    このエンジンでは、
                    <strong>「シールド（精神的・肉体的・資金的余裕）」</strong>
                    が最も重要なリソースとして計算されます。
                    通常時、移住（実行前進）にはシールドを
                    <span className="text-red-400">約15%</span>
                    消費しますが、天中殺などの悪環境下での強行（浄化移住）には
                    <span className="text-red-400">約40%</span>
                    のシールドを消費するモデリングになっています。
                    <br />
                    つまり、どんなに星回りが悪くても
                    <strong>
                      「シールドがほぼMAXであれば、ダメージを吸収して行動可能」
                    </strong>
                    とAIは判断し、逆にシールドが枯渇していると、平時であっても「待機・回復」を強制指示します。
                  </p>
                </div>

                <div className="h-64 w-full mt-4 relative">
                  {forecastLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 rounded-xl">
                      <RefreshCcw className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                      <p className="text-xs text-indigo-300">
                        天体・暦推移をシミュレーション中...
                      </p>
                    </div>
                  ) : forecastData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={forecastData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorEnv"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#f87171"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="#f87171"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.05)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          stroke="rgba(255,255,255,0.3)"
                          fontSize={10}
                          tickMargin={10}
                        />
                        <YAxis
                          stroke="rgba(255,255,255,0.3)"
                          fontSize={10}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          content={({ active, payload, label }: any) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-black/80 border border-white/10 p-3 rounded-xl backdrop-blur-md shadow-xl text-xs">
                                  <p className="font-bold text-white mb-2 border-b border-white/10 pb-1">
                                    {label}{" "}
                                    <span className="text-gray-500 font-mono text-[9px] ml-1">
                                      {new Date(
                                        payload[0].payload.date,
                                      ).toLocaleDateString()}
                                    </span>
                                  </p>
                                  <div className="flex items-center justify-between gap-4 mb-1">
                                    <span className="text-emerald-400 font-bold">
                                      シールド予測残量:
                                    </span>
                                    <span className="text-white font-mono">
                                      {payload[1].value.toFixed(0)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 mb-2">
                                    <span className="text-red-400 font-bold">
                                      環境負荷コスト:
                                    </span>
                                    <span className="text-white font-mono">
                                      {payload[0].value.toFixed(0)}
                                    </span>
                                  </div>
                                  <div className="bg-white/5 p-1.5 rounded text-center">
                                    <span className="text-indigo-300 font-bold">
                                      AI推奨: {payload[0].payload.action}
                                    </span>
                                  </div>
                                  {payload[0].payload.isVoidTime && (
                                    <div className="mt-1 text-center">
                                      <span className="text-red-400 text-[9px] font-bold">
                                        ⚠️ 天中殺/空亡期間
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <ReferenceLine
                          y={50}
                          stroke="rgba(255,255,255,0.1)"
                          strokeDasharray="3 3"
                        />
                        <Area
                          type="monotone"
                          dataKey="envCost"
                          stroke="#f87171"
                          fillOpacity={1}
                          fill="url(#colorEnv)"
                          name="環境負荷コスト"
                        />
                        <Line
                          type="monotone"
                          dataKey="shield"
                          stroke="#34d399"
                          strokeWidth={3}
                          dot={{
                            r: 4,
                            fill: "#34d399",
                            stroke: "#000",
                            strokeWidth: 2,
                          }}
                          activeDot={{ r: 6 }}
                          name="シールド予測残量"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                      データがありません
                    </div>
                  )}
                </div>
              </div>

              {/* Token Generation Console */}
              {data.nba.actionResult.llmPredictionTrace && (
                <div className="md:col-span-4 p-6 rounded-[2rem] bg-[#0c0c0e] border border-zinc-800/80 backdrop-blur-md shadow-2xl mt-2 relative overflow-hidden group">
                  {/* Console Header */}
                  <div className="absolute top-0 left-0 right-0 h-8 bg-zinc-950 border-b border-zinc-800/80 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/80" />
                      <div className="w-2 h-2 rounded-full bg-amber-500/80" />
                      <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
                      <span className="text-[10px] text-zinc-500 font-mono ml-2">
                        decision_transformer_inference.log
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400 font-mono animate-pulse">
                        ● ACTIVE
                      </span>
                      <BrainCircuit className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                  </div>

                  <div className="mt-4 pt-2">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10">
                        <TerminalSquare className="w-4 h-4 text-emerald-400" />
                      </div>
                      <h3 className="font-bold text-sm text-zinc-300">
                        Decision Transformer Token Trace (意思決定トークン推移)
                      </h3>
                    </div>
                    <div className="bg-black/95 rounded-xl p-4 font-mono text-xs text-emerald-400/95 overflow-y-auto max-h-[200px] border border-zinc-900 shadow-inner custom-scrollbar relative">
                      {data.nba.actionResult.llmPredictionTrace.map(
                        (trace: string, idx: number) => {
                          let lineClass = "mb-1 last:mb-0 leading-relaxed";
                          if (trace.includes("Prediction")) {
                            lineClass +=
                              " text-cyan-400 font-bold border-l-2 border-cyan-500 pl-2 bg-cyan-950/20 py-0.5 my-1 rounded-r";
                          } else if (
                            trace.includes("Gate") &&
                            trace.includes("activated at")
                          ) {
                            const hasStress =
                              trace.includes("ANS") &&
                              parseFloat(trace.match(/[\d\.]+/)?.[1] || "0") >=
                                65;
                            const hasVuln =
                              trace.includes("Shield") &&
                              parseFloat(trace.match(/[\d\.]+/)?.[1] || "0") >=
                                70;
                            if (hasStress || hasVuln) {
                              lineClass +=
                                " text-red-400 font-bold border-l-2 border-red-500 pl-2 bg-red-950/10 py-0.5 my-1 rounded-r";
                            }
                          }
                          return (
                            <div key={idx} className={lineClass}>
                              <span className="text-zinc-700 select-none mr-2 font-bold">
                                {String(idx + 1).padStart(2, "0")}
                              </span>
                              {trace}
                            </div>
                          );
                        },
                      )}
                      <div className="flex items-center mt-1 text-emerald-400/50">
                        <span className="text-zinc-700 select-none mr-2 font-bold">
                          {String(
                            data.nba.actionResult.llmPredictionTrace.length + 1,
                          ).padStart(2, "0")}
                        </span>
                        <span>$ await next best action token...</span>
                        <span className="w-1.5 h-3.5 bg-emerald-400/80 ml-1 animate-ping" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* System Logic Trace (因果推論ログ) */}
              {data.nba.actionResult.logicTrace && (
                <div className="md:col-span-4 p-6 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-md shadow-xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 rounded-lg bg-gray-500/20">
                      <TerminalSquare className="w-4 h-4 text-gray-400" />
                    </div>
                    <h3 className="font-bold text-sm text-gray-100">
                      System Logic Trace (因果推論ログ)
                    </h3>
                  </div>
                  <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-green-400/80 overflow-y-auto max-h-[220px] custom-scrollbar border border-white/5 shadow-inner">
                    {data.nba.actionResult.logicTrace.map(
                      (log: string, idx: number) => (
                        <div
                          key={idx}
                          className="mb-1.5 last:mb-0 break-all leading-relaxed"
                        >
                          <span className="text-gray-600 select-none mr-2 font-bold">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          {log}
                        </div>
                      ),
                    )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/5">
                    <CytoscapeNetwork nbaData={data.nba} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      ) : null}
    </div>
  );
}

"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Compass,
  Plus,
  Trash2,
  Save,
  AlertTriangle,
  MapPin,
  HelpCircle,
  ChevronRight,
  Info,
  Clock,
  Sparkles,
  Users,
  UserPlus,
  Sliders,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  getCurrentEnvironmentalFrequencies,
  generateBoard,
  calculateVectorCollision,
  getPersonalVoidZodiac,
  getHonmeiStar,
  filterCollisionByMode,
  getClassicalYearStar,
  Direction,
} from "@/utils/ephemerisEngine";
import { getKigakuSector } from "@/utils/kigakuUtils";
import { TenChiJinEvaluation } from "@/components/nba/TenChiJinEvaluation";
import {
  MetaphysicalConfigBar,
  MetaphysicalConfig,
} from "@/components/layout/MetaphysicalConfigBar";
import { formatShortStayBaseMessage } from "@/lib/relocationPresentation";
import { directionLabelDetailed } from "@/lib/directionLabels";
import { directionUnstableNote } from "@/lib/directionDistance";
import { distanceKmBetween } from "@/utils/directionGeo";
import { SimulatorStart } from "@/components/relocation/SimulatorStart";
import { FavoritePicker } from "@/components/relocation/FavoritePicker";
import { ratingForStatus } from "@/lib/verdictRating";
import { isValidIsoDate } from "@/utils/dateValidation";
import { toJapanDateString } from "@/utils/japanDate";
import type { MetaphysicalData } from "@/utils/metaphysicalApis";
import {
  readLocalSettings,
  SETTINGS_KEY,
  type Settings,
} from "@/lib/userSettings";

// Dynamically import Leaflet map to disable SSR
const SimulatorMap = dynamic(() => import("@/components/nba/SimulatorMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-stone-50/60 border border-stone-200 rounded-[2.5rem] flex items-center justify-center font-mono text-xs text-stone-600 backdrop-blur-md">
      [ INITIALIZING MAP ENGINE... ]
    </div>
  ),
});

interface SimulatorStep {
  fromName: string;
  fromLat: number;
  fromLon: number;
  toName: string;
  toLat: number;
  toLon: number;
  departureDate: string;
  purpose: "MIGRATION" | "TRAVEL";
  notes: string | null;
  companionIds?: string[];
  evaluation?: {
    status: string;
    rating: string;
    color: string;
    score: number;
    details: {
      yearLayer: string;
      monthLayer: string;
      dayLayer: string;
    };
  };
  memberEvaluations?: Array<{
    memberId: string;
    name: string;
    status: string;
    rating: string;
    color: string;
  }>;
  /** 出発地からの距離（km）。方位がどれだけ当てになるかを言うのに使う。 */
  distanceKm?: number;
  /** 近すぎて方位が定まらないときの一文。定まる距離なら null。 */
  directionNote?: string | null;
}

interface SavedPlan {
  id: string;
  name: string;
  /**
   * 保存時は { steps, members } を書くが、members を持たない旧形式の
   * プランは配列がそのまま入っている。読む側で両対応する。
   */
  steps:
    | SimulatorStep[]
    | { steps: SimulatorStep[]; members?: AccompanyingMember[] };
  updatedAt: string;
}

/**
 * /api/relocation/nba-evaluate が日付ごとに返す評価。応答の全部ではなく、
 * この画面が実際に読む項目だけを写している（#149 の方針）。
 * metaphysical は API が utils/metaphysicalApis の MetaphysicalData を
 * そのまま入れて返すので、既存の型を使う（似た型を新しく作らない）。
 */
interface NbaDateEvaluation {
  date: string;
  qValue: number;
  suggestedAction: string;
  riskFactors: string[];
  metaphysical: MetaphysicalData | null;
}

interface AccompanyingMember {
  id: string;
  name: string;
  birthDate: string;
}

const candidates = [
  { name: "福井県敦賀周辺", lat: 35.645, lon: 136.055 },
  { name: "滋賀県大津周辺", lat: 35.017, lon: 135.854 },
  { name: "三重県桑名周辺", lat: 35.067, lon: 136.683 },
  { name: "静岡県浜松周辺", lat: 34.71, lon: 137.727 },
  { name: "長野県飯田周辺", lat: 35.518, lon: 137.821 },
  { name: "福井県福井市周辺", lat: 36.065, lon: 136.221 },
  { name: "石川県金沢周辺", lat: 36.561, lon: 136.656 },
  { name: "岐阜県高山周辺", lat: 36.14, lon: 137.251 },
  { name: "兵庫県姫路周辺", lat: 34.815, lon: 134.685 },
  { name: "和歌山県田辺周辺", lat: 33.729, lon: 135.378 },
];

function parseSafeDate(
  dateStr: string | null | undefined,
  fallback: Date = new Date(),
): Date {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d;
  }
  return fallback;
}

function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2) ||
    lat1 === null ||
    lon1 === null ||
    lat2 === null ||
    lon2 === null ||
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined
  ) {
    return 0;
  }
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = (theta * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function bearingToDirection(
  bearing: number,
  useClassical: boolean = false,
): Direction {
  return getKigakuSector(bearing, useClassical);
}

const dirOpposites: Record<string, string> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
  NE: "SW",
  SW: "NE",
  NW: "SE",
  SE: "NW",
};

function getDirAngleRanges(
  useClassical: boolean = false,
): Record<string, [number, number]> {
  if (useClassical) {
    return {
      N: [345, 15],
      NE: [15, 75],
      E: [75, 105],
      SE: [105, 165],
      S: [165, 195],
      SW: [195, 255],
      W: [255, 285],
      NW: [285, 345],
    };
  } else {
    return {
      N: [337.5, 22.5],
      NE: [22.5, 67.5],
      E: [67.5, 112.5],
      SE: [112.5, 157.5],
      S: [157.5, 202.5],
      SW: [202.5, 247.5],
      W: [247.5, 292.5],
      NW: [292.5, 337.5],
    };
  }
}

function intersectRays(
  lat1: number,
  lon1: number,
  bearing1: number,
  lat2: number,
  lon2: number,
  bearing2: number,
): [number, number] | null {
  const y1 = lat1;
  const x1 = lon1;
  const y2 = lat2;
  const x2 = lon2;

  const b1Rad = (bearing1 * Math.PI) / 180;
  const b2Rad = (bearing2 * Math.PI) / 180;

  const sin1 = Math.sin(b1Rad);
  const cos1 = Math.cos(b1Rad);
  const sin2 = Math.sin(b2Rad);
  const cos2 = Math.cos(b2Rad);

  const denom = sin2 * cos1 - cos2 * sin1;
  if (Math.abs(denom) < 1e-6) return null;

  const t2 = ((x2 - x1) * cos1 - (y2 - y1) * sin1) / denom;
  const t1 = ((x2 - x1) * cos2 - (y2 - y1) * sin2) / denom;

  if (t1 <= 0 || t2 <= 0) return null;
  if (t1 > 5.0 || t2 > 5.0) return null;

  const lat = y1 + t1 * cos1;
  const lon = x1 + t1 * sin1;
  return [lat, lon];
}

/**
 * 「先に例で動きを見る」で使う生年月日。
 *
 * ここには運営者の生年月日が入っていた。公開リポジトリなので、
 * 個人の生年月日と出生時刻がそのまま読める状態でもあった。
 * 例に必要なのは「何か 1 つ日付が入っていること」だけなので、
 * 例だと分かる日付に置き換える。
 */
const EXAMPLE_BIRTH_DATE = "1990-01-01T12:00";

/**
 * 「先に例で動きを見る」の出発地、および座標が壊れていたときの落とし先。
 *
 * ここには運営者の自宅（町丁名と 4 桁の座標＝およそ 10m）が入っていた。
 * 公開リポジトリなので、住所がそのまま読める状態でもあった。例に必要
 * なのは「どこか 1 地点」だけなので、公共の目印（京都駅のあたり）に置く。
 */
const EXAMPLE_START = {
  name: "京都市下京区",
  lat: 34.9858,
  lon: 135.7588,
};

export default function RelocationSimulatorPage() {
  // Global Profile Defaults
  //
  // 生年月日に既定値を置かない。入口（SimulatorStart）を通るか、
  // 例を開くか、保存済みの設定が読めたときにだけ入る。
  const [birthDate, setBirthDate] = useState("");
  const [startLat, setStartLat] = useState(EXAMPLE_START.lat);
  const [startLon, setStartLon] = useState(EXAMPLE_START.lon);
  const [startName, setStartName] = useState(EXAMPLE_START.name);

  // Accompanying Members
  const [members, setMembers] = useState<AccompanyingMember[]>([]);
  const validMembers = useMemo(
    () => members.filter((member) => isValidIsoDate(member.birthDate)),
    [members],
  );

  // Telemetry simulation state sliders
  const [simulatedAns, setSimulatedAns] = useState(20); // ANS load (0-100)
  const [simulatedShield, setSimulatedShield] = useState(80); // Shield capacity (0-100)

  // Simulation Steps
  const [steps, setSteps] = useState<SimulatorStep[]>([
    {
      fromName: EXAMPLE_START.name,
      fromLat: EXAMPLE_START.lat,
      fromLon: EXAMPLE_START.lon,
      toName: "愛知県名古屋市",
      toLat: 35.1815,
      toLon: 136.9064,
      departureDate: "2026-06-30",
      purpose: "MIGRATION",
      notes: "一時赴任",
    },
  ]);

  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(0);
  /**
   * この人が自分で何か入れたか。
   *
   * false のあいだは判定を出さない。steps の初期値は例（京都市 → 名古屋市）
   * で、birthDate の初期値は運営者の生年月日なので、そのまま判定を出すと
   * 「本命星 3・総合シンクロ指数 76/100・安心して実行してください」が、
   * 何も入れていない人の画面に出る。実際に本番でそう出ていた。
   *
   * 下書きが復元できたか、入口で入力したか、例を見ると押したときに true。
   */
  const [hasOwnInput, setHasOwnInput] = useState(false);
  /**
   * 下書きから計画を戻したか。
   *
   * 生年月日だけが足りなくて入口に戻ってもらった人の計画を、
   * 入口の送信で消さないために見る。
   */
  const restoredDraftRef = useRef(false);
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  /**
   * ★ から目的地を選ぶ一覧を、どの段で開いているか。
   * 段ごとに目的地が違うので、1 つの真偽値では足りない。
   */
  const [favoritePickerStep, setFavoritePickerStep] = useState<number | null>(
    null,
  );
  const [planName, setPlanName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [plansRequireLogin, setPlansRequireLogin] = useState(false);

  // Metaphysical Engine Global Configuration States
  const [useClassical, setUseClassical] = useState(true);
  const [physicalMonthMode, setPhysicalMonthMode] = useState<
    "coupled" | "independent"
  >("independent");
  const [directionFilterMode, setDirectionFilterMode] = useState<
    "composite" | "personal_kigaku" | "personal_bazi" | "environmental"
  >("composite");
  const [actionIntent, setActionIntent] = useState<
    "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION"
  >("DEFAULT");

  // NBA Evaluations from server evaluation endpoint
  const [nbaEvaluations, setNbaEvaluations] = useState<
    Record<string, NbaDateEvaluation>
  >({});
  const [isEvaluatingNba, setIsEvaluatingNba] = useState(false);

  // Portal Sync State
  const [portalSpaceWeather, setPortalSpaceWeather] = useState<{
    kpIndex: number | null;
    xrayFlux: string | null;
    solarWindSpeed: number | null;
    timestamp: string | null;
  } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncingPortal, setIsSyncingPortal] = useState(false);

  // Load configuration and cached drafts on mount
  useEffect(() => {
    fetchUserConfig();
    fetchSavedPlans();
    loadDraft();

    // Listen to updates from other pages / config bars
    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MetaphysicalConfig>;
      if (customEvent.detail) {
        setUseClassical(customEvent.detail.useClassicalBoard);
        if (customEvent.detail.physicalMonthMode !== undefined)
          setPhysicalMonthMode(customEvent.detail.physicalMonthMode);
        setDirectionFilterMode(customEvent.detail.directionFilterMode);
        setActionIntent(customEvent.detail.actionIntent);
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
  }, []);

  // Parse URL search parameters on load to pre-populate simulator inputs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    const dirParam = params.get("direction");
    const bearingParam = params.get("bearing");
    const toLatParam = params.get("toLat");
    const toLonParam = params.get("toLon");
    const toNameParam = params.get("toName");

    if (
      dateParam ||
      dirParam ||
      bearingParam ||
      toLatParam ||
      toLonParam ||
      toNameParam
    ) {
      const updatedSteps = [...steps];
      if (dateParam) {
        updatedSteps[0].departureDate = dateParam;
      }

      let bearingVal = 0;
      let hasTarget = false;
      if (bearingParam) {
        bearingVal = parseFloat(bearingParam);
        hasTarget = true;
      } else if (dirParam) {
        const dirAngles: Record<string, number> = {
          N: 0,
          NE: 45,
          E: 90,
          SE: 135,
          S: 180,
          SW: 225,
          W: 270,
          NW: 315,
        };
        bearingVal = dirAngles[dirParam.toUpperCase()] ?? 0;
        hasTarget = true;
      }

      if (toLatParam && toLonParam) {
        updatedSteps[0].toLat = parseFloat(toLatParam);
        updatedSteps[0].toLon = parseFloat(toLonParam);
        updatedSteps[0].toName = toNameParam || "指定された目的地";
      } else if (hasTarget) {
        // Approximate coordinates (0.9 degrees is roughly 100km distance)
        const rad = (bearingVal * Math.PI) / 180;
        updatedSteps[0].toLat = startLat + Math.cos(rad) * 0.9;
        updatedSteps[0].toLon = startLon + Math.sin(rad) * 0.9;
        updatedSteps[0].toName = `${bearingToDirection(bearingVal, useClassical)}方面の目的地`;
      }

      setSteps(updatedSteps);
      saveDraft(
        updatedSteps,
        startLat,
        startLon,
        startName,
        useTrueNorth,
        planName,
        members,
      );
    }
  }, [startLat, startLon]);

  const fetchUserConfig = async () => {
    try {
      const res = await fetch("/api/user-config");
      if (res.ok) {
        const config = await res.json();
        if (config.birth_date) setBirthDate(config.birth_date);
        if (config.base_lat !== undefined) setStartLat(config.base_lat);
        if (config.base_lon !== undefined) setStartLon(config.base_lon);
        if (config.use_true_north !== undefined)
          setUseTrueNorth(config.use_true_north);
        if (config.use_classical_board !== undefined)
          setUseClassical(config.use_classical_board);
        if (config.physical_month_mode !== undefined)
          setPhysicalMonthMode(config.physical_month_mode);
        if (config.direction_filter_mode !== undefined)
          setDirectionFilterMode(config.direction_filter_mode);
        if (config.action_intent !== undefined)
          setActionIntent(config.action_intent);
      }
    } catch (e) {
      console.error("Failed to load user config:", e);
    }
  };

  const fetchSavedPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const res = await fetch("/api/relocation/simulation");
      if (res.status === 401) {
        setPlans([]);
        setPlansRequireLogin(true);
        return;
      }
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setPlans(result.data);
          setPlansRequireLogin(false);
        }
      }
    } catch (e) {
      console.error("Failed to fetch simulation plans:", e);
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const loadDraft = () => {
    const saved = localStorage.getItem("relocation_simulator_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.startLat !== undefined) setStartLat(draft.startLat);
        if (draft.startLon !== undefined) setStartLon(draft.startLon);
        if (draft.startName !== undefined) setStartName(draft.startName);
        if (draft.steps && Array.isArray(draft.steps)) setSteps(draft.steps);
        if (draft.useTrueNorth !== undefined)
          setUseTrueNorth(draft.useTrueNorth);
        if (draft.planName !== undefined) setPlanName(draft.planName);
        if (draft.members && Array.isArray(draft.members))
          setMembers(draft.members);
        restoredDraftRef.current = true;
        // 生年月日が下書きに入っているときだけ、判定まで戻す。
        //
        // 既定値を外す前は保存していなかった。その頃の下書きを復元すると
        // 生年月日だけが空になり、parseSafeDate が「今日生まれ」に落として
        // 根拠の無い本命星を出す。入口をもう一度通してもらう。計画そのものは
        // 上で復元済みなので、聞くのは 3 つだけ。
        if (typeof draft.birthDate === "string" && draft.birthDate) {
          setBirthDate(draft.birthDate);
          // 前回の続きがあるなら、それはこの人が入れたもの。
          setHasOwnInput(true);
        }
      } catch {}
    }
  };

  const saveDraft = (
    updatedSteps: SimulatorStep[],
    sLat = startLat,
    sLon = startLon,
    sName = startName,
    uTrue = useTrueNorth,
    pName = planName,
    updatedMembers = members,
    bDate = birthDate,
  ) => {
    localStorage.setItem(
      "relocation_simulator_draft",
      JSON.stringify({
        startLat: sLat,
        startLon: sLon,
        startName: sName,
        steps: updatedSteps,
        useTrueNorth: uTrue,
        planName: pName,
        members: updatedMembers,
        birthDate: bDate,
      }),
    );
  };

  // Compute Personal Hardware baseline metrics
  const birthDateObj = parseSafeDate(birthDate);
  const voidZodiacs = getPersonalVoidZodiac(birthDateObj);
  const honmeiStar = getHonmeiStar(birthDateObj);
  const personalStar = useClassical
    ? honmeiStar.classical
    : honmeiStar.physical;

  // Evaluation pipeline with Base Shifting State Machine
  const evaluatedSteps = useMemo(() => {
    let currentBaseLat =
      isNaN(startLat) || startLat === null || startLat === undefined
        ? EXAMPLE_START.lat
        : startLat;
    let currentBaseLon =
      isNaN(startLon) || startLon === null || startLon === undefined
        ? EXAMPLE_START.lon
        : startLon;
    let currentBaseName = startName || "起点";

    const list: SimulatorStep[] = [];

    steps.forEach((step, idx) => {
      const depDate = parseSafeDate(step.departureDate);
      const targetLat =
        isNaN(step.toLat) || step.toLat === null || step.toLat === undefined
          ? EXAMPLE_START.lat
          : step.toLat;
      const targetLon =
        isNaN(step.toLon) || step.toLon === null || step.toLon === undefined
          ? EXAMPLE_START.lon
          : step.toLon;

      const rawBearing = getBearing(
        currentBaseLat,
        currentBaseLon,
        targetLat,
        targetLon,
      );
      // 判定は真北。記事・物件検索・履歴・地図の扇形と同じ基準に揃える。
      const direction = bearingToDirection(rawBearing, useClassical);

      // 近すぎる移動では、方位が「実際にどう動いたか」より「ピンをどこに
      // 置いたか」で決まる。1km なら 414m ずれれば方位が隣に変わる。
      // 判定は従来どおり出したうえで、当てにならない距離だと画面に添える。
      const distanceKm = distanceKmBetween(
        currentBaseLat,
        currentBaseLon,
        targetLat,
        targetLon,
      );

      // Metaphysical Evaluation
      const env = getCurrentEnvironmentalFrequencies(
        depDate,
        currentBaseLon,
        physicalMonthMode,
      );
      const yearBoard = generateBoard(
        useClassical ? env.classicalYearStar : env.yearStar,
      );
      const monthBoard = generateBoard(
        useClassical ? env.classicalMonthStar : env.monthStar,
      );
      const dayBoard = generateBoard(
        useClassical ? env.classicalDayStar : env.dayStar,
      );

      const evalIntent =
        actionIntent !== "DEFAULT"
          ? actionIntent
          : step.purpose === "MIGRATION"
            ? "MIGRATION"
            : "DEFAULT";
      const collision = calculateVectorCollision(
        personalStar,
        yearBoard,
        monthBoard,
        dayBoard,
        voidZodiacs,
        env.raw.lunarNode,
        evalIntent,
        depDate,
        currentBaseLon,
      );

      const filteredCollision = filterCollisionByMode(
        collision,
        personalStar,
        null,
        voidZodiacs,
        directionFilterMode,
        yearBoard,
        monthBoard,
        dayBoard,
      );

      const finalStatus = filteredCollision.finalVectors[direction] || "SAFE";

      // 6 語への畳み方は @/lib/verdictRating に集約した。ここと
      // api/relocation/history が同じ switch を写しで持っており、
      // どちらも本命殺を「凶」、天中殺方位を「大凶」と、凶の唯一の定義
      // （utils/noiseSeverity）と逆向きに重み付けしていた。
      const ratingInfo = ratingForStatus(finalStatus);

      let stayDuration = 999;
      if (idx < steps.length - 1) {
        const nextDep = parseSafeDate(steps[idx + 1].departureDate, depDate);
        const diffMs = nextDep.getTime() - depDate.getTime();
        stayDuration = Math.round(diffMs / (1000 * 60 * 60 * 24));
      }

      // Precompute companion metrics (Only evaluated if companion is selected for this step)
      const stepCompanionIds = step.companionIds || [];
      const activeMembers = validMembers.filter((m) =>
        stepCompanionIds.includes(m.id),
      );

      const mEvals = activeMembers.map((m) => {
        const mBirthDate = parseSafeDate(m.birthDate);
        const mPersonalStar = getClassicalYearStar(mBirthDate);
        const mVoidZodiacs = getPersonalVoidZodiac(mBirthDate);

        const mCollision = calculateVectorCollision(
          mPersonalStar,
          yearBoard,
          monthBoard,
          dayBoard,
          mVoidZodiacs,
          env.raw.lunarNode,
          step.purpose === "MIGRATION" ? "MIGRATION" : "DEFAULT",
          depDate,
          currentBaseLon,
        );

        const mStatus = mCollision.finalVectors[direction] || "SAFE";

        let mRating = "普通";
        let mColor = "text-stone-500 border-stone-200/80 bg-stone-100/80";
        if (mStatus === "OPTIMAL") {
          mRating = "大吉";
          mColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        } else if (mStatus === "OPTIMAL_REGULAR") {
          mRating = "吉";
          mColor = "text-emerald-500/80 border-emerald-500/20 bg-emerald-500/5";
        } else if (
          [
            "NOISE_HONMEI",
            "NOISE_TEKI",
            "NOISE_GETSUMEI",
            "NOISE_GETSUTEKI",
            "NOISE_NODE",
          ].includes(mStatus)
        ) {
          mRating = "凶";
          mColor = "text-orange-400 border-orange-500/20 bg-orange-500/5";
        } else if (
          ["NOISE_VOID", "NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(
            mStatus,
          )
        ) {
          mRating = "大凶";
          mColor = "text-red-400 border-red-500/30 bg-red-500/10";
        }

        return {
          memberId: m.id,
          name: m.name,
          status: mStatus,
          rating: mRating,
          color: mColor,
        };
      });

      const evaluatedStepObj: SimulatorStep = {
        ...step,
        fromName: currentBaseName,
        fromLat: currentBaseLat,
        fromLon: currentBaseLon,
        evaluation: {
          status: finalStatus,
          rating: ratingInfo.rating,
          color: ratingInfo.color,
          score: ratingInfo.score,
          details: {
            yearLayer: filteredCollision.yearLayer[direction] || "SAFE",
            monthLayer: filteredCollision.monthLayer[direction] || "SAFE",
            dayLayer: filteredCollision.dayLayer[direction] || "SAFE",
          },
        },
        distanceKm,
        directionNote: directionUnstableNote(distanceKm),
        memberEvaluations: mEvals,
      };

      list.push(evaluatedStepObj);

      if (step.purpose === "MIGRATION" && stayDuration >= 75) {
        currentBaseLat = step.toLat;
        currentBaseLon = step.toLon;
        currentBaseName = step.toName;
      }
    });

    return list;
  }, [
    steps,
    startLat,
    startLon,
    startName,
    personalStar,
    voidZodiacs,
    useClassical,
    physicalMonthMode,
    directionFilterMode,
    actionIntent,
    validMembers,
  ]);

  // Keep a ref of nbaEvaluations to avoid stale closure in useEffect without infinite loops
  const nbaEvaluationsRef = React.useRef(nbaEvaluations);
  useEffect(() => {
    nbaEvaluationsRef.current = nbaEvaluations;
  }, [nbaEvaluations]);

  // Clear evaluation cache when baseline parameters change
  useEffect(() => {
    setNbaEvaluations({});
  }, [birthDate, simulatedAns, simulatedShield]);

  // Fetch NBA timing and Q-value details dynamically (Delta / Diff Fetching)
  const fetchNbaEvaluations = async () => {
    if (steps.length === 0) return;

    const stepDates = steps.map((s) => s.departureDate);
    let candidateDates: string[] = [];
    if (activeStepIndex !== null && activeStepIndex < steps.length) {
      const activeStep = steps[activeStepIndex];
      const baseDate = parseSafeDate(activeStep.departureDate);
      candidateDates = [activeStep.departureDate];
      // Generate 7 weekly options (+7 to +49 days) for timing scan
      for (let i = 1; i <= 7; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i * 7);
        candidateDates.push(toJapanDateString(d));
      }
    }

    const allDates = Array.from(new Set([...stepDates, ...candidateDates]));

    // Only query dates that are NOT in the precomputed cache
    const neededDates = allDates.filter((d) => !nbaEvaluationsRef.current[d]);

    if (neededDates.length === 0) {
      return;
    }

    setIsEvaluatingNba(true);
    try {
      const res = await fetch("/api/relocation/nba-evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          dates: neededDates,
          lon: startLon,
          simulatedAns,
          simulatedShield,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const mapping: Record<string, NbaDateEvaluation> = {};
          result.data.forEach((item: NbaDateEvaluation) => {
            mapping[item.date] = item;
          });
          setNbaEvaluations((prev) => ({ ...prev, ...mapping }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch Q-value evaluations:", e);
    } finally {
      setIsEvaluatingNba(false);
    }
  };

  useEffect(() => {
    fetchNbaEvaluations();
  }, [steps, activeStepIndex, birthDate, simulatedAns, simulatedShield]);

  const syncWithPortal = async () => {
    setIsSyncingPortal(true);
    try {
      const res = await fetch("/api/nba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          lon: startLon,
          useClassical,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.data) {
          const { micro, macro } = result.data;
          if (micro) {
            if (micro.ansLoad !== undefined) setSimulatedAns(micro.ansLoad);
            if (micro.shieldCapacity !== undefined)
              setSimulatedShield(micro.shieldCapacity);
          }
          if (macro && macro.streams && macro.streams.spaceWeather) {
            setPortalSpaceWeather(macro.streams.spaceWeather);
          }
          setLastSyncTime(new Date().toLocaleTimeString());
        }
      } else {
        alert("ポータルからの同期に失敗しました。");
      }
    } catch (e) {
      console.error("Portal sync error:", e);
      alert("通信エラーが発生しました。");
    } finally {
      setIsSyncingPortal(false);
    }
  };

  // Compute timing recommendations (Time avoidance)
  const timingRecommendations = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= steps.length) return [];
    const activeStep = steps[activeStepIndex];
    const currentEval = nbaEvaluations[activeStep.departureDate];
    if (!currentEval) return [];

    const baseDate = parseSafeDate(activeStep.departureDate);
    const list = [];

    for (let i = 1; i <= 7; i++) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + i * 7);
      const dateStr = toJapanDateString(d);
      const ev = nbaEvaluations[dateStr];

      if (ev && ev.qValue > currentEval.qValue) {
        list.push({
          date: dateStr,
          qValue: ev.qValue,
          riskFactors: ev.riskFactors,
          diffDays: i * 7,
        });
      }
    }

    return list.sort((a, b) => b.qValue - a.qValue).slice(0, 3);
  }, [activeStepIndex, steps, nbaEvaluations]);

  // Compute Spatial Detour Recommendations
  const detourCandidates = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= evaluatedSteps.length)
      return [];
    const currentStep = evaluatedSteps[activeStepIndex];
    const rating = currentStep.evaluation?.rating;

    // Only suggest detours if direct route is inauspicious
    if (rating !== "凶" && rating !== "大凶") return [];

    const latA = currentStep.fromLat;
    const lonA = currentStep.fromLon;
    const latB = currentStep.toLat;
    const lonB = currentStep.toLon;

    const validCandidates: {
      name: string;
      lat: number;
      lon: number;
      score: number;
    }[] = [];

    candidates.forEach((cand) => {
      // 1. Check A -> C direction
      const rawBearingC = getBearing(latA, lonA, cand.lat, cand.lon);
      const dirC = bearingToDirection(rawBearingC, useClassical);

      // 2. Check C -> B direction
      const rawBearingB = getBearing(cand.lat, cand.lon, latB, lonB);
      const dirB = bearingToDirection(rawBearingB, useClassical);

      const envA = getCurrentEnvironmentalFrequencies(
        parseSafeDate(currentStep.departureDate),
        lonA,
        physicalMonthMode,
      );
      const yB_A = generateBoard(
        useClassical ? envA.classicalYearStar : envA.yearStar,
      );
      const mB_A = generateBoard(
        useClassical ? envA.classicalMonthStar : envA.monthStar,
      );
      const dB_A = generateBoard(
        useClassical ? envA.classicalDayStar : envA.dayStar,
      );

      const collisionC = calculateVectorCollision(
        personalStar,
        yB_A,
        mB_A,
        dB_A,
        voidZodiacs,
        envA.raw.lunarNode,
        "MIGRATION",
        parseSafeDate(currentStep.departureDate),
        lonA,
      );
      const filteredCollisionC = filterCollisionByMode(
        collisionC,
        personalStar,
        null,
        voidZodiacs,
        directionFilterMode,
        yB_A,
        mB_A,
        dB_A,
      );
      const statusC = filteredCollisionC.finalVectors[dirC] || "SAFE";

      const depDateB = parseSafeDate(currentStep.departureDate);
      depDateB.setDate(depDateB.getDate() + 75);
      const envC = getCurrentEnvironmentalFrequencies(
        depDateB,
        cand.lon,
        physicalMonthMode,
      );
      const yB_C = generateBoard(
        useClassical ? envC.classicalYearStar : envC.yearStar,
      );
      const mB_C = generateBoard(
        useClassical ? envC.classicalMonthStar : envC.monthStar,
      );
      const dB_C = generateBoard(
        useClassical ? envC.classicalDayStar : envC.dayStar,
      );

      const collisionB = calculateVectorCollision(
        personalStar,
        yB_C,
        mB_C,
        dB_C,
        voidZodiacs,
        envC.raw.lunarNode,
        "MIGRATION",
        depDateB,
        cand.lon,
      );
      const filteredCollisionB = filterCollisionByMode(
        collisionB,
        personalStar,
        null,
        voidZodiacs,
        directionFilterMode,
        yB_C,
        mB_C,
        dB_C,
      );
      const statusB = filteredCollisionB.finalVectors[dirB] || "SAFE";

      const isSafe = (status: string) =>
        ["SAFE", "OPTIMAL", "OPTIMAL_REGULAR"].includes(status);

      if (isSafe(statusC) && isSafe(statusB)) {
        const rateVal = (status: string) => {
          if (status === "OPTIMAL") return 100;
          if (status === "OPTIMAL_REGULAR") return 80;
          return 60;
        };
        validCandidates.push({
          name: cand.name,
          lat: cand.lat,
          lon: cand.lon,
          score: rateVal(statusC) + rateVal(statusB),
        });
      }
    });

    return validCandidates.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [
    activeStepIndex,
    evaluatedSteps,
    personalStar,
    voidZodiacs,
    useClassical,
    physicalMonthMode,
    directionFilterMode,
    actionIntent,
  ]);

  // Compute Kari-kippou Detour Polygons for drawing on map
  const detourPolygonsAndPrefectures = useMemo(() => {
    if (activeStepIndex === null || activeStepIndex >= evaluatedSteps.length) {
      return { polygons: [], recommendations: [] };
    }
    const currentStep = evaluatedSteps[activeStepIndex];
    const rating = currentStep.evaluation?.rating;

    if (rating !== "凶" && rating !== "大凶") {
      return { polygons: [], recommendations: [] };
    }

    const depDate = parseSafeDate(currentStep.departureDate);
    const env = getCurrentEnvironmentalFrequencies(
      depDate,
      currentStep.fromLon,
      physicalMonthMode,
    );
    const yearBoard = generateBoard(
      useClassical ? env.classicalYearStar : env.yearStar,
    );
    const monthBoard = generateBoard(
      useClassical ? env.classicalMonthStar : env.monthStar,
    );
    const dayBoard = generateBoard(
      useClassical ? env.classicalDayStar : env.dayStar,
    );

    const collision = calculateVectorCollision(
      personalStar,
      yearBoard,
      monthBoard,
      dayBoard,
      voidZodiacs,
      env.raw.lunarNode,
      "MIGRATION",
      depDate,
      currentStep.fromLon,
    );

    const filteredCollision = filterCollisionByMode(
      collision,
      personalStar,
      null,
      voidZodiacs,
      directionFilterMode,
      yearBoard,
      monthBoard,
      dayBoard,
    );

    const safeDirs: Direction[] = [];
    const directionsList: Direction[] = [
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SW",
      "W",
      "NW",
    ];
    directionsList.forEach((d) => {
      const status = filteredCollision.yearLayer[d] || "SAFE";
      if (
        status === "SAFE" ||
        status === "OPTIMAL" ||
        status === "OPTIMAL_REGULAR"
      ) {
        safeDirs.push(d);
      }
    });

    const polygons: [number, number][][] = [];
    const recommendedPrefectures = new Set<string>();

    const latA = currentStep.fromLat;
    const lonA = currentStep.fromLon;
    const latB = currentStep.toLat;
    const lonB = currentStep.toLon;

    const angleRanges = getDirAngleRanges(useClassical);

    safeDirs.forEach((d1) => {
      const rangeA = angleRanges[d1];
      if (!rangeA) return;
      const angleA1 = rangeA[0] % 360;
      const angleA2 = rangeA[1] % 360;

      safeDirs.forEach((d2) => {
        const d2Opp = dirOpposites[d2];
        const rangeB = angleRanges[d2Opp];
        if (!rangeB) return;
        const angleB1 = rangeB[0] % 360;
        const angleB2 = rangeB[1] % 360;

        const p1 = intersectRays(latA, lonA, angleA1, latB, lonB, angleB1);
        const p2 = intersectRays(latA, lonA, angleA1, latB, lonB, angleB2);
        const p3 = intersectRays(latA, lonA, angleA2, latB, lonB, angleB1);
        const p4 = intersectRays(latA, lonA, angleA2, latB, lonB, angleB2);

        const validPoints = [p1, p2, p3, p4].filter((p) => p !== null) as [
          number,
          number,
        ][];

        if (validPoints.length >= 3) {
          const centroid = validPoints
            .reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
            .map((v) => v / validPoints.length) as [number, number];
          validPoints.sort((a, b) => {
            const angle1 = Math.atan2(a[0] - centroid[0], a[1] - centroid[1]);
            const angle2 = Math.atan2(b[0] - centroid[0], b[1] - centroid[1]);
            return angle1 - angle2;
          });

          polygons.push(validPoints);

          candidates.forEach((cand) => {
            const bearingFromA = getBearing(latA, lonA, cand.lat, cand.lon);
            const dirFromA = bearingToDirection(bearingFromA, useClassical);

            const bearingToB = getBearing(cand.lat, cand.lon, latB, lonB);
            const dirToB = bearingToDirection(bearingToB, useClassical);

            if (dirFromA === d1 && dirToB === d2) {
              recommendedPrefectures.add(cand.name);
            }
          });
        }
      });
    });

    return { polygons, recommendations: Array.from(recommendedPrefectures) };
  }, [
    activeStepIndex,
    evaluatedSteps,
    personalStar,
    voidZodiacs,
    useClassical,
    physicalMonthMode,
    directionFilterMode,
    actionIntent,
  ]);

  // Compute Overall Plan Scorer (0-100)
  const overallPlanScore = useMemo(() => {
    if (evaluatedSteps.length === 0) return 0;

    let totalSpaceScore = 0;
    let totalEvaluationsCount = 0;

    evaluatedSteps.forEach((step) => {
      const rateToPoints = (rating: string) => {
        if (rating === "大吉") return 100;
        if (rating === "吉") return 80;
        if (rating === "凶") return 20;
        if (rating === "大凶") return 0;
        return 60; // SAFE/普通
      };

      totalSpaceScore += rateToPoints(step.evaluation?.rating || "普通");
      totalEvaluationsCount++;

      // Use cached companion evaluations
      if (step.memberEvaluations) {
        step.memberEvaluations.forEach((m) => {
          totalSpaceScore += rateToPoints(m.rating);
          totalEvaluationsCount++;
        });
      }
    });

    const spaceScore =
      totalEvaluationsCount > 0 ? totalSpaceScore / totalEvaluationsCount : 60;

    let totalTimeScore = 0;
    let totalTimeCount = 0;
    evaluatedSteps.forEach((step) => {
      const ev = nbaEvaluations[step.departureDate];
      if (ev) {
        const score = (ev.qValue + 100) / 2;
        totalTimeScore += score;
        totalTimeCount++;
      }
    });
    const timeScore = totalTimeCount > 0 ? totalTimeScore / totalTimeCount : 50;

    let finalScore = Math.round(spaceScore * 0.6 + timeScore * 0.4);

    let hasSevereClash = false;
    evaluatedSteps.forEach((step) => {
      const mainStatus = step.evaluation?.status || "";
      if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(mainStatus)) {
        hasSevereClash = true;
      }

      // Use cached companion evaluations for clash checks
      if (step.memberEvaluations) {
        step.memberEvaluations.forEach((m) => {
          if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(m.status)) {
            hasSevereClash = true;
          }
        });
      }

      const ev = nbaEvaluations[step.departureDate];
      if (ev && ev.qValue < -50) {
        hasSevereClash = true;
      }
    });

    if (hasSevereClash && finalScore > 40) {
      finalScore = 40;
    }

    return finalScore;
  }, [evaluatedSteps, nbaEvaluations]);

  // Handle step updates & inserts
  const handleAddStep = () => {
    const lastStep = steps[steps.length - 1];
    const baseDate = lastStep
      ? parseSafeDate(lastStep.departureDate)
      : new Date();
    const nextDate = new Date(baseDate.getTime() + 90 * 24 * 60 * 60 * 1000);
    const dateStr = toJapanDateString(nextDate);

    const fromLat = lastStep ? lastStep.toLat : startLat;
    const fromLon = lastStep ? lastStep.toLon : startLon;
    const fromName = lastStep ? lastStep.toName : startName;
    const companionIds = lastStep ? lastStep.companionIds || [] : [];

    const newSteps = [
      ...steps,
      {
        fromName,
        fromLat,
        fromLon,
        toName: "新しい目的地",
        toLat: fromLat + 0.1,
        toLon: fromLon + 0.1,
        departureDate: dateStr,
        purpose: "MIGRATION" as const,
        notes: "",
        companionIds,
      },
    ];

    setSteps(newSteps);
    setActiveStepIndex(newSteps.length - 1);
    saveDraft(newSteps);
  };

  const moveStepUp = (index: number) => {
    if (index <= 0) return;
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[index - 1];
    newSteps[index - 1] = temp;
    setSteps(newSteps);
    setActiveStepIndex(index - 1);
    saveDraft(newSteps);
  };

  const moveStepDown = (index: number) => {
    if (index >= steps.length - 1) return;
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[index + 1];
    newSteps[index + 1] = temp;
    setSteps(newSteps);
    setActiveStepIndex(index + 1);
    saveDraft(newSteps);
  };

  const handleRemoveStep = (index: number) => {
    if (steps.length === 1) {
      alert("シミュレーションには最低1つの移動ステップが必要です。");
      return;
    }
    const newSteps = steps.filter((_, idx) => idx !== index);
    setSteps(newSteps);
    setActiveStepIndex(newSteps.length - 1);
    saveDraft(newSteps);
  };

  const handleUpdateStep = (index: number, fields: Partial<SimulatorStep>) => {
    const newSteps = steps.map((s, idx) => {
      if (idx === index) return { ...s, ...fields };
      return s;
    });
    setSteps(newSteps);
    saveDraft(newSteps);
  };

  const handleApplyDetour = (cand: (typeof detourCandidates)[0]) => {
    if (activeStepIndex === null || activeStepIndex >= steps.length) return;
    const currentStep = steps[activeStepIndex];

    const depDate = parseSafeDate(currentStep.departureDate);
    const nextDepDate = new Date(depDate);
    nextDepDate.setDate(nextDepDate.getDate() + 75);
    const nextDepStr = toJapanDateString(nextDepDate);

    const stepN: SimulatorStep = {
      ...currentStep,
      toName: cand.name,
      toLat: cand.lat,
      toLon: cand.lon,
      purpose: "MIGRATION",
    };

    const stepNPlus1: SimulatorStep = {
      fromName: cand.name,
      fromLat: cand.lat,
      fromLon: cand.lon,
      toName: currentStep.toName,
      toLat: currentStep.toLat,
      toLon: currentStep.toLon,
      departureDate: nextDepStr,
      purpose: currentStep.purpose,
      notes: `${currentStep.toName}への本目的移動`,
      companionIds: currentStep.companionIds || [],
    };

    const newSteps = [...steps];
    newSteps[activeStepIndex] = stepN;
    newSteps.splice(activeStepIndex + 1, 0, stepNPlus1);

    setSteps(newSteps);
    setActiveStepIndex(activeStepIndex + 1);
    saveDraft(newSteps);
  };

  // Database Save/Load operations
  const handleSavePlan = async () => {
    if (plansRequireLogin) {
      window.location.href = `/login?next=${encodeURIComponent("/relocation/simulator")}`;
      return;
    }

    if (!planName) {
      const name = prompt(
        "プランの名前を入力してください：",
        "プラン1: 名古屋移住シミュレーション",
      );
      if (!name) return;
      setPlanName(name);
      saveDraft(steps, startLat, startLon, startName, useTrueNorth, name);
      triggerSave(name);
    } else {
      triggerSave(planName);
    }
  };

  const triggerSave = async (name: string) => {
    setIsSaving(true);
    try {
      const payload = {
        steps,
        members,
      };
      const res = await fetch("/api/relocation/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentPlanId || undefined,
          name,
          steps: payload,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setCurrentPlanId(result.data.id);
          fetchSavedPlans();
          alert("プランをデータベースに保存しました。");
        }
      } else if (res.status === 401) {
        setPlansRequireLogin(true);
        alert("プランの保存にはログインが必要です。");
      } else {
        alert("保存に失敗しました。");
      }
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadPlan = (plan: SavedPlan) => {
    try {
      const payload = plan.steps;
      let parsedSteps: SimulatorStep[] = [];
      let parsedMembers: AccompanyingMember[] = [];
      if (Array.isArray(payload)) {
        parsedSteps = payload;
      } else if (payload && typeof payload === "object") {
        parsedSteps = payload.steps || [];
        parsedMembers = payload.members || [];
      }

      setSteps(parsedSteps);
      setMembers(parsedMembers);
      setCurrentPlanId(plan.id);
      setPlanName(plan.name);

      if (parsedSteps[0]) {
        setStartLat(parsedSteps[0].fromLat);
        setStartLon(parsedSteps[0].fromLon);
        setStartName(parsedSteps[0].fromName);
      }
      setActiveStepIndex(0);
      saveDraft(
        parsedSteps,
        parsedSteps[0]?.fromLat,
        parsedSteps[0]?.fromLon,
        parsedSteps[0]?.fromName,
        useTrueNorth,
        plan.name,
        parsedMembers,
      );
    } catch {
      alert("データの展開に失敗しました。");
    }
  };

  const handleDeletePlan = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("このシミュレーションプランを削除しますか？")) return;
    try {
      const res = await fetch(`/api/relocation/simulation?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (currentPlanId === id) {
          setCurrentPlanId(null);
          setPlanName("");
        }
        fetchSavedPlans();
      } else if (res.status === 401) {
        setPlansRequireLogin(true);
        alert("保存済みプランの削除にはログインが必要です。");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveUnifiedConfig = async (updatedFields: {
    use_true_north?: boolean;
    base_lat?: number;
    base_lon?: number;
  }) => {
    try {
      // 端末の設定の読み出しは lib/userSettings に既にある。ここで
      // JSON.parse を書き直さない（同じことを 2 か所に書かない）。
      const mergedConfig: Settings = {
        ...readLocalSettings(),
        ...updatedFields,
      };

      localStorage.setItem(SETTINGS_KEY, JSON.stringify(mergedConfig));

      await fetch("/api/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });

      // Dispatch global config update event for instant sync
      const event = new CustomEvent("metaphysical-config-updated", {
        detail: {
          targetDate:
            mergedConfig.target_date ||
            (steps.length > 0 ? steps[0].departureDate : undefined),
          useClassicalBoard:
            mergedConfig.use_classical_board !== undefined
              ? mergedConfig.use_classical_board
              : useClassical,
          physicalMonthMode:
            mergedConfig.physical_month_mode !== undefined
              ? mergedConfig.physical_month_mode
              : physicalMonthMode,
          directionFilterMode:
            mergedConfig.direction_filter_mode || directionFilterMode,
          actionIntent: mergedConfig.action_intent || actionIntent,
          birthDate: mergedConfig.birth_date || birthDate,
          baseLat:
            mergedConfig.base_lat !== undefined
              ? mergedConfig.base_lat
              : startLat,
          baseLon:
            mergedConfig.base_lon !== undefined
              ? mergedConfig.base_lon
              : startLon,
        },
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error("Failed to sync config in simulator page:", e);
    }
  };

  const handleConfigChange = (newConfig: MetaphysicalConfig) => {
    setUseClassical(newConfig.useClassicalBoard);
    setDirectionFilterMode(newConfig.directionFilterMode);
    setActionIntent(newConfig.actionIntent);

    if (newConfig.birthDate) {
      setBirthDate(newConfig.birthDate);
    }
    if (newConfig.baseLat !== undefined) {
      setStartLat(newConfig.baseLat);
    }
    if (newConfig.baseLon !== undefined) {
      setStartLon(newConfig.baseLon);
    }

    // Sync target date ONLY to the initial step's departure date if it changes
    if (steps.length > 0 && steps[0].departureDate !== newConfig.targetDate) {
      setSteps((prev) => {
        const nextSteps = [...prev];
        nextSteps[0] = { ...nextSteps[0], departureDate: newConfig.targetDate };
        return nextSteps;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 pb-20 relative overflow-x-hidden selection:bg-indigo-500/30 selection:text-indigo-700">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/*
        自分で何も入れていない人には、判定を出さずに入口だけを出す。

        steps の初期値は例（京都市 → 名古屋市 / 2026-06-30 / 一時赴任）。
        以前は birthDate の初期値も運営者の生年月日で、そのまま描くと
        開いただけの人に「本命星 3」「総合シンクロ指数 76/100 EXCELLENT」
        「安心してそのまま計画を実行してください」が出ていた。自分の結果だと
        読める形で、根拠の無い断定を見せていた（本番で実測）。
        いまは既定値そのものを外してあるが、この門は残す。例の計画に対する
        判定を、開いただけの人の結果として見せないため。

        機能は消していない。入口を通れば、これまでどおり全部出る。
      */}
      {!hasOwnInput ? (
        <div className="max-w-[1700px] mx-auto px-4 pt-10 relative z-10 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-black tracking-tight">
              引越し先を試算する
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              出発地から見た方位と、動く時期の吉凶を試算します。
            </p>
          </div>
          <SimulatorStart
            onStart={(v) => {
              setBirthDate(v.birthDate);
              setStartName(v.startName);
              setStartLat(v.startLat);
              setStartLon(v.startLon);
              // 下書きから計画を戻した人は、生年月日だけが足りずにここへ
              // 来ている。行き先まで消すと、戻したものを自分で壊すことになる。
              const keepDestination = restoredDraftRef.current;
              const next = steps.map((st, i) =>
                i === 0
                  ? {
                      ...st,
                      fromName: v.startName,
                      fromLat: v.startLat,
                      fromLon: v.startLon,
                      departureDate: v.departureDate,
                      // 行き先は入口では聞かない。1 つ目のステップで選ぶ。
                      ...(keepDestination
                        ? {}
                        : { toName: "", toLat: 0, toLon: 0, notes: "" }),
                    }
                  : st,
              );
              setSteps(next);
              saveDraft(
                next,
                v.startLat,
                v.startLon,
                v.startName,
                undefined,
                undefined,
                undefined,
                v.birthDate,
              );
              setHasOwnInput(true);
            }}
            onShowExample={() => {
              // 例にも生年月日は要る（本命星が決まらない）。
              // 運営者のものではなく、例だと分かる日付を入れる。
              setBirthDate(EXAMPLE_BIRTH_DATE);
              setHasOwnInput(true);
            }}
          />
        </div>
      ) : (
      /* 上限は max-w-7xl（1280px）だった。試算結果を並べる道具の画面なので、
         ホーム（1700px）に揃える。入口の画面（上）も同じ幅にして、
         入力の前後で器の幅が変わらないようにする。 */
      <div className="max-w-[1700px] mx-auto px-4 pt-10 relative z-10 space-y-8">
        {/* Metaphysical Configuration Bar */}
        <MetaphysicalConfigBar onConfigChange={handleConfigChange} />

        {/* Header Block */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-stone-200/60 pb-8">
          <div>
            {/* ナビ・サイトマップと同じ呼び名にする。英語の副題を足すと、
                検索から来た人には別のページに見える。 */}
            <h1 className="text-4xl font-black tracking-tight">
              引越し先を試算する
            </h1>
            <p className="text-sm text-stone-500 mt-2">
              行き先と日付を入れると、方位の吉凶を試算します。大凶のときは、遠回りして凶を避ける「仮吉方」ルートも提案します。
            </p>
            <p className="text-xs font-mono text-stone-600 mt-2">
              本命星:{" "}
              <strong className="text-indigo-500">{personalStar}</strong>
              {"　"}空亡:{" "}
              <strong className="text-rose-400">{voidZodiacs.join("")}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Overall Quality Score Badge */}
            <div className="flex items-center gap-4 bg-white/80 p-4 rounded-3xl border border-stone-200/60 backdrop-blur-md shadow-2xl">
              <div className="text-center">
                <span className="text-[10px] uppercase tracking-widest text-stone-600 font-bold block leading-none mb-1.5">
                  計画総合適合度
                </span>
                <span
                  className={`text-3xl font-black tracking-tight font-mono ${overallPlanScore <= 40 ? "text-red-400" : overallPlanScore >= 75 ? "text-emerald-400" : "text-stone-600"}`}
                >
                  {overallPlanScore}{" "}
                  <span className="text-xs font-normal text-stone-600">
                    pts
                  </span>
                </span>
              </div>
            </div>

            {/* Load/Save Controls */}
            <div className="flex flex-wrap items-center gap-3 bg-white/80 p-3 rounded-2xl border border-stone-200/60 backdrop-blur-md">
              {currentPlanId && (
                <span className="text-[10px] font-mono text-stone-600 px-2 border-r border-stone-200">
                  ACTIVE: {planName}
                </span>
              )}
              <input
                type="text"
                placeholder="プラン名を入力..."
                value={planName}
                onChange={(e) => {
                  setPlanName(e.target.value);
                  saveDraft(
                    steps,
                    startLat,
                    startLon,
                    startName,
                    useTrueNorth,
                    e.target.value,
                  );
                }}
                className="px-3 py-1.5 bg-white/70 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/30"
              />
              <button
                onClick={handleSavePlan}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-xs font-bold transition-all shadow-lg"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving
                  ? "保存中..."
                  : plansRequireLogin
                    ? "ログインして保存"
                    : "プランを保存"}
              </button>
          {/* Saved Plans dropdown */}
          <div className="flex items-center justify-between md:justify-end gap-2">
            <span className="text-stone-600 shrink-0">保存済みプラン:</span>
            {isLoadingPlans ? (
              <span className="text-stone-600 font-mono animate-pulse">
                LOADING...
              </span>
            ) : plansRequireLogin ? (
              <a
                href={`/login?next=${encodeURIComponent("/relocation/simulator")}`}
                className="text-indigo-600 hover:text-indigo-700 font-medium text-[10px] underline"
              >
                ログインすると保存できます
              </a>
            ) : plans.length === 0 ? (
              <span className="text-stone-600 font-mono text-[10px]">
                保存プランなし
              </span>
            ) : (
              <>
                <select
                  onChange={(e) => {
                    const plan = plans.find((p) => p.id === e.target.value);
                    if (plan) handleLoadPlan(plan);
                  }}
                  value={currentPlanId || ""}
                  className="bg-white/80 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-600 outline-none cursor-pointer max-w-[150px] sm:max-w-none"
                >
                  <option value="">-- 選択して読込 --</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {/* 削除処理（handleDeletePlan）は前からあったのに、押す場所が
                    どこにも無かった。一覧が select なので、項目ごとではなく
                    「選択中のプラン」に対するボタンとして置く。 */}
                {currentPlanId && (
                  <button
                    onClick={(e) => handleDeletePlan(currentPlanId, e)}
                    className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-500/10 border border-transparent hover:border-red-200 rounded-lg transition-colors"
                    title="選択中のプランを削除"
                  >
                    <Trash2 className="w-3 h-3" />
                    削除
                  </button>
                )}
              </>
            )}
              </div>
            </div>
          </div>
        </div>

        {/* Unified Ten-Chi-Jin Plan Level Panel */}
        <div className="w-full">
          <TenChiJinEvaluation
            mode="plan"
            steps={steps}
            members={validMembers}
            nbaEvaluations={nbaEvaluations}
            simulatedAns={simulatedAns}
            simulatedShield={simulatedShield}
            birthDate={birthDate}
            onApplyAction={(actionType, data) => {
              if (actionType === "DETOUR" && data) {
                handleApplyDetour(data);
              } else if (actionType === "DATE" && typeof data === "string") {
                if (activeStepIndex !== null) {
                  handleUpdateStep(activeStepIndex, { departureDate: data });
                }
              }
            }}
          />
        </div>

        {/*
          使う頻度の低い設定は、初期表示から下ろしてここに畳む。

          この画面は「行き先と日付を入れて吉凶を見る」道具なのに、開いた
          瞬間に生体スライダー・宇宙天気・同伴者・方位の基準・保存欄が
          全部並んでいて、どこから触ればいいのか分からなかった。判定に
          必須なのは出発地・行き先・日付だけなので、それ以外は開くまで
          見せない。

          <details> を使うのは、畳んでいても中身がマウントされたままに
          なるため。スライダーの値やポータル同期の状態は保持される。
        */}
        <details className="group rounded-[2.5rem] border border-stone-200/80 bg-white/20 backdrop-blur-md">
          <summary className="cursor-pointer select-none list-none p-5 flex items-center justify-between gap-3 text-xs font-bold text-stone-500 hover:text-stone-700 transition-colors">
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-stone-600" />
              詳細設定（同伴者・当日の体調・方位の基準）
            </span>
            <span className="text-[10px] font-normal text-stone-600 group-open:hidden">開く ▸</span>
            <span className="text-[10px] font-normal text-stone-600 hidden group-open:inline">閉じる ▾</span>
          </summary>
          <div className="px-5 pb-5 space-y-6">
            {/* Accompanying Members Config */}
            <div className="p-5 rounded-3xl bg-white/20 border border-stone-200/80 shadow-md space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xs font-mono font-bold tracking-widest text-stone-600 uppercase flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" /> 同伴者（家族など、一緒に動く人）
                </h3>
                <button
                  onClick={() => {
                    const name = prompt(
                      "同伴者の名前を入力してください：",
                      `同伴者 ${members.length + 1}`,
                    );
                    if (!name) return;
                    const bdate = prompt(
                      "同伴者の生年月日を入力してください（例：1965-05-15）：",
                      "1990-01-01",
                    );
                    if (!bdate) return;
                    if (!isValidIsoDate(bdate)) {
                      alert(
                        "生年月日は実在する日付を YYYY-MM-DD 形式で入力してください。",
                      );
                      return;
                    }
                    const newMembers = [
                      ...members,
                      { id: Date.now().toString(), name, birthDate: bdate },
                    ];
                    setMembers(newMembers);
                    saveDraft(
                      steps,
                      startLat,
                      startLon,
                      startName,
                      useTrueNorth,
                      planName,
                      newMembers,
                    );
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-600 text-[10px] font-bold rounded-lg border border-indigo-500/30 active:scale-95 transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" /> 同伴者を追加
                </button>
              </div>

              {members.length === 0 ? (
                <div className="text-[10px] text-stone-600 font-mono italic">
                  同伴者はいません（単身移動シミュレーション）
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="p-3.5 rounded-2xl bg-white/70 border border-stone-200 flex items-center justify-between gap-3 shadow-inner"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-stone-900">
                          {member.name}
                        </span>
                        <span className="text-[9px] font-mono text-stone-600">
                          生年月日: {member.birthDate} (
                          {isValidIsoDate(member.birthDate)
                            ? `${getClassicalYearStar(parseSafeDate(member.birthDate))}・空亡: ${getPersonalVoidZodiac(parseSafeDate(member.birthDate)).join("")}`
                            : "入力値が不正です"}
                          )
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const newMembers = members.filter(
                            (m) => m.id !== member.id,
                          );
                          setMembers(newMembers);
                          saveDraft(
                            steps,
                            startLat,
                            startLon,
                            startName,
                            useTrueNorth,
                            planName,
                            newMembers,
                          );
                        }}
                        className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 transition-colors cursor-pointer"
                        title="同伴者を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        {/* Biosignal Simulation Sliders Panel */}
        <div className="p-6 rounded-[2.5rem] bg-white/10 border border-stone-200/80 backdrop-blur-md space-y-4 shadow-inner">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/60 pb-3">
            <div>
              <h3 className="text-xs font-mono font-bold tracking-widest text-stone-500 uppercase flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-400 animate-pulse" />{" "}
                当日の体調・宇宙天気を仮定する（任意）
              </h3>
              <p className="text-[10px] text-stone-600 mt-1">
                移動当日の生体状況と宇宙天気のノイズ負荷を擬似設定します。ポータルのリアルタイムデータと同期することも可能です。
              </p>
            </div>
            <button
              onClick={syncWithPortal}
              disabled={isSyncingPortal}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                isSyncingPortal
                  ? "bg-stone-100 border-stone-300 text-zinc-550 cursor-not-allowed"
                  : "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/20 active:scale-95"
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 ${isSyncingPortal ? "animate-spin" : ""}`}
              />
              {isSyncingPortal
                ? "ポータルと同期中..."
                : "ポータルとリアルタイム同期"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] text-stone-500">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />{" "}
                  当日の想定ストレス負荷 (ANS Load):
                </span>
                <span className="text-indigo-400 font-bold">
                  {simulatedAns}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={simulatedAns}
                onChange={(e) => setSimulatedAns(parseInt(e.target.value))}
                className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] text-stone-500">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />{" "}
                  当日の想定睡眠スコア (Shield Capacity):
                </span>
                <span className="text-emerald-400 font-bold">
                  {simulatedShield}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={simulatedShield}
                onChange={(e) => setSimulatedShield(parseInt(e.target.value))}
                className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>

          {/* Sync Metadata display */}
          {(lastSyncTime || portalSpaceWeather) && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-mono text-stone-600 pt-1 border-t border-stone-200/60">
              {lastSyncTime && (
                <span>
                  同期時刻:{" "}
                  <strong className="text-stone-500">{lastSyncTime}</strong>
                </span>
              )}
              {portalSpaceWeather &&
                typeof portalSpaceWeather.kpIndex === "number" &&
                !isNaN(portalSpaceWeather.kpIndex) && (
                  <span className="flex items-center gap-1">
                    宇宙天気 Kp:{" "}
                    <strong
                      className={`font-bold ${portalSpaceWeather.kpIndex >= 4 ? "text-amber-400" : "text-emerald-400"}`}
                    >
                      {portalSpaceWeather.kpIndex.toFixed(2)}
                    </strong>
                  </span>
                )}
              {portalSpaceWeather &&
                portalSpaceWeather.solarWindSpeed !== null && (
                  <span>
                    太陽風速:{" "}
                    <strong className="text-stone-500">
                      {portalSpaceWeather.solarWindSpeed} km/s
                    </strong>
                  </span>
                )}
              {portalSpaceWeather && portalSpaceWeather.xrayFlux && (
                <span>
                  X線フラックス:{" "}
                  <strong className="text-stone-500">
                    {portalSpaceWeather.xrayFlux}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>
            <div className="flex items-center gap-4 text-xs p-4 rounded-3xl bg-white/30 border border-stone-200/60">
          {/* Compass Toggle */}
          <div className="flex items-center justify-between md:justify-start gap-4">
            <span className="text-stone-500 font-medium">方位の基準:</span>
            <button
              onClick={() => {
                const next = !useTrueNorth;
                setUseTrueNorth(next);
                saveDraft(steps, startLat, startLon, startName, next);
                // この画面はこの設定を読むだけで書き戻していなかった。
                // 物件検索・資産マップは saveUnifiedConfig で共有設定に
                // 書いており、ここだけ片方向だったので揃える。判定は
                // 真北で固定なので、この設定が効くのは「方位磁針で測ると
                // ずれる」注意（DECLINATION_WARNING）を出すかどうか。
                saveUnifiedConfig({ use_true_north: next });
              }}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all ${
                useTrueNorth
                  ? "bg-indigo-500/20 text-indigo-600 border-indigo-500/30"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/30"
              }`}
            >
              {useTrueNorth ? "真北 (地図の北)" : "磁北 (方位磁針の北)"}
            </button>
          </div>

            </div>
          </div>
        </details>

        {/* Dashboard Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Flow step list editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* Start Location Config */}
            <div className="p-5 rounded-3xl bg-white/20 border border-stone-200/80 shadow-md space-y-4">
              <h3 className="text-xs font-mono font-bold tracking-widest text-stone-600 uppercase flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" /> 出発地（いま住んでいる場所）
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-stone-600">
                    出発地の名称
                  </label>
                  <input
                    type="text"
                    value={startName}
                    onChange={(e) => {
                      setStartName(e.target.value);
                      saveDraft(steps, startLat, startLon, e.target.value);
                    }}
                    className="w-full px-4 py-2.5 bg-white/80 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-stone-300 focus:outline-none focus:border-indigo-500/20 shadow-inner"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono text-stone-600 self-end py-2.5">
                  <div>
                    緯度:{" "}
                    {typeof startLat === "number" && !isNaN(startLat)
                      ? startLat.toFixed(4)
                      : "---"}
                  </div>
                  <div>
                    経度:{" "}
                    {typeof startLon === "number" && !isNaN(startLon)
                      ? startLon.toFixed(4)
                      : "---"}
                  </div>
                </div>
              </div>
            </div>

            {/* Sequence Steps Cards */}
            <div className="space-y-4">
              {evaluatedSteps.map((step, idx) => {
                const isSelected = activeStepIndex === idx;

                let stayStr = "定住（無期限）";
                let isStayShort = false;
                let stayDays = 999;
                if (idx < steps.length - 1) {
                  const currentDep = parseSafeDate(step.departureDate);
                  const nextDep = parseSafeDate(
                    steps[idx + 1].departureDate,
                    currentDep,
                  );
                  stayDays = Math.round(
                    (nextDep.getTime() - currentDep.getTime()) /
                      (1000 * 60 * 60 * 24),
                  );
                  stayStr = `${stayDays} 日間`;
                  isStayShort = stayDays < 75;
                }

                // Companion specific direction ratings (using cached metrics)
                const memberEvals = step.memberEvaluations || [];

                // Calculate Universal Clashes
                const clashingMembers: string[] = [];
                let universalClashType = "";
                const checkUniversal = (status: string) =>
                  ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(status);

                if (checkUniversal(step.evaluation?.status || "")) {
                  clashingMembers.push("自分");
                  universalClashType = step.evaluation?.status || "";
                }
                memberEvals.forEach((m) => {
                  if (checkUniversal(m.status)) {
                    clashingMembers.push(m.name);
                    universalClashType = m.status;
                  }
                });

                const clashLabelMap: Record<string, string> = {
                  NOISE_GOU: "五黄殺",
                  NOISE_ANKEN: "暗剣殺",
                  NOISE_HA: "歳破/月破/日破",
                };
                const hasUniversalClash = clashingMembers.length > 0;

                // Grab Timing evaluations for this date
                const timingEval = nbaEvaluations[step.departureDate];

                return (
                  <motion.div
                    key={idx}
                    onClick={() => setActiveStepIndex(idx)}
                    className={`p-5 rounded-[2rem] border transition-all flex flex-col gap-4 backdrop-blur-md cursor-pointer relative overflow-hidden group ${
                      isSelected
                        ? "bg-gradient-to-br from-indigo-950/20 to-purple-950/20 border-indigo-500/50 shadow-lg shadow-indigo-600/5"
                        : "bg-white/30 border-stone-200/80 hover:bg-white/40 hover:border-stone-300/80 shadow-md"
                    }`}
                  >
                    {/* Header line of the Step */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 shadow-inner ${step.evaluation?.color}`}
                        >
                          STEP {idx + 1} : {step.evaluation?.rating}
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-stone-100/80 border border-stone-200/80 text-stone-600 leading-none">
                          {step.purpose === "MIGRATION"
                            ? "長期移住"
                            : "短期旅行"}
                        </span>
                        {/* 近すぎる移動は方位がピンの置き方で変わる。
                            判定は出したうえで、当てにならないと添える。 */}
                        {step.directionNote && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 border border-amber-300 text-amber-700 leading-none"
                            title={step.directionNote}
                          >
                            方位が定まりません
                          </span>
                        )}
                      </div>

                      {/* Controls: Move Up, Move Down, Delete */}
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => moveStepUp(idx)}
                          disabled={idx === 0}
                          className={`p-1.5 rounded-lg border transition-all ${
                            idx === 0
                              ? "border-stone-200/20 text-zinc-750 cursor-not-allowed opacity-30"
                              : "bg-stone-100/40 border-stone-300/80 text-stone-500 hover:text-stone-900 hover:bg-stone-200"
                          }`}
                          title="上に移動"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveStepDown(idx)}
                          disabled={idx === steps.length - 1}
                          className={`p-1.5 rounded-lg border transition-all ${
                            idx === steps.length - 1
                              ? "border-stone-200/20 text-zinc-750 cursor-not-allowed opacity-30"
                              : "bg-stone-100/40 border-stone-300/80 text-stone-500 hover:text-stone-900 hover:bg-stone-200"
                          }`}
                          title="下に移動"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemoveStep(idx)}
                          className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 transition-all cursor-pointer"
                          title="このステップを削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Universal Clash Alert Banner */}
                    {hasUniversalClash && (
                      <div className="px-3.5 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-[10px] flex items-center gap-2 font-bold shadow-inner">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          ※家屋全体の重大な凶方位（
                          {clashLabelMap[universalClashType] || "共通の凶"}
                          ）に衝突しています。影響：{clashingMembers.join(", ")}
                        </span>
                      </div>
                    )}

                    {/* Step Fields Row */}
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[9px] uppercase font-bold text-stone-600">
                            目的地
                          </label>
                          {/*
                            住所を手で打つのが大変、という声から足した導線。
                            物件を方位で探す画面で ★ を付けた部屋を、
                            名前と座標ごと呼び出す。打ち間違いで方位が
                            変わる事故も無くなる。
                          */}
                          <button
                            type="button"
                            onClick={() =>
                              setFavoritePickerStep(
                                favoritePickerStep === idx ? null : idx,
                              )
                            }
                            className="text-[10px] text-indigo-500 hover:text-indigo-700 hover:underline shrink-0"
                          >
                            ★ お気に入りから選ぶ
                          </button>
                        </div>
                        <input
                          type="text"
                          value={step.toName}
                          onChange={(e) =>
                            handleUpdateStep(idx, { toName: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white/80 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 placeholder-stone-300 focus:outline-none focus:border-indigo-500/20 shadow-inner"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-stone-600">
                          出発日
                        </label>
                        <input
                          type="date"
                          value={step.departureDate}
                          onChange={(e) =>
                            handleUpdateStep(idx, {
                              departureDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 bg-white/80 border border-stone-200 rounded-xl text-xs font-mono text-stone-900 focus:outline-none focus:border-indigo-500/20 shadow-inner"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] uppercase font-bold text-stone-600">
                          目的区分
                        </label>
                        <select
                          value={step.purpose}
                          onChange={(e) =>
                            handleUpdateStep(idx, {
                              purpose: e.target.value as SimulatorStep["purpose"],
                            })
                          }
                          className="w-full px-3 py-2 bg-white/80 border border-stone-200 rounded-xl text-xs text-stone-600 focus:outline-none focus:border-indigo-500/20 cursor-pointer"
                        >
                          <option value="MIGRATION">長期移住 (拠点移動)</option>
                          <option value="TRAVEL">短期旅行 (拠点不動)</option>
                        </select>
                      </div>

                      {favoritePickerStep === idx && (
                        <div className="col-span-1 sm:col-span-2 md:col-span-3">
                          <FavoritePicker
                            onClose={() => setFavoritePickerStep(null)}
                            onPick={({ name, lat, lon }) => {
                              // 名前と座標を一緒に入れる。名前だけ入れて
                              // 座標が前のままだと、画面の表示と判定が
                              // 食い違う（一番たちが悪い壊れ方）。
                              handleUpdateStep(idx, {
                                toName: name,
                                toLat: lat,
                                toLon: lon,
                              });
                              setFavoritePickerStep(null);
                            }}
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-2 md:col-span-3 border-t border-stone-200/60 pt-3">
                        <label className="text-[9px] uppercase font-bold text-stone-600">
                          同行する同伴者 (ACCOMPANYING COMPANIONS FOR THIS STEP)
                        </label>
                        {members.length === 0 ? (
                          <span className="text-[10px] text-stone-600 italic">
                            登録されている同伴者がいません。「同伴者の設定」から追加してください。
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2.5 mt-1">
                            {members.map((member) => {
                              const isSelected = (
                                step.companionIds || []
                              ).includes(member.id);
                              return (
                                <label
                                  key={member.id}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-mono cursor-pointer transition-all ${
                                    isSelected
                                      ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 font-bold"
                                      : "bg-white/70 border-stone-200 text-stone-600 hover:border-stone-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      const currentIds =
                                        step.companionIds || [];
                                      const nextIds = currentIds.includes(
                                        member.id,
                                      )
                                        ? currentIds.filter(
                                            (id: string) => id !== member.id,
                                          )
                                        : [...currentIds, member.id];
                                      handleUpdateStep(idx, {
                                        companionIds: nextIds,
                                      });
                                    }}
                                    className="sr-only"
                                  />
                                  <span>{isSelected ? "●" : "○"}</span>
                                  <span>{member.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/*
                      近すぎて方位が定まらないときの説明。

                      同行者の枠（members.length > 0）の中に置いていたので、
                      ひとりで試算している人には出ていなかった。見出しの
                      バッジだけが出て、理由が読めない状態だった（本番で実測）。
                      同行者の有無に関係なく出す。
                    */}
                    {step.directionNote && (
                      <div className="border-t border-stone-200/60 pt-3">
                        <p className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-800">
                          {step.directionNote}
                          <br />
                          {/*
                            JSX は行の折り返しを半角スペースにするので、
                            日本語の文を複数行に割ると文中に空白が入る。
                            本番で「結果が 変わります。」と出ていた。
                            文字列として 1 つに渡す。
                          */}
                          {"方位盤の判定は出していますが、この距離では出発地・行き先の指定を少し変えるだけで結果が変わります。"}
                        </p>
                      </div>
                    )}

                    {/* Member Evaluations Matrix Row */}
                    {members.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-stone-200/60 pt-3">
                        <div className="p-2 rounded-xl bg-white/60 border border-stone-200 flex items-center justify-between gap-2 shadow-inner">
                          <span className="text-[10px] text-stone-500 font-bold">
                            自分
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${step.evaluation?.color}`}
                          >
                            {step.evaluation?.rating}
                          </span>
                        </div>
                        {memberEvals.map((mEval) => (
                          <div
                            key={mEval.memberId}
                            className="p-2 rounded-xl bg-white/60 border border-stone-200 flex items-center justify-between gap-2 shadow-inner"
                          >
                            <span className="text-[10px] text-stone-500 font-bold truncate max-w-[65px]">
                              {mEval.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[9px] font-black border ${mEval.color}`}
                            >
                              {mEval.rating}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Vector / Direction HUD */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-white/60 p-3 rounded-2xl border border-stone-200 text-xs font-mono text-stone-600">
                      <div>
                        出発地:{" "}
                        <span className="text-stone-600 font-bold">
                          {step.fromName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <span>方位角:</span>
                          <span className="text-indigo-400 font-bold">
                            {bearingToDirection(
                              getBearing(
                                step.fromLat,
                                step.fromLon,
                                step.toLat,
                                step.toLon,
                              ),
                              useClassical,
                            )}{" "}
                            (
                            {Math.round(
                              getBearing(
                                step.fromLat,
                                step.fromLon,
                                step.toLat,
                                step.toLon,
                              ),
                            )}
                            °)
                          </span>
                        </div>
                        {timingEval &&
                          typeof timingEval.qValue === "number" &&
                          !isNaN(timingEval.qValue) && (
                            <div className="flex items-center gap-1.5 border-l border-stone-200 pl-4">
                              <span>Q値:</span>
                              <span
                                className={`font-black ${timingEval.qValue < 0 ? "text-red-400" : "text-emerald-400"}`}
                              >
                                {timingEval.qValue.toFixed(1)}
                              </span>
                            </div>
                          )}
                      </div>
                      <div>
                        滞在期間:{" "}
                        <span
                          className={`font-bold ${isStayShort ? "text-amber-400" : "text-emerald-400"}`}
                        >
                          {stayStr}
                        </span>
                      </div>
                    </div>

                    {/* Active Base status alert */}
                    {step.purpose === "MIGRATION" && idx < steps.length - 1 && (
                      <div className="text-[10px] font-mono text-stone-600 flex items-center gap-1.5 leading-none">
                        <Clock className="w-3.5 h-3.5 text-stone-600" />
                        <span>
                          {isStayShort
                            ? formatShortStayBaseMessage(step.fromName)
                            : `※滞在が75日以上のため、この移動後に拠点は「${step.toName}」に移転します。`}
                        </span>
                      </div>
                    )}

                    {/* Step Specific Ten-Chi-Jin Panel (Advisory UI Integration) */}
                    {isSelected && (
                      <div
                        className="mt-4 pt-4 border-t border-stone-200/60"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <TenChiJinEvaluation
                          mode="step"
                          steps={steps}
                          singleStepIndex={idx}
                          members={validMembers}
                          nbaEvaluations={nbaEvaluations}
                          simulatedAns={simulatedAns}
                          simulatedShield={simulatedShield}
                          birthDate={birthDate}
                          onApplyAction={(actionType, data) => {
                            if (actionType === "DETOUR" && data) {
                              handleApplyDetour(data);
                            } else if (
                              actionType === "DATE" &&
                              typeof data === "string"
                            ) {
                              handleUpdateStep(idx, { departureDate: data });
                            }
                          }}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Add Step button */}
            <button
              onClick={handleAddStep}
              className="w-full py-4 border border-dashed border-stone-200 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-[2rem] text-xs font-bold text-stone-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> 移動ステップを追加
            </button>
          </div>

          {/* Right Column: Leaflet Map & Detour Suggestions Drawer */}
          <div className="lg:col-span-1 space-y-6">
            {/* Map Area */}
            <div className="h-[380px] rounded-3xl overflow-hidden shadow-2xl border border-stone-200 relative bg-stone-50/60">
              <SimulatorMap
                startLat={startLat}
                startLon={startLon}
                steps={evaluatedSteps}
                activeStepIndex={activeStepIndex}
                onStartLocationChange={(lat, lon, name) => {
                  setStartLat(lat);
                  setStartLon(lon);
                  if (name) setStartName(name);
                  saveDraft(steps, lat, lon, name || startName);
                  saveUnifiedConfig({
                    base_lat: lat,
                    base_lon: lon,
                  });
                }}
                onStepDestinationChange={(index, lat, lon, name) => {
                  const nameToUse = name || steps[index].toName;
                  handleUpdateStep(index, {
                    toLat: lat,
                    toLon: lon,
                    toName: nameToUse,
                  });
                }}
                detourPolygons={detourPolygonsAndPrefectures.polygons}
              />
            </div>

            {/* Active Details Card */}
            {activeStepIndex !== null &&
              activeStepIndex < evaluatedSteps.length && (
                <div className="p-6 rounded-[2rem] border border-stone-200/80 bg-white/80 backdrop-blur-xl shadow-xl shadow-rose-100/30 space-y-6">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-[9px] font-bold text-stone-600 tracking-wider uppercase mb-1">
                      <Compass className="w-3.5 h-3.5 text-indigo-400" />{" "}
                      ステップ {activeStepIndex + 1} 鑑定詳細
                    </div>
                    <h2 className="text-lg font-bold text-stone-900 leading-tight">
                      {evaluatedSteps[activeStepIndex].fromName} ➔{" "}
                      {evaluatedSteps[activeStepIndex].toName}
                    </h2>
                  </div>

                  {/* Rating score panel */}
                  <div className="p-4 rounded-2xl bg-stone-100/80 border border-stone-200/80 text-center relative overflow-hidden shadow-inner">
                    <span className="text-[9px] uppercase tracking-widest text-stone-600 font-bold block mb-1">
                      ステップ吉凶評価
                    </span>
                    <span
                      className={`text-4xl font-black block tracking-tight ${evaluatedSteps[activeStepIndex].evaluation?.color.split(" ")[0]}`}
                    >
                      {evaluatedSteps[activeStepIndex].evaluation?.rating}
                    </span>
                    <p className="text-[10px] text-stone-500 mt-2 font-medium px-2 leading-relaxed">
                      {directionLabelDetailed(
                        evaluatedSteps[activeStepIndex].evaluation?.status ||
                          "",
                      )}
                    </p>
                  </div>

                  {/* Timing Q-Value Overlay */}
                  {(() => {
                    const step = evaluatedSteps[activeStepIndex];
                    const ev = nbaEvaluations[step.departureDate];
                    if (!ev) return null;

                    return (
                      <div className="p-4 rounded-2xl bg-white/80 border border-stone-200 flex items-center justify-between gap-3 text-xs font-mono shadow-inner">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-stone-600 font-bold uppercase leading-none">
                            時間適合度 (Q値)
                          </span>
                          <span className="text-stone-500">
                            推奨行動:{" "}
                            <strong
                              className={
                                ev.suggestedAction === "EXECUTE_RELOCATION"
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              }
                            >
                              {ev.suggestedAction === "EXECUTE_RELOCATION"
                                ? "実行前進"
                                : ev.suggestedAction ===
                                    "EXECUTE_PURGE_RELOCATION"
                                  ? "浄化移住"
                                  : ev.suggestedAction === "ABORT_AND_SHIELD"
                                    ? "撤退"
                                    : ev.suggestedAction === "GATHER_INTEL"
                                      ? "情報収集"
                                      : "警戒待機"}
                            </strong>
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-2xl font-black ${typeof ev.qValue === "number" && ev.qValue < 0 ? "text-red-400" : "text-emerald-400"}`}
                          >
                            {typeof ev.qValue === "number" && !isNaN(ev.qValue)
                              ? ev.qValue.toFixed(1)
                              : "---"}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Active Risk Factors alert */}
                  {(() => {
                    const step = evaluatedSteps[activeStepIndex];
                    const ev = nbaEvaluations[step.departureDate];
                    if (!ev || !ev.riskFactors || ev.riskFactors.length === 0)
                      return null;
                    return (
                      <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-stone-500 text-[10px] flex gap-2 leading-relaxed font-mono">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-red-450 font-bold">
                            日付リスク要因:
                          </strong>{" "}
                          {ev.riskFactors.join(", ")} が干渉しています。
                        </div>
                      </div>
                    );
                  })()}

                  {/* Metaphysical Insights Section */}
                  {(() => {
                    const step = evaluatedSteps[activeStepIndex];
                    const ev = nbaEvaluations[step.departureDate];
                    if (!ev || !ev.metaphysical) return null;
                    const meta = ev.metaphysical;

                    return (
                      <div className="space-y-4 pt-4 border-t border-stone-200/60 text-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />{" "}
                            占術インサイト (Metaphysical Insights)
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 gap-3.5">
                          {/* 奇門遁甲 (Qi Men Dun Jia) */}
                          {meta.chineseMetasoft?.qiMenGate && (
                            <div className="p-3.5 rounded-2xl bg-white/70 border border-stone-200/80 space-y-2 shadow-inner">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-stone-600">
                                  🚪 奇門遁甲 (Qi Men Dun Jia)
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    meta.chineseMetasoft.qiMenGate.status ===
                                    "Auspicious"
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : meta.chineseMetasoft.qiMenGate
                                            .status === "Inauspicious"
                                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                        : "bg-stone-100 text-stone-500"
                                  }`}
                                >
                                  {meta.chineseMetasoft.qiMenGate.status ===
                                  "Auspicious"
                                    ? "吉門"
                                    : meta.chineseMetasoft.qiMenGate.status ===
                                        "Inauspicious"
                                      ? "凶門"
                                      : "中立"}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-stone-600">
                                開運門:{" "}
                                <span className="text-indigo-400 font-mono">
                                  {meta.chineseMetasoft.qiMenGate.name}
                                </span>
                              </div>
                              <p className="text-[10px] text-stone-500 leading-relaxed font-sans">
                                {meta.chineseMetasoft.qiMenGate.description}
                              </p>
                            </div>
                          )}

                          {/* 易経 (I-Ching) */}
                          {meta.roxyApi?.ichingCast && (
                            <div className="p-3.5 rounded-2xl bg-white/70 border border-stone-200/80 space-y-2 shadow-inner">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-stone-600">
                                  ☯ 易経得卦 (I-Ching Hexagram)
                                </span>
                                <span className="text-[9px] font-mono text-indigo-400">
                                  第 {meta.roxyApi.ichingCast.hexagramNumber} 卦
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-stone-600">
                                  卦名:{" "}
                                  <span className="text-indigo-400">
                                    {meta.roxyApi.ichingCast.name}
                                  </span>
                                </div>
                                {meta.roxyApi.ichingCast.changingLines?.length >
                                  0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">
                                    変爻あり
                                  </span>
                                )}
                              </div>

                              {/* Hexagram visual bar representation */}
                              {meta.roxyApi.ichingCast.lines && (
                                <div className="flex flex-col gap-1 py-1.5 px-3 bg-stone-50/60 rounded-xl border border-stone-200/50 w-fit">
                                  {meta.roxyApi.ichingCast.lines
                                    .slice()
                                    .reverse()
                                    .map((lineVal: number, idx: number) => {
                                      const isYin =
                                        lineVal === 6 || lineVal === 8;
                                      const isChanging =
                                        lineVal === 6 || lineVal === 9;
                                      return (
                                        <div
                                          key={idx}
                                          className="flex items-center gap-2"
                                        >
                                          <span className="text-[10px] font-mono text-stone-600 w-3">
                                            L{6 - idx}
                                          </span>
                                          <div className="flex gap-0.5 w-16 h-1.5 rounded overflow-hidden">
                                            {isYin ? (
                                              <>
                                                <div
                                                  className={`h-full w-[47%] ${isChanging ? "bg-amber-400/85 animate-pulse" : "bg-stone-300"}`}
                                                />
                                                <div className="h-full w-[6%] bg-transparent" />
                                                <div
                                                  className={`h-full w-[47%] ${isChanging ? "bg-amber-400/85 animate-pulse" : "bg-stone-300"}`}
                                                />
                                              </>
                                            ) : (
                                              <div
                                                className={`h-full w-full ${isChanging ? "bg-amber-400/85 animate-pulse" : "bg-stone-400"}`}
                                              />
                                            )}
                                          </div>
                                          <span className="text-[10px] font-mono text-stone-600">
                                            {lineVal}
                                          </span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}

                              <p className="text-[10px] text-zinc-450 leading-relaxed font-sans pt-1">
                                {meta.roxyApi.ichingCast.interpretation}
                              </p>
                            </div>
                          )}

                          {/* タロット (Tarot Card) */}
                          {meta.divineApi?.tarot && (
                            <div className="p-3.5 rounded-2xl bg-white/70 border border-stone-200/80 space-y-1.5 shadow-inner">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-stone-600">
                                  🃏 タロットカード (Tarot)
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    meta.divineApi.tarot.orientation.includes(
                                      "正位置",
                                    )
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  }`}
                                >
                                  {meta.divineApi.tarot.orientation}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-stone-600">
                                カード:{" "}
                                <span className="text-indigo-400">
                                  {meta.divineApi.tarot.name}
                                </span>
                              </div>
                              <p className="text-[10px] text-stone-500 leading-relaxed font-sans">
                                {meta.divineApi.tarot.meaning}
                              </p>
                              <div className="text-[10px] text-stone-600 font-mono flex items-center justify-between pt-1.5 border-t border-stone-200">
                                <span>
                                  リスク寄与度:{" "}
                                  <strong
                                    className={
                                      meta.divineApi.tarot.riskModifier < 0
                                        ? "text-emerald-400"
                                        : meta.divineApi.tarot.riskModifier > 0
                                          ? "text-red-400"
                                          : "text-stone-600"
                                    }
                                  >
                                    {meta.divineApi.tarot.riskModifier > 0
                                      ? `+${meta.divineApi.tarot.riskModifier}`
                                      : meta.divineApi.tarot.riskModifier}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 紫微斗数 (Zi Wei Dou Shu) */}
                          {meta.ziWeiDouShu?.dailyInsight && (
                            <div className="p-3.5 rounded-2xl bg-white/70 border border-stone-200/80 space-y-1.5 shadow-inner">
                              <span className="text-[10px] font-bold text-stone-600 block">
                                ⭐ 紫微斗数飛星 (Zi Wei Dou Shu)
                              </span>
                              <p className="text-[10px] text-stone-500 leading-relaxed font-sans">
                                {meta.ziWeiDouShu.dailyInsight}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Phased relocation / Detour suggestions HUD */}
                  <div className="space-y-4 pt-4 border-t border-stone-200/60">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-indigo-600">
                      最適化アクションアドバイス
                    </h4>

                    {/* Warning 1: Stay duration alert */}
                    {(() => {
                      const step = steps[activeStepIndex];
                      if (activeStepIndex === steps.length - 1) return null;
                      const currentDep = parseSafeDate(step.departureDate);
                      const nextDep = parseSafeDate(
                        steps[activeStepIndex + 1].departureDate,
                        currentDep,
                      );
                      const stayDays = Math.round(
                        (nextDep.getTime() - currentDep.getTime()) /
                          (1000 * 60 * 60 * 24),
                      );

                      if (step.purpose === "TRAVEL" && stayDays >= 75) {
                        return (
                          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex gap-2 shadow-inner">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                              <strong className="block font-bold mb-1">
                                【天中殺/拠点定着警告】
                              </strong>
                              目的が「短期旅行」ですが、滞在期間が **{stayDays}
                              日**（75日以上）となっています。気学のルール上、ここに拠点が強制定住してしまいます。帰宅や次の出発を
                              **74日以内** に早めることを推奨します。
                            </div>
                          </div>
                        );
                      }
                      if (step.purpose === "MIGRATION" && stayDays < 75) {
                        return (
                          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex gap-2 shadow-inner">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                              <strong className="block font-bold mb-1">
                                【拠点未確定アラート】
                              </strong>
                              目的が「長期移住」ですが、滞在が **{stayDays}
                              日**（75日未満）のため、太極（拠点）がこの地に移転しません。ここを次の出発地とするには、あと
                              **{75 - stayDays}日** 滞在を延ばす必要があります。
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Timing Recommendations Box */}
                    {timingRecommendations.length > 0 && (
                      <div className="p-3.5 rounded-xl border border-stone-200 bg-white/80 space-y-2 shadow-inner">
                        <strong className="block text-[10px] uppercase font-bold text-stone-500 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />{" "}
                          出発日程の最適化推奨（時間的回避）
                        </strong>
                        <p className="text-[9px] text-stone-600 leading-normal">
                          出発日を以下に変更すると、宇宙潮汐や自律神経（シミュレート値）との適合度が改善し、Q値が向上します。
                        </p>
                        <div className="flex flex-col gap-1.5 pt-1">
                          {timingRecommendations.map((rec) => (
                            <button
                              key={rec.date}
                              onClick={() =>
                                handleUpdateStep(activeStepIndex, {
                                  departureDate: rec.date,
                                })
                              }
                              className="w-full px-3 py-2 bg-stone-50/80 hover:bg-indigo-500/10 border border-stone-200 hover:border-indigo-500/30 rounded-xl text-left text-[10px] text-stone-600 hover:text-indigo-700 transition-all flex items-center justify-between cursor-pointer"
                            >
                              <span>
                                📅 {rec.date}{" "}
                                <span className="text-stone-600 font-mono">
                                  ({rec.diffDays}日後)
                                </span>
                              </span>
                              <span className="font-bold text-emerald-400 font-mono">
                                Q:{" "}
                                {typeof rec.qValue === "number" &&
                                !isNaN(rec.qValue)
                                  ? rec.qValue.toFixed(1)
                                  : "---"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Spatial Detour Candidates */}
                    {detourCandidates.length > 0 && (
                      <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 text-xs flex flex-col gap-2 shadow-inner">
                        <div className="flex gap-2">
                          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong className="block font-bold mb-1">
                              【吉方位迂回ルート提案 (仮吉方)】
                            </strong>
                            目的地への直接の移動は凶方位です。以下の候補地に
                            **75日以上**
                            滞在（仮吉方）してから移動することで、凶作用を回避できます。
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 mt-1 pt-1.5 border-t border-indigo-500/20">
                          {detourCandidates.map((cand) => (
                            <button
                              key={cand.name}
                              onClick={() => handleApplyDetour(cand)}
                              className="w-full px-3 py-2 bg-indigo-950/80 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-left text-[10px] text-indigo-700 hover:text-white transition-all flex items-center justify-between font-bold cursor-pointer"
                            >
                              <span>📍 {cand.name}経由で迂回ルートを作成</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* General Tips on Kari-Kippou */}
                    {evaluatedSteps[activeStepIndex].evaluation?.rating ===
                      "普通" &&
                      detourCandidates.length === 0 && (
                        <div className="p-3.5 rounded-xl border border-stone-200/60 bg-white/70 text-stone-500 text-[10px] flex gap-2 leading-relaxed">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-stone-600" />
                          <span>
                            この移動ステップには凶方位との衝突はありません。このままスケジュールを実行して問題ありません。
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              )}

            {/* General Guide card if no active step selected */}
            {activeStepIndex === null && (
              <div className="h-[250px] border border-dashed border-stone-200 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-3 text-stone-600 bg-white/10">
                <HelpCircle className="w-8 h-8 text-stone-300 animate-pulse" />
                <div>
                  <h4 className="font-bold text-stone-500 text-sm">
                    ステップを選択してください
                  </h4>
                  <p className="text-xs text-stone-600 mt-2 leading-relaxed max-w-xs mx-auto">
                    左側のステップカードを選択すると、その移動における方位・節気干渉の幾何学的な詳細ブレイクダウンと仮吉方のアドバイスが展開されます。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

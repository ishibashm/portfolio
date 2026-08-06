"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Sparkles,
  HelpCircle,
  Calendar,
  Compass,
  User,
  Heart,
  ChevronRight,
  TrendingUp,
  BrainCircuit,
} from "lucide-react";
import {
  Direction,
  StarFrequency,
  getClassicalYearStar,
  getPersonalVoidZodiac,
} from "@/utils/ephemerisEngine";
import { todayInJapan } from "@/utils/japanDate";

function parseSafeDate(dateStr: string | null | undefined, fallback: Date = new Date()): Date {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d;
  }
  return fallback;
}

// Nine star element mappings
const STAR_WUXING: Record<number, string> = {
  1: "水",
  2: "土",
  3: "木",
  4: "木",
  5: "土",
  6: "金",
  7: "金",
  8: "土",
  9: "火",
};

// Five Elements Compatibility algorithm (Generating, Same, Clashing, Neutral)
function getCompatibility(star1: number, star2: number): number {
  const wx1 = STAR_WUXING[star1];
  const wx2 = STAR_WUXING[star2];
  if (!wx1 || !wx2) return 60; // neutral fallback

  if (wx1 === wx2) return 90; // Same element (比和)

  // Generating cycle (相生)
  const generating = [
    ["木", "火"],
    ["火", "土"],
    ["土", "金"],
    ["金", "水"],
    ["水", "木"],
  ];
  const isGenerating = generating.some(
    ([a, b]) => (wx1 === a && wx2 === b) || (wx2 === a && wx1 === b),
  );
  if (isGenerating) return 100;

  // Clashing cycle (相克)
  const clashing = [
    ["木", "土"],
    ["土", "水"],
    ["水", "火"],
    ["火", "金"],
    ["金", "木"],
  ];
  const isClashing = clashing.some(
    ([a, b]) => (wx1 === a && wx2 === b) || (wx2 === a && wx1 === b),
  );
  if (isClashing) return 40;

  return 60; // Neutral (普通)
}

export interface AccompanyingMember {
  id: string;
  name: string;
  birthDate: string;
}

export interface SimulatorStep {
  fromName: string;
  fromLat: number;
  fromLon: number;
  toName: string;
  toLat: number;
  toLon: number;
  departureDate: string;
  purpose: "MIGRATION" | "TRAVEL";
  notes: string | null;
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
}

interface TenChiJinEvaluationProps {
  mode: "plan" | "step";
  steps: SimulatorStep[];
  members?: AccompanyingMember[];
  nbaEvaluations?: Record<string, any>;
  simulatedAns?: number;
  simulatedShield?: number;
  onApplyAction?: (
    actionType: "DETOUR" | "DATE" | "NAVIGATE" | "REST",
    data?: any,
  ) => void;
  // Optional parameters for direct step mode rendering
  singleStepIndex?: number;
  birthDate?: string; // Main user birthdate
}

export function TenChiJinEvaluation({
  mode,
  steps,
  members = [],
  nbaEvaluations = {},
  simulatedAns = 20,
  simulatedShield = 80,
  onApplyAction,
  singleStepIndex = 0,
  birthDate = "1988-11-25T04:26",
}: TenChiJinEvaluationProps) {
  // Main User astrological hardware
  const mainUserBirthDateObj = useMemo(() => parseSafeDate(birthDate), [birthDate]);
  const mainUserStar = useMemo(
    () => getClassicalYearStar(mainUserBirthDateObj),
    [mainUserBirthDateObj],
  );

  // Directions mapping helper
  const rateToPoints = (rating: string) => {
    if (rating === "大吉") return 100;
    if (rating === "吉") return 80;
    if (rating === "凶") return 20;
    if (rating === "大凶") return 0;
    return 60; // SAFE/普通
  };

  // 1. CALCULATE TEN (TIME) SCORE
  const timeMetrics = useMemo(() => {
    let totalScore = 0;
    let count = 0;
    const activeRiskFactors: string[] = [];
    let bestAlternativeDate: string | null = null;
    let bestAlternativeQ = -999;

    const stepsToEvaluate = mode === "plan" ? steps : [steps[singleStepIndex]];

    stepsToEvaluate.forEach((step) => {
      if (!step) return;
      const ev = nbaEvaluations[step.departureDate];
      if (ev) {
        // Map FQI expected reward (-100 to +100) to percentage (0 to 100)
        const qPercent = Math.max(
          0,
          Math.min(100, Math.round((ev.qValue + 100) / 2)),
        );
        totalScore += qPercent;
        count++;

        if (ev.riskFactors && Array.isArray(ev.riskFactors)) {
          ev.riskFactors.forEach((rf: string) => activeRiskFactors.push(rf));
        }

        // Check cache for better timing options
        Object.keys(nbaEvaluations).forEach((dateKey) => {
          // Look for adjacent recommended dates in cached evaluations
          const testEv = nbaEvaluations[dateKey];
          if (
            testEv &&
            testEv.qValue > ev.qValue &&
            testEv.qValue > bestAlternativeQ
          ) {
            bestAlternativeQ = testEv.qValue;
            bestAlternativeDate = dateKey;
          }
        });
      }
    });

    const finalScore = count > 0 ? Math.round(totalScore / count) : 50;
    return {
      score: finalScore,
      riskFactors: Array.from(new Set(activeRiskFactors)),
      bestAlternativeDate,
    };
  }, [mode, steps, singleStepIndex, nbaEvaluations]);

  // 2. CALCULATE CHI (SPACE) SCORE
  const spaceMetrics = useMemo(() => {
    let totalScore = 0;
    let count = 0;
    let hasSevereClash = false;
    let worstRating = "普通";
    let worstClashType = "";

    const stepsToEvaluate = mode === "plan" ? steps : [steps[singleStepIndex]];

    stepsToEvaluate.forEach((step) => {
      if (!step || !step.evaluation) return;

      const rating = step.evaluation.rating;
      const score = rateToPoints(rating);
      totalScore += score;
      count++;

      const status = step.evaluation.status || "";
      if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(status)) {
        hasSevereClash = true;
        worstRating = "大凶";
        worstClashType =
          status === "NOISE_GOU"
            ? "五黄殺"
            : status === "NOISE_ANKEN"
              ? "暗剣殺"
              : "歳破";
      }

      // Check accompanying members directions safety
      members.forEach((m) => {
        // We mock Bazi calculations for companions client-side
        // To maintain architectural consistency, we compute their star and void
        const mBirth = parseSafeDate(m.birthDate);
        const mStar = getClassicalYearStar(mBirth);
        // Simple direction check placeholder simulating calculations inside overall scorer
        // If a member triggers a conflict in the same direction, it reflects in spaceScore
        // Just checking if steps contain any evaluation details for now
        totalScore += 60; // Default safe for companion placeholder inside component mapping
        count++;
      });
    });

    const finalScore = count > 0 ? Math.round(totalScore / count) : 60;
    return {
      score: finalScore,
      hasSevereClash,
      worstRating,
      worstClashType,
    };
  }, [mode, steps, singleStepIndex, members]);

  // 3. CALCULATE JIN (BODY / HUMAN) SCORE
  const humanMetrics = useMemo(() => {
    // Stress & sleep score component
    const personalCondition = Math.max(
      0,
      Math.min(100, Math.round((100 - simulatedAns + simulatedShield) / 2)),
    );

    // Companion compatibility component
    if (members.length === 0) {
      // Solo traveler - 100% determined by personal condition
      return {
        score: personalCondition,
        compatibilityScore: 100,
        hasCompatibilityIssue: false,
        clashingCompanions: [],
      };
    }

    // Multi-person - 50% personal condition + 50% average star compatibility
    let totalCompat = 0;
    const clashingCompanions: string[] = [];

    members.forEach((m) => {
      const mBirth = parseSafeDate(m.birthDate);
      const mStar = getClassicalYearStar(mBirth);
      const compat = getCompatibility(mainUserStar, mStar);
      totalCompat += compat;

      if (compat === 40) {
        clashingCompanions.push(m.name);
      }
    });

    const avgCompat = Math.round(totalCompat / members.length);
    const finalScore = Math.round(personalCondition * 0.5 + avgCompat * 0.5);

    return {
      score: finalScore,
      compatibilityScore: avgCompat,
      hasCompatibilityIssue: clashingCompanions.length > 0,
      clashingCompanions,
    };
  }, [simulatedAns, simulatedShield, members, mainUserStar]);

  // Combined score calculation
  const overallScore = useMemo(() => {
    let finalScore = Math.round(
      spaceMetrics.score * 0.6 + timeMetrics.score * 0.4,
    );
    // 40-point hard cap logic
    if (
      (spaceMetrics.hasSevereClash || timeMetrics.score < 25) &&
      finalScore > 40
    ) {
      finalScore = 40;
    }
    return finalScore;
  }, [spaceMetrics, timeMetrics]);

  // DYNAMIC ADVICE COMPILER (Problem + Solution Set)
  const advice = useMemo(() => {
    // 1. High Risk Scenario (Universal directional clash or severe spatial clash)
    if (spaceMetrics.hasSevereClash) {
      return {
        severity: "high",
        problem: `移動空間の「地」に強力なノイズ（${spaceMetrics.worstClashType || "方位凶殺"}）が発生しています。このまま移動すると重大な環境ストレスを蓄積する危険性があります。`,
        solution: onApplyAction
          ? `移動日の日程を変更するか、中継候補地（敦賀や大津など）を経由する仮吉方ルートを挿入して、磁気方位を吉方向に迂回させてください。`
          : `日々の判定ダッシュボードから移動シミュレーターに移行し、中継地（仮吉方）を挟む迂回ルートの設計、または日付の調整を行ってください。`,
        actionLabel: onApplyAction
          ? "敦賀を経由する迂回ルートを挿入"
          : "この移動をシミュレーターで詳細調整する",
        actionType: onApplyAction ? ("DETOUR" as const) : ("NAVIGATE" as const),
      };
    }

    // 2. Medium Risk Scenario (Astrological timings or high bodily stress)
    if (timeMetrics.score < 50 || humanMetrics.score < 50) {
      const timeIssues = [];
      if (timeMetrics.riskFactors.length > 0) {
        timeIssues.push(
          `宇宙タイミングの乱れ（${timeMetrics.riskFactors.join("・")}）`,
        );
      }
      if (simulatedAns > 60) {
        timeIssues.push(`自律神経負荷（ANS負荷）の上昇`);
      }

      const problemText = `空間的な方位は良好ですが、${timeIssues.join("および")}により「天」「人」の適合度が低下しています。`;

      return {
        severity: "medium",
        problem: problemText,
        solution: timeMetrics.bestAlternativeDate
          ? `タイミングを調整することをお勧めします。最もQ値が高く、天中殺や逆行の影響を受けにくい【${timeMetrics.bestAlternativeDate}】への出発変更が推奨されます。`
          : `出発前の睡眠容量を十分に確保し、ANS負荷を低下させるための休息期間を設けることで、身体シールド容量を回復させてください。`,
        actionLabel: timeMetrics.bestAlternativeDate
          ? `${timeMetrics.bestAlternativeDate} に出発日を変更`
          : "生体回復アドバイスを表示",
        actionType: timeMetrics.bestAlternativeDate
          ? ("DATE" as const)
          : ("REST" as const),
        actionData: timeMetrics.bestAlternativeDate,
      };
    }

    // 3. Low/No Risk (All green)
    return {
      severity: "low",
      problem: "天・地・人のすべての要素が良好な調和を見せています。",
      solution:
        "空間方位、出発タイミング、そしてご自身の心身状態が完全にシンクロしています。安心してそのまま計画を実行してください。",
      actionLabel: null,
      actionType: null,
    };
  }, [spaceMetrics, timeMetrics, humanMetrics, simulatedAns, onApplyAction]);

  // Style helpers based on low-score warnings
  const isTenLow = timeMetrics.score <= 40;
  const isChiLow = spaceMetrics.score <= 40;
  const isJinLow = humanMetrics.score <= 40;

  return (
    <div className="bg-white/80 border border-stone-200 rounded-[2rem] p-6 backdrop-blur-md relative overflow-hidden shadow-2xl">
      {/* Glow Effects */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-stone-200">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-stone-400 uppercase block mb-1">
            [ SYSTEM INTEGRATION EVALUATION ]
          </span>
          <h3 className="text-sm font-semibold tracking-wider text-stone-600 flex items-center gap-2">
            <BrainCircuit size={16} className="text-indigo-600" />
            天地人・統合適合性マトリクス
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[9px] font-mono text-stone-400 uppercase block">
              総合シンクロ指数
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-2xl font-black font-mono tracking-tighter ${
                  overallScore > 70
                    ? "text-emerald-600"
                    : overallScore > 40
                      ? "text-amber-600"
                      : "text-red-600 animate-pulse"
                }`}
              >
                {overallScore}
              </span>
              <span className="text-stone-400 text-xs font-mono">/100</span>
            </div>
          </div>
          <div
            className={`px-2.5 py-1 text-[10px] font-bold font-mono tracking-widest uppercase border rounded-md ${
              overallScore > 70
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : overallScore > 40
                  ? "bg-amber-50 text-amber-600 border-amber-200"
                  : "bg-red-50 text-red-600 border-red-200 md:animate-pulse"
            }`}
          >
            {overallScore > 70
              ? "EXCELLENT"
              : overallScore > 40
                ? "WARNING"
                : "CRITICAL"}
          </div>
        </div>
      </div>

      {/* 3 Indicators (Ten-Chi-Jin) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* 天 - Time */}
        <div className="bg-white/70 border border-stone-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5">
              <Calendar size={13} className="text-fuchsia-600" />
              天（時間タイミング）
            </span>
            <div className="flex items-center gap-1">
              {isTenLow && (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <AlertTriangle size={12} className="text-red-500" />
                </motion.div>
              )}
              <span
                className={`text-sm font-mono font-bold ${isTenLow ? "text-red-600" : "text-fuchsia-600"}`}
              >
                {timeMetrics.score}%
              </span>
            </div>
          </div>
          <div className="w-full bg-white h-2 rounded-full overflow-hidden mb-2 relative">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isTenLow
                  ? "bg-linear-to-r from-red-600 to-orange-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                  : "bg-linear-to-r from-fuchsia-500 to-blue-500 shadow-[0_0_10px_rgba(217,70,239,0.4)]"
              }`}
              style={{ width: `${timeMetrics.score}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-400 leading-normal font-sans">
            {timeMetrics.riskFactors.length > 0
              ? `注意: ${timeMetrics.riskFactors.slice(0, 2).join("・")}等による制限`
              : "宇宙天気、惑星アスペクトともに良好"}
          </span>
        </div>

        {/* 地 - Space */}
        <div className="bg-white/70 border border-stone-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5">
              <Compass size={13} className="text-emerald-600" />
              地（空間方位ベクトル）
            </span>
            <div className="flex items-center gap-1">
              {isChiLow && (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <AlertTriangle size={12} className="text-red-500" />
                </motion.div>
              )}
              <span
                className={`text-sm font-mono font-bold ${isChiLow ? "text-red-600" : "text-emerald-600"}`}
              >
                {spaceMetrics.score}%
              </span>
            </div>
          </div>
          <div className="w-full bg-white h-2 rounded-full overflow-hidden mb-2 relative">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isChiLow
                  ? "bg-linear-to-r from-red-600 to-orange-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                  : "bg-linear-to-r from-emerald-500 to-amber-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
              }`}
              style={{ width: `${spaceMetrics.score}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-400 leading-normal font-sans">
            {spaceMetrics.hasSevereClash
              ? `警戒: 強力な方位凶殺（${spaceMetrics.worstClashType}）を検出`
              : "移動方向の地磁気エネルギーは安全領域"}
          </span>
        </div>

        {/* 人 - Human */}
        <div className="bg-white/70 border border-stone-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5">
              <Heart size={13} className="text-teal-600" />
              人（心身・相性シンクロ）
            </span>
            <div className="flex items-center gap-1">
              {isJinLow && (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <AlertTriangle size={12} className="text-red-500" />
                </motion.div>
              )}
              <span
                className={`text-sm font-mono font-bold ${isJinLow ? "text-red-600" : "text-teal-600"}`}
              >
                {humanMetrics.score}%
              </span>
            </div>
          </div>
          <div className="w-full bg-white h-2 rounded-full overflow-hidden mb-2 relative">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isJinLow
                  ? "bg-linear-to-r from-red-600 to-orange-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                  : "bg-linear-to-r from-teal-400 to-pink-500 shadow-[0_0_10px_rgba(45,212,191,0.4)]"
              }`}
              style={{ width: `${humanMetrics.score}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-400 leading-normal font-sans">
            {members.length > 0
              ? `相性: ${humanMetrics.compatibilityScore}% (同伴者 ${members.length} 名)`
              : "個人コンディションが100%連動中"}
          </span>
        </div>
      </div>

      {/* Advisory Text Board (Problem + Solution) */}
      <div
        className={`border p-4 rounded-xl flex gap-3 text-xs leading-relaxed ${
          advice.severity === "high"
            ? "bg-red-50 border-red-200 text-red-700"
            : advice.severity === "medium"
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          <AlertTriangle
            size={16}
            className={
              advice.severity === "high"
                ? "text-red-500"
                : advice.severity === "medium"
                  ? "text-amber-500"
                  : "text-emerald-500"
            }
          />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div>
            <span className="font-bold block mb-1">
              {advice.severity === "high"
                ? "【警告】地脈エネルギーの衝突"
                : advice.severity === "medium"
                  ? "【調整推奨】天・人の不整合"
                  : "【調和】完全整合化フェーズ"}
            </span>
            <p className="opacity-90">{advice.problem}</p>
            <p className="mt-1 font-semibold opacity-95">{advice.solution}</p>
          </div>

          {/* Action Trigger Button */}
          {advice.actionLabel &&
            (onApplyAction || advice.actionType === "NAVIGATE") && (
              <div className="mt-2 pt-2 border-t border-stone-200">
                <button
                  onClick={() => {
                    if (advice.actionType === "NAVIGATE") {
                      // Navigate fallback
                      const step = steps[singleStepIndex];
                      const dateStr = step
                        ? step.departureDate
                        : todayInJapan();
                      const queryParams = new URLSearchParams({
                        date: dateStr,
                        lon: String(step ? step.fromLon : 139.6917),
                      });
                      // Try to guess destination direction index if exists
                      if (step) {
                        const bearing = getBearing(
                          step.fromLat,
                          step.fromLon,
                          step.toLat,
                          step.toLon,
                        );
                        queryParams.append("bearing", String(bearing));
                      }
                      window.location.href = `/relocation/simulator?${queryParams.toString()}`;
                    } else if (onApplyAction) {
                      onApplyAction(advice.actionType, advice.actionData);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold tracking-wide text-[10px] font-mono transition-all duration-300 ${
                    advice.severity === "high"
                      ? "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                      : "bg-amber-500 text-black hover:bg-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                  }`}
                >
                  {advice.actionLabel}
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// Geometry helper to calculate bearing
function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
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

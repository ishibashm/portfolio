"use client";

import React, { useMemo } from "react";
import {
  AlertTriangle,
  Calendar,
  Compass,
  Heart,
  ChevronRight,
  BrainCircuit,
} from "lucide-react";
import { getClassicalYearStar } from "@/utils/ephemerisEngine";
import { buildTenChiJinVerdict } from "@/utils/tenChiJinVerdict";
import { todayInJapan } from "@/utils/japanDate";
import { directionLabelName } from "@/lib/directionLabels";
import { bearingBetween } from "@/utils/directionGeo";

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

/**
 * 日付ごとの評価から**この部品が読む 2 項目だけ**の形。
 *
 * 渡す側は他の項目も持っている（simulator の NbaDateEvaluation、
 * ScorecardPanel が組む qValue / suggestedAction / riskFactors）。
 * 全体を型にせず、読む枝だけを写す（#149 と同じ方針）。
 */
interface NbaEvaluationLike {
  /** FQI の期待報酬（-100〜+100）。天の点に写像する。 */
  qValue: number;
  riskFactors?: string[];
}

interface TenChiJinEvaluationProps {
  mode: "plan" | "step";
  steps: SimulatorStep[];
  members?: AccompanyingMember[];
  nbaEvaluations?: Record<string, NbaEvaluationLike>;
  simulatedAns?: number;
  simulatedShield?: number;
  /*
    data に渡るのは verdict.actionData（string | undefined）だけ。
    付くのは DATE（代替日の文字列）のみで、**DETOUR には付かない**。
    迂回の中継地は受け側が自分の候補（detourCandidates）から選ぶ。
    以前 any だった頃、受け側が DETOUR で data（＝常に undefined）を
    要求していて、ボタンが空振りしていた（#613 で発見）。
  */
  onApplyAction?: (
    actionType: "DETOUR" | "DATE" | "NAVIGATE" | "REST",
    data?: string,
  ) => void;
  // Optional parameters for direct step mode rendering
  singleStepIndex?: number;
  birthDate?: string; // Main user birthdate
}

/** 方位の見立て（大吉〜大凶）を点に直す。 */
export function rateToPoints(rating: string): number {
  if (rating === "大吉") return 100;
  if (rating === "吉") return 80;
  if (rating === "凶") return 20;
  if (rating === "大凶") return 0;
  return 60; // SAFE/普通
}

/**
 * 地（空間）の点。**歩みごとの方位の見立てだけ**を平均する。
 *
 * 以前はここに、同行者 1 人につき一律 60 点を足す仮置きが混ざっていた。
 * 同行者の本命星を計算しておきながら**結果を捨てていた**ので、誰を
 * 連れて行っても点は動かず、代わりに**人数のぶんだけ 60 点へ引き寄せ
 * られる**だけになっていた。しかも仮置きは歩みのループの内側にあり、
 * 歩み × 人数ぶん入る。
 *
 * 1 歩・大吉（100 点）で
 *
 *   同行者 0 人 → 100 / 1 人 → 80 / 2 人 → 73 / 4 人 → 68
 *
 * 1 歩・大凶（0 点）で
 *
 *   同行者 0 人 → 0 / 1 人 → 30 / 2 人 → 40 / 4 人 → 48
 *
 * 地の点は総合点の 6 割を占め、40 以下で「地が低い」の注意が出る。
 * **同行者を 2 人足すと大凶でもその注意が消えていた。**
 *
 * 同行者を評価に入れるのは機能として妥当だが、**何も計算していない値で
 * 点を動かすほうが、入れないより悪い。**実装されるまでは外す。
 * 同行者の相性は人（Jin）の側で本命星から実際に計算していて、そちらは
 * 従来どおり出る。
 */
export function spaceScoreFromRatings(ratings: string[]): number {
  if (ratings.length === 0) return 60;
  const total = ratings.reduce((sum, r) => sum + rateToPoints(r), 0);
  return Math.round(total / ratings.length);
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
  /**
   * 生年月日。**既定値を置かない。**
   *
   * 以前は運営者のものが入っていた。人（Jin）の
   * スコアは本命星の相性で決まるので、渡し忘れた画面には他人の命式で
   * 「総合シンクロ指数」が出る。空文字なら parseSafeDate が「今日生まれ」
   * に落ちるので、それも避けて下で描画そのものを止める。
   */
  birthDate = "",
}: TenChiJinEvaluationProps) {
  // Main User astrological hardware
  const mainUserBirthDateObj = useMemo(
    () => parseSafeDate(birthDate),
    [birthDate],
  );
  const mainUserStar = useMemo(
    () => getClassicalYearStar(mainUserBirthDateObj),
    [mainUserBirthDateObj],
  );

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
    const ratings: string[] = [];
    let hasSevereClash = false;
    let worstRating = "普通";
    let worstClashType = "";

    const stepsToEvaluate = mode === "plan" ? steps : [steps[singleStepIndex]];

    stepsToEvaluate.forEach((step) => {
      if (!step || !step.evaluation) return;

      ratings.push(step.evaluation.rating);

      const status = step.evaluation.status || "";
      if (["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA"].includes(status)) {
        hasSevereClash = true;
        worstRating = "大凶";
        // 呼び名は @/lib/directionLabels に集約。ここに表を戻さないこと。
        // 手元の三項では NOISE_HA を「歳破」固定にしていたが、破は盤で
        // 呼び名が変わる（年＝歳破・月＝月破・日＝日破）。どの盤か
        // 分からないので、集約先の併記（歳破/月破/日破）に合わせる。
        worstClashType = directionLabelName(status);
      }
    });

    return {
      score: spaceScoreFromRatings(ratings),
      hasSevereClash,
      worstRating,
      worstClashType,
    };
  }, [mode, steps, singleStepIndex]);

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

  /*
    帯と文言は tenChiJinVerdict が唯一の決め所。

    以前はここに別条件の分岐があり、バッジ（総合 70 超で良好）と
    食い違っていた。総合 70 の画面に「注意」バッジと緑の「安心して
    そのまま計画を実行してください」が同居していた（利用者の指摘）。
    食い違うときは悪いほうに揃える。規則は tenChiJinVerdict.ts に、
    固定は __tests__/tenChiJinVerdict.test.ts にある。
  */
  const verdict = useMemo(
    () =>
      buildTenChiJinVerdict({
        overallScore,
        hasSevereClash: spaceMetrics.hasSevereClash,
        worstClashType: spaceMetrics.worstClashType || null,
        timeScore: timeMetrics.score,
        humanScore: humanMetrics.score,
        spaceScore: spaceMetrics.score,
        timeRiskFactors: timeMetrics.riskFactors,
        highAnsLoad: simulatedAns > 60,
        bestAlternativeDate: timeMetrics.bestAlternativeDate ?? null,
        canApplyAction: Boolean(onApplyAction),
      }),
    [
      overallScore,
      spaceMetrics,
      timeMetrics,
      humanMetrics,
      simulatedAns,
      onApplyAction,
    ],
  );

  // Style helpers based on low-score warnings
  const isTenLow = timeMetrics.score <= 40;
  const isChiLow = spaceMetrics.score <= 40;
  const isJinLow = humanMetrics.score <= 40;

  // 生年月日が無いときは、指数を出さずに何が足りないかだけ出す。
  // hooks はすべて上で呼び終えているので、ここで返してよい。
  if (!birthDate) {
    return (
      <div className="bg-white/80 border border-stone-200 rounded-[2rem] p-6 backdrop-blur-md shadow-sm">
        <h3 className="text-sm font-semibold tracking-wider text-stone-600 flex items-center gap-2">
          <BrainCircuit size={16} className="text-stone-600" />
          天・地・人の総合評価
        </h3>
        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          生年月日が未入力です。人（心身・相性）の評価は本命星の相性から決まるため、生年月日が無いと総合の点は出せません。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-[2rem] p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-stone-200">
        <div>
          <h3 className="text-sm font-semibold tracking-wider text-stone-700 flex items-center gap-2">
            <BrainCircuit size={16} className="text-indigo-600" />
            天・地・人の総合評価
          </h3>
          <p className="mt-1 text-[11px] text-stone-500">
            方位（地）・時期（天）・心身と相性（人）の 3
            つで、この移動を見ます。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[9px] font-mono text-stone-600 block">
              総合
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className={`text-2xl font-black font-mono tracking-tighter ${
                  verdict.band === "good"
                    ? "text-emerald-700"
                    : verdict.band === "caution"
                      ? "text-amber-700"
                      : "text-red-600"
                }`}
              >
                {overallScore}
              </span>
              <span className="text-stone-600 text-xs font-mono">/100</span>
            </div>
          </div>
          <div
            className={`px-2.5 py-1 text-[10px] font-bold tracking-widest border rounded-md ${
              verdict.band === "good"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : verdict.band === "caution"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {verdict.bandLabel}
          </div>
        </div>
      </div>

      {/* 3 Indicators (Ten-Chi-Jin) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* 天 - Time */}
        <div className="bg-white/70 border border-stone-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5">
              <Calendar size={13} className="text-stone-500" />
              天（時期）
            </span>
            <div className="flex items-center gap-1">
              {isTenLow && <AlertTriangle size={12} className="text-red-600" />}
              <span
                className={`text-sm font-mono font-bold ${isTenLow ? "text-red-600" : "text-stone-800"}`}
              >
                {timeMetrics.score}%
              </span>
            </div>
          </div>
          <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${isTenLow ? "bg-red-600" : "bg-indigo-600"}`}
              style={{ width: `${timeMetrics.score}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-600 leading-normal font-sans">
            {timeMetrics.riskFactors.length > 0
              ? `${timeMetrics.riskFactors.slice(0, 2).join("・")}の障りがあります`
              : "土用・逆行などの障りは見当たりません"}
          </span>
        </div>

        {/* 地 - Space */}
        <div className="bg-white/70 border border-stone-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5">
              <Compass size={13} className="text-stone-500" />
              地（方位）
            </span>
            <div className="flex items-center gap-1">
              {isChiLow && <AlertTriangle size={12} className="text-red-600" />}
              <span
                className={`text-sm font-mono font-bold ${isChiLow ? "text-red-600" : "text-stone-800"}`}
              >
                {spaceMetrics.score}%
              </span>
            </div>
          </div>
          <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${isChiLow ? "bg-red-600" : "bg-indigo-600"}`}
              style={{ width: `${spaceMetrics.score}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-600 leading-normal font-sans">
            {spaceMetrics.hasSevereClash
              ? `${spaceMetrics.worstClashType}に当たっています`
              : "この方位に大きな凶殺はありません"}
          </span>
        </div>

        {/* 人 - Human */}
        <div className="bg-white/70 border border-stone-200 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-stone-500 flex items-center gap-1.5">
              <Heart size={13} className="text-stone-500" />
              人（心身・相性）
            </span>
            <div className="flex items-center gap-1">
              {isJinLow && <AlertTriangle size={12} className="text-red-600" />}
              <span
                className={`text-sm font-mono font-bold ${isJinLow ? "text-red-600" : "text-stone-800"}`}
              >
                {humanMetrics.score}%
              </span>
            </div>
          </div>
          <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${isJinLow ? "bg-red-600" : "bg-indigo-600"}`}
              style={{ width: `${humanMetrics.score}%` }}
            />
          </div>
          <span className="text-[10px] text-stone-600 leading-normal font-sans">
            {members.length > 0
              ? `相性: ${humanMetrics.compatibilityScore}% (同伴者 ${members.length} 名)`
              : "同伴者なし。本人の状態だけで見ています"}
          </span>
        </div>
      </div>

      {/* Advisory Text Board (Problem + Solution) */}
      <div
        className={`border p-4 rounded-xl flex gap-3 text-xs leading-relaxed ${
          verdict.band === "danger"
            ? "bg-red-50 border-red-200 text-red-700"
            : verdict.band === "caution"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          <AlertTriangle
            size={16}
            className={
              verdict.band === "danger"
                ? "text-red-600"
                : verdict.band === "caution"
                  ? "text-amber-700"
                  : "text-emerald-700"
            }
          />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div>
            <span className="font-bold block mb-1">{verdict.title}</span>
            <p className="opacity-90">{verdict.problem}</p>
            <p className="mt-1 font-semibold opacity-95">{verdict.solution}</p>
          </div>

          {/* Action Trigger Button */}
          {verdict.actionLabel &&
            (onApplyAction || verdict.actionType === "NAVIGATE") && (
              <div className="mt-2 pt-2 border-t border-stone-200">
                <button
                  onClick={() => {
                    if (verdict.actionType === "NAVIGATE") {
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
                        const bearing = bearingBetween(
                          step.fromLat,
                          step.fromLon,
                          step.toLat,
                          step.toLon,
                        );
                        queryParams.append("bearing", String(bearing));
                      }
                      window.location.href = `/relocation/simulator?${queryParams.toString()}`;
                    } else if (onApplyAction && verdict.actionType) {
                      onApplyAction(verdict.actionType, verdict.actionData);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold tracking-wide text-[11px] transition-colors ${
                    verdict.band === "danger"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-stone-800 text-white hover:bg-stone-900"
                  }`}
                >
                  {verdict.actionLabel}
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

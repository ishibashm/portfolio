"use client";

/**
 * ホームの「5. 総合スコア」タブの中身と、方位詳細ドロワー（タブ分割 2/3）。
 *
 * SolarTimeClock から移しただけで、計算・表示は 1 つも変えていない。
 * 参照している値はすべて props で受ける。状態の持ち主は今までどおり
 * SolarTimeClock（データ読込の effect が参照する・タブを離れても値を
 * 保つ従来挙動のため。局所に見える showNoiseDirections なども、局所に
 * すると別のタブへ移った時点で消えてしまう）。
 *
 * ドロワーは selectedDirection で開き、タブを離れても開いたままになる。
 * 呼び出し側は `activeTab === "scorecard" || selectedDirection !== null`
 * でマウントし、タブ本体の描画だけを `active` で切り替える。
 */

import React from "react";
import { Loader2 } from "lucide-react";
import { TenChiJinEvaluation } from "../nba/TenChiJinEvaluation";
import type { NBAData } from "../nba/NBADashboard";
import type { MunicipalityWealthItem } from "@/lib/municipalityWealth";
import type { ScoredProperty } from "@/lib/scoredProperty";
import {
  SCORE_TIER_LEGEND,
  scoreCellClass,
  getStatusScore,
  scoreTierLabel,
  scoreTextColor,
} from "@/lib/scoreTier";
import type {
  Direction,
  StarFrequency,
  getHonmeiStar,
} from "../../utils/ephemerisEngine";
import { todayInJapan, toJapanDateString } from "@/utils/japanDate";

/**
 * 総合スコアが扱う 8 方位（中央を除く）。SolarTimeClock 側の memo も
 * 同じ型を使う（同じ形を 2 か所に書かない）。
 */
export type ScorecardDirection = Exclude<Direction, "CENTER">;

/** 方位 1 つぶんの判定セル。3 モデル比較の升と 30 日予測の升で共通。 */
export interface ScorecardDirectionCell {
  status: string;
  score: number;
  kigakuScore: number;
  astroBonus: number;
  timeGateModifier: number;
}

type ScorecardModels = Record<
  "classical" | "physicalIndep" | "physicalCoupled",
  Record<ScorecardDirection, ScorecardDirectionCell>
>;

/** 30 日予測（日付×方位×3 モデル）の 1 日ぶん。 */
export interface ScorecardDayForecastEntry {
  dateStr: string;
  weekday: number;
  models: ScorecardModels;
}

/** 本命星別予測（星×方位×3 モデル）の 1 星ぶん。 */
export interface ScorecardStarForecastEntry {
  star: StarFrequency;
  label: string;
  models: ScorecardModels;
}

/** 方位 1 行ぶんの集計。SolarTimeClock の scorecardSummary が作る形。 */
export interface ScorecardSummaryRow {
  direction: Direction;
  labelJa: string;
  status: string;
  score: number;
  isNoise: boolean;
  luckyDays: number;
  dates: { dateStr: string; status: string; score: number }[];
  topArea: MunicipalityWealthItem | null;
  topAreas: MunicipalityWealthItem[];
  topRental: ScoredProperty | null;
  topRentals: ScoredProperty[];
  classicalStatus: string;
  classicalScore: number;
  physicalIndepStatus: string;
  physicalIndepScore: number;
  physicalCoupledStatus: string;
  physicalCoupledScore: number;
  isConsensusClear: boolean;
  isDivergenceAlert: boolean;
}

/*
  段階の色は表・札・詳細のどこでも同じでなければならない。同じ実装が
  2 か所に写されていたので、ここに 1 つだけ置いて全部から引く。
*/
const statusBadgeClass = (s: string) => {
  if (s === "OPTIMAL")
    return "text-emerald-600 bg-emerald-500/10 border-emerald-200";
  if (s === "OPTIMAL_REGULAR")
    return "text-emerald-500 bg-emerald-500/5 border-emerald-200";
  if (s === "SAFE") return "text-blue-600 bg-blue-500/10 border-blue-200";
  if (s === "WARNING")
    return "text-orange-600 bg-orange-500/10 border-orange-200";
  if (s.startsWith("NOISE_VOID"))
    return "text-stone-600 bg-stone-100 border-stone-300";
  if (s.startsWith("NOISE_NODE"))
    return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  return "text-red-600 bg-red-500/10 border-red-200";
};

const kigakuTextClass = (s: string) => {
  if (s === "OPTIMAL" || s === "OPTIMAL_REGULAR") return "text-emerald-600";
  if (s === "SAFE") return "text-blue-600";
  if (s === "WARNING") return "text-orange-600";
  return "text-red-600";
};

const parseBreakdown = (
  item: { astrologyStatus?: string | null } | null | undefined,
) => {
  if (!item || !item.astrologyStatus) {
    return {
      kigaku: "SAFE",
      kigakuScore: 80,
      astro: [],
      astroScore: 0,
      timeGate: [],
      timeGateScore: 0,
    };
  }

  const parts = item.astrologyStatus.split(" + ");
  const kigaku = parts[0] || "SAFE";
  const kigakuScore = getStatusScore(kigaku);
  const flags = parts[1] ? parts[1].split(",") : [];

  let astroScore = 0;
  const astro: string[] = [];
  if (flags.includes("JUPITER_ASC")) {
    astroScore += 30;
    astro.push("木星ASC");
  }
  if (flags.includes("JUPITER_MC")) {
    astroScore += 30;
    astro.push("木星MC");
  }
  if (flags.includes("VENUS_ASC")) {
    astroScore += 15;
    astro.push("金星ASC");
  }
  if (flags.includes("VENUS_MC")) {
    astroScore += 15;
    astro.push("金星MC");
  }

  let timeGateScore = 0;
  const timeGate: string[] = [];
  if (flags.includes("LUNAR_BOOST")) {
    timeGateScore += 10;
    timeGate.push("月相満ち");
  }
  if (flags.includes("LUNAR_PENALTY")) {
    timeGateScore -= 10;
    timeGate.push("月相欠け");
  }
  if (flags.includes("DOYOU_HAZARD")) {
    timeGateScore -= 30;
    timeGate.push("土用期間");
  }
  if (flags.includes("VOID_TIME_HAZARD")) {
    timeGateScore -= 100;
    timeGate.push("天中殺");
  }

  return { kigaku, kigakuScore, astro, astroScore, timeGate, timeGateScore };
};

/*
  以前はここで、トリプル大吉なら緑・位相差警告なら橙を「先に」返して
  いた。どちらも凡例が別の意味に割り当てている色なので、点が 8 の升目
  が「警告（≥ 30）」の橙で出ていた（利用者の画面で実際にそうなって
  いた）。地色は段階だけが決める形に戻し、印は枠線と 🌟 / ⚠️ で示す。
  塗り分けの実装は lib/scoreTier に置いた。
*/
const getCellBgColor = (
  score: number,
  status: string,
  isConsensus?: boolean,
  isDivergence?: boolean,
) => {
  void status;
  return scoreCellClass(score, {
    consensus: isConsensus,
    divergence: isDivergence,
  });
};

const getDimensionCellBgColor = (
  dimension: "total" | "kigaku" | "astro" | "timeGate",
  score: number,
  status: string,
  isConsensus?: boolean,
  isDivergence?: boolean,
) => {
  if (dimension === "total") {
    return getCellBgColor(score, status, isConsensus, isDivergence);
  }
  if (dimension === "kigaku") {
    return getCellBgColor(score, status);
  }
  if (dimension === "astro") {
    if (score >= 30) return "bg-blue-50 text-blue-600 border border-blue-200";
    if (score > 0) return "bg-blue-50 text-blue-400/80 border border-blue-200";
    return "text-stone-600 border border-stone-200";
  }
  if (dimension === "timeGate") {
    if (score <= -100)
      return "bg-red-50 text-red-600 border border-red-500/35 font-bold";
    if (score < 0) return "bg-amber-50 text-amber-700 border border-amber-200";
    if (score > 0)
      return "bg-emerald-50 text-emerald-600 border border-emerald-200";
    return "text-stone-600 border border-stone-200";
  }
  return "";
};

export interface ScorecardPanelProps {
  /** 「5. 総合スコア」タブが開いているか。false ならドロワーだけ描く。 */
  active: boolean;
  scorecardLoading: boolean;
  scorecardSummary: ScorecardSummaryRow[];
  scorecard30DaysForecastAllModels: ScorecardDayForecastEntry[] | null;
  scorecardHonmeiStarsForecast: ScorecardStarForecastEntry[] | null;
  selectedDirection: Direction | null;
  setSelectedDirection: React.Dispatch<React.SetStateAction<Direction | null>>;
  showNoiseDirections: boolean;
  setShowNoiseDirections: React.Dispatch<React.SetStateAction<boolean>>;
  scorecardPrefecture: string;
  setScorecardPrefecture: React.Dispatch<React.SetStateAction<string>>;
  gridModelView:
    | "consensus"
    | "classical"
    | "physicalIndep"
    | "physicalCoupled";
  setGridModelView: React.Dispatch<
    React.SetStateAction<
      "consensus" | "classical" | "physicalIndep" | "physicalCoupled"
    >
  >;
  scorecardActiveGridTab: "dates" | "stars";
  setScorecardActiveGridTab: React.Dispatch<
    React.SetStateAction<"dates" | "stars">
  >;
  gridDimension: "total" | "kigaku" | "astro" | "timeGate";
  setGridDimension: React.Dispatch<
    React.SetStateAction<"total" | "kigaku" | "astro" | "timeGate">
  >;
  isExporting: boolean;
  handleExportGridCsv: () => void;
  handleExportForGemini: () => void;
  handleDownloadUnifiedDataset: () => void;
  nbaData: NBAData | null;
  honmeiStar: ReturnType<typeof getHonmeiStar> | null;
  useClassicalBoard: boolean;
  lat: number;
  lon: number;
  baseTime: Date | null;
  birthDate: string;
  wealthData: MunicipalityWealthItem[];
}

export default function ScorecardPanel({
  active,
  scorecardLoading,
  scorecardSummary,
  scorecard30DaysForecastAllModels,
  scorecardHonmeiStarsForecast,
  selectedDirection,
  setSelectedDirection,
  showNoiseDirections,
  setShowNoiseDirections,
  scorecardPrefecture,
  setScorecardPrefecture,
  gridModelView,
  setGridModelView,
  scorecardActiveGridTab,
  setScorecardActiveGridTab,
  gridDimension,
  setGridDimension,
  isExporting,
  handleExportGridCsv,
  handleExportForGemini,
  handleDownloadUnifiedDataset,
  nbaData,
  honmeiStar,
  useClassicalBoard,
  lat,
  lon,
  baseTime,
  birthDate,
  wealthData,
}: ScorecardPanelProps) {
  return (
    <>
      {/* --- TAB CONTENT: 5. SCORECARD --- */}
      {active && (
        <div className="w-full flex flex-col items-center space-y-6 animate-fade-in max-w-[1700px]">
          {/* Control Panel Header */}
          {/*
              説明文とコントロールを横並びにすると、当時のコンテナ幅 896px に
              対してコントロール群が 606px を占め、説明文が 212px まで潰れる。
              日本語は文字ごとに改行できるため min-content が実質 1 文字になり、
              flex の min-width:auto では守られない（実測で 768px 以上の全幅で
              1〜2文字ずつの縦書きのようになっていた）。縦に積む。
            */}
          <div className="w-full bg-white border border-stone-200 rounded-xl p-4 md:p-6 shadow-lg relative overflow-hidden flex flex-col gap-4">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div>
              <h2 className="text-emerald-500 font-mono text-base tracking-[0.1em] font-bold mb-1 uppercase flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                5. 総合スコア / 8方位統合評価マトリクス
              </h2>
              <p className="text-stone-500 text-[10px] sm:text-xs leading-relaxed max-w-xl">
                直近30日の時空波動予測、各方位における富裕エリア所得、および賃貸相場に対する割安度の偏差値指標を統合した意思決定コックピットです。
              </p>
              <div className="mt-2 text-stone-600 text-[9px] leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong className="text-emerald-600">🌟 トリプル大吉:</strong>{" "}
                  3つの計算モデル（古典/物理独立/伝統連動）すべてで吉方位となる最も安全な方位。
                </span>
                <span>
                  <strong className="text-amber-500">⚠️ 位相差警告:</strong>{" "}
                  計算モデル間で吉凶判定が分かれる（一方は吉、他方は凶など）ため、注意が必要な方位。
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Prefecture Filter */}
              <div className="flex items-center gap-1.5 bg-stone-50 px-2 py-1.5 rounded-md border border-stone-200">
                <span className="text-stone-500 font-mono text-[9px] uppercase tracking-wider">
                  対象県:
                </span>
                <select
                  value={scorecardPrefecture}
                  onChange={(e) => setScorecardPrefecture(e.target.value)}
                  className="bg-white text-stone-700 border-0 text-[10px] font-mono focus:outline-none focus:ring-0 cursor-pointer"
                >
                  <option value="all">全国 (すべて)</option>
                  <option value="愛知県">愛知県</option>
                  <option value="東京都">東京都</option>
                  <option value="大阪府">大阪府</option>
                  <option value="神奈川県">神奈川県</option>
                  <option value="埼玉県">埼玉県</option>
                  <option value="千葉県">千葉県</option>
                  <option value="京都府">京都府</option>
                  <option value="兵庫県">兵庫県</option>
                  <option value="福岡県">福岡県</option>
                </select>
              </div>

              {/* Visibility Toggle */}
              <button
                onClick={() => setShowNoiseDirections(!showNoiseDirections)}
                className={`px-3 py-1.5 text-[9px] font-mono rounded-md border transition-all flex items-center gap-1.5 ${
                  showNoiseDirections
                    ? "bg-stone-100 text-stone-600 border-stone-300"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                }`}
              >
                {showNoiseDirections
                  ? "☐ NOISE方位を表示中"
                  : "☑ NOISE方位を非表示"}
              </button>

              {/* Gemini Export Button */}
              <button
                onClick={handleExportForGemini}
                disabled={isExporting}
                className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-stone-900 font-mono text-[9px] uppercase tracking-widest rounded-md transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    エクスポート中...
                  </>
                ) : (
                  <>
                    <span>EXPORT FOR GEMINI</span>
                  </>
                )}
              </button>

              {/* Unified Master Export Button */}
              <button
                onClick={handleDownloadUnifiedDataset}
                disabled={isExporting}
                className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-stone-900 font-mono text-[9px] uppercase tracking-widest rounded-md transition-all shadow-[0_0_15px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    エクスポート中...
                  </>
                ) : (
                  <>
                    <span>UNIFIED MASTER EXPORT</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {scorecardLoading && wealthData.length === 0 ? (
            <div className="w-full bg-stone-50 border border-stone-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <span className="text-[10px] font-mono text-stone-600 tracking-[0.2em] uppercase">
                Loading Relocation Scenarios...
              </span>
            </div>
          ) : (
            <div
              className={`w-full overflow-hidden bg-stone-50 border border-stone-200 rounded-xl shadow-2xl relative transition-opacity duration-300 ${scorecardLoading ? "opacity-65 pointer-events-none" : ""}`}
            >
              {scorecardLoading && (
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse z-50"></div>
              )}
              {/*
                  この表は 11 列あって 1120px 無いと収まらない。以前は
                  どの画面幅でも表のまま出していたので、タブレットでは
                  見出し行だけが横に流れ、「方位　古典　物理独立 …」が
                  押して選ぶ帯（タブ）に見える、と利用者から報告があった。
                  実際には選べないし、なぜ流れるのかも画面からは分からない。

                  狭い画面では表をやめて方位ごとの札にする。出す中身は
                  表とまったく同じで、並べ方を縦にするだけ。これで横に
                  流れる帯が無くなり、押せる単位（＝方位の札）が見た目で
                  分かるようになる。
                */}
              <div className="2xl:hidden divide-y divide-stone-200">
                {scorecardSummary
                  .filter((item) => showNoiseDirections || !item.isNoise)
                  .map((item) => {
                    const bd = parseBreakdown(item.topArea);
                    const models = [
                      {
                        label: "古典",
                        status: item.classicalStatus,
                        score: item.classicalScore,
                      },
                      {
                        label: "物理独立",
                        status: item.physicalIndepStatus,
                        score: item.physicalIndepScore,
                      },
                      {
                        label: "伝統連動",
                        status: item.physicalCoupledStatus,
                        score: item.physicalCoupledScore,
                      },
                    ];

                    return (
                      <div
                        key={item.direction}
                        onClick={() => setSelectedDirection(item.direction)}
                        className="p-4 space-y-3 hover:bg-white/80 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono font-bold text-stone-700">
                            {item.labelJa} ({item.direction})
                          </span>
                          {item.isConsensusClear && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                              トリプル大吉 🌟
                            </span>
                          )}
                          {item.isDivergenceAlert && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              位相差警告 ⚠️
                            </span>
                          )}
                        </div>

                        {/* 3 つの計算モデル */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {models.map((m) => (
                            <div
                              key={m.label}
                              className="flex items-center justify-between gap-2 bg-white border border-stone-200 rounded-lg px-2.5 py-1.5"
                            >
                              <span className="text-[10px] text-stone-600">
                                {m.label}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider ${statusBadgeClass(m.status)}`}
                                >
                                  {m.status.replace("NOISE_", "")}
                                </span>
                                <span
                                  className={`font-mono font-bold text-[10px] ${scoreTextColor(m.score)}`}
                                >
                                  {m.score}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 3 つの個別判断軸 */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono">
                          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] text-stone-600">
                              ① 気学方位
                            </div>
                            <div
                              className={`font-bold ${kigakuTextClass(bd.kigaku)}`}
                            >
                              {bd.kigaku.replace("NOISE_", "")}
                            </div>
                            <div className="text-[9px] text-stone-600">
                              ベース: {bd.kigakuScore}点
                            </div>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] text-stone-600">
                              ② アストロ
                            </div>
                            <div
                              className={`text-[10px] ${bd.astroScore > 0 ? "text-blue-600 font-bold" : "text-stone-600"}`}
                            >
                              {bd.astro.length > 0
                                ? bd.astro.join(", ")
                                : "ラインなし"}
                            </div>
                            <div className="text-[9px] text-stone-600">
                              加算: +{bd.astroScore}点
                            </div>
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                            <div className="text-[10px] text-stone-600">
                              ③ 時間ゲート
                            </div>
                            <div
                              className={`text-[10px] ${bd.timeGateScore < 0 ? "text-red-600 font-bold" : bd.timeGateScore > 0 ? "text-emerald-600 font-bold" : "text-stone-600"}`}
                            >
                              {bd.timeGate.length > 0
                                ? bd.timeGate.join(", ")
                                : "通常時間"}
                            </div>
                            <div className="text-[9px] text-stone-600">
                              調整: {bd.timeGateScore > 0 ? "+" : ""}
                              {bd.timeGateScore}点
                            </div>
                          </div>
                        </div>

                        <div className="text-[10px] text-stone-600 space-y-0.5">
                          <div>
                            <span className="text-stone-500">30日吉日:</span>{" "}
                            <span className="font-mono">
                              {item.luckyDays}日
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-500">推奨エリア:</span>{" "}
                            {item.topArea ? (
                              <span className="text-stone-700 font-bold">
                                {item.topArea.areaName}
                                <span className="font-mono font-normal text-stone-600">
                                  （所得{" "}
                                  {(
                                    item.topArea.incomePerCapita / 10000
                                  ).toFixed(0)}
                                  万円）
                                </span>
                              </span>
                            ) : (
                              <span className="italic">データなし</span>
                            )}
                          </div>
                          <div>
                            <span className="text-stone-500">推奨物件:</span>{" "}
                            {item.topRental ? (
                              <span className="text-stone-700 font-bold">
                                {item.topRental.property_name}
                                <span className="font-mono font-normal text-stone-600">
                                  （賃料{" "}
                                  {(item.topRental.totalRent / 10000).toFixed(
                                    1,
                                  )}
                                  万円）
                                </span>
                              </span>
                            ) : (
                              <span className="italic">対象物件なし</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="hidden 2xl:block overflow-x-auto">
                {/*
                    12 列のうち 9 列に固定幅を振っているため、w-full だけだと
                    幅指定の無い末尾 2 列にしわ寄せが行く。日本語は文字ごとに
                    改行できるので、1440px 幅でも見出しが幅 39px・9 行に
                    潰れていた。外枠は横スクロールするので内容ぶんの幅を取らせる。
                  */}
                <table className="w-full min-w-[1120px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 bg-white/80 text-[9px] font-mono text-stone-500 uppercase tracking-wider whitespace-nowrap">
                      <th className="p-3 w-24">方位 (Sector)</th>
                      <th className="p-3 w-20">古典 (Classical)</th>
                      <th className="p-3 w-20">物理独立 (Phys Indep)</th>
                      <th className="p-3 w-20">伝統連動 (Phys Coupled)</th>
                      <th className="p-3 w-28 text-center">合意判定</th>

                      {/* 3つの個別判断軸カラム */}
                      <th className="p-3 w-32 bg-emerald-50 border-x border-emerald-200">
                        ① 気学方位 (Kigaku)
                      </th>
                      <th className="p-3 w-32 bg-blue-50 border-r border-blue-200">
                        ② アストロ (Astro)
                      </th>
                      <th className="p-3 w-32 bg-amber-50 border-r border-amber-200">
                        ③ 時間ゲート (Time)
                      </th>

                      <th className="p-3 w-20 text-center">30日吉日</th>
                      <th className="p-3">推奨エリア (所得)</th>
                      <th className="p-3">推奨物件 (差益)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50 text-xs">
                    {scorecardSummary
                      .filter((item) => showNoiseDirections || !item.isNoise)
                      .map((item) => {
                        const bd = parseBreakdown(item.topArea);
                        return (
                          <tr
                            key={item.direction}
                            onClick={() => setSelectedDirection(item.direction)}
                            className="hover:bg-white/80 transition-colors cursor-pointer group"
                          >
                            {/* Direction */}
                            <td className="p-3 font-mono font-bold text-stone-700 flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-[10px] text-stone-600">
                                ▶
                              </span>
                              {item.labelJa} ({item.direction})
                            </td>

                            {/* Classical Model */}
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider ${statusBadgeClass(item.classicalStatus)}`}
                                >
                                  {item.classicalStatus.replace("NOISE_", "")}
                                </span>
                                <span
                                  className={`font-mono font-bold text-[10px] ${scoreTextColor(
                                    item.classicalScore,
                                  )}`}
                                >
                                  {item.classicalScore}
                                </span>
                              </div>
                            </td>

                            {/* Physical Independent Model */}
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider ${statusBadgeClass(item.physicalIndepStatus)}`}
                                >
                                  {item.physicalIndepStatus.replace(
                                    "NOISE_",
                                    "",
                                  )}
                                </span>
                                <span
                                  className={`font-mono font-bold text-[10px] ${scoreTextColor(
                                    item.physicalIndepScore,
                                  )}`}
                                >
                                  {item.physicalIndepScore}
                                </span>
                              </div>
                            </td>

                            {/* Physical Coupled Model */}
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider ${statusBadgeClass(item.physicalCoupledStatus)}`}
                                >
                                  {item.physicalCoupledStatus.replace(
                                    "NOISE_",
                                    "",
                                  )}
                                </span>
                                <span
                                  className={`font-mono font-bold text-[10px] ${scoreTextColor(
                                    item.physicalCoupledScore,
                                  )}`}
                                >
                                  {item.physicalCoupledScore}
                                </span>
                              </div>
                            </td>

                            {/* Consensus / Highlights */}
                            <td className="p-3 whitespace-nowrap text-center">
                              {item.isConsensusClear && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                  トリプル大吉 🌟
                                </span>
                              )}
                              {item.isDivergenceAlert && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  位相差警告 ⚠️
                                </span>
                              )}
                              {!item.isConsensusClear &&
                                !item.isDivergenceAlert && (
                                  <span className="text-stone-600 text-[10px] font-mono">
                                    -
                                  </span>
                                )}
                            </td>

                            {/* ① 気学方位 */}
                            <td className="p-3 bg-emerald-50 border-x border-stone-200 font-mono">
                              <div className="flex flex-col">
                                <span
                                  className={`font-bold ${kigakuTextClass(bd.kigaku)}`}
                                >
                                  {bd.kigaku.replace("NOISE_", "")}
                                </span>
                                <span className="text-[9px] text-stone-600">
                                  ベース: {bd.kigakuScore}点
                                </span>
                              </div>
                            </td>

                            {/* ② アストロ */}
                            <td className="p-3 bg-blue-50 border-r border-stone-200 font-mono">
                              <div className="flex flex-col">
                                <span
                                  className={`text-[10px] ${bd.astroScore > 0 ? "text-blue-600 font-bold" : "text-stone-600"}`}
                                >
                                  {bd.astro.length > 0
                                    ? bd.astro.join(", ")
                                    : "ラインなし"}
                                </span>
                                <span className="text-[9px] text-stone-600">
                                  加算: +{bd.astroScore}点
                                </span>
                              </div>
                            </td>

                            {/* ③ 時間ゲート */}
                            <td className="p-3 bg-amber-50 border-r border-stone-200 font-mono">
                              <div className="flex flex-col">
                                <span
                                  className={`text-[10px] ${bd.timeGateScore < 0 ? "text-red-600 font-bold" : bd.timeGateScore > 0 ? "text-emerald-600 font-bold" : "text-stone-600"}`}
                                >
                                  {bd.timeGate.length > 0
                                    ? bd.timeGate.join(", ")
                                    : "通常時間"}
                                </span>
                                <span className="text-[9px] text-stone-600 border-t border-stone-200 mt-0.5 pt-0.5">
                                  調整: {bd.timeGateScore > 0 ? "+" : ""}
                                  {bd.timeGateScore}点
                                </span>
                              </div>
                            </td>

                            {/* 30日吉日 */}
                            <td className="p-3 text-center font-mono text-[10px] text-stone-500">
                              {item.luckyDays}日
                            </td>

                            {/* Recommended Area */}
                            <td className="p-3">
                              {item.topArea ? (
                                <div className="flex flex-col">
                                  {/* 応答の項目は areaName / incomePerCapita。
                                        以前は municipality_name_ja と
                                        averageIncome を読んでおり、どちらも
                                        存在しないため地域名が空欄・所得が
                                        「NaN万円」になっていた。万円への
                                        換算は移住比較のページと同じ。 */}
                                  <span className="text-stone-700 font-bold truncate max-w-[180px]">
                                    {item.topArea.areaName}
                                  </span>
                                  <span className="text-[10px] text-stone-600 font-mono mt-0.5">
                                    所得:{" "}
                                    {(
                                      item.topArea.incomePerCapita / 10000
                                    ).toFixed(0)}
                                    万円
                                  </span>
                                </div>
                              ) : (
                                <span className="text-stone-600 text-[10px] italic">
                                  データなし
                                </span>
                              )}
                            </td>

                            {/* Recommended Property */}
                            <td className="p-3">
                              {item.topRental ? (
                                item.topRental.url ? (
                                  <a
                                    href={item.topRental.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col group/item cursor-pointer"
                                  >
                                    <span
                                      className="text-stone-700 font-bold group-hover/item:text-indigo-600 group-hover/item:underline transition-all truncate max-w-[200px]"
                                      title={item.topRental.property_name}
                                    >
                                      {item.topRental.property_name}
                                    </span>
                                    <span className="text-[10px] text-stone-600 font-mono mt-0.5 group-hover/item:text-zinc-450">
                                      賃料:{" "}
                                      {(
                                        item.topRental.totalRent / 10000
                                      ).toFixed(1)}
                                      万円
                                    </span>
                                  </a>
                                ) : (
                                  <div className="flex flex-col">
                                    <span
                                      className="text-stone-700 font-bold truncate max-w-[200px]"
                                      title={item.topRental.property_name}
                                    >
                                      {item.topRental.property_name}
                                    </span>
                                    <span className="text-[10px] text-stone-600 font-mono mt-0.5">
                                      賃料:{" "}
                                      {(
                                        item.topRental.totalRent / 10000
                                      ).toFixed(1)}
                                      万円
                                    </span>
                                  </div>
                                )
                              ) : (
                                <span className="text-stone-600 text-[10px] italic">
                                  対象物件なし
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- MULTI-MODEL GRID SCORECARD (大量パターンスコア表) --- */}
          <div className="w-full bg-white border border-stone-200 rounded-xl p-4 md:p-6 shadow-lg space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-stone-700 font-mono text-sm tracking-[0.1em] font-bold mb-1 uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  多次元吉凶パターンマトリクス (Grid Scorecard)
                </h3>
                <p className="text-stone-600 text-[10px] sm:text-xs">
                  本命星別、または日付別の全方位吉凶パターンを網羅した詳細グリッド表です。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Grid Selector Toggles */}
                <div className="flex bg-stone-50 p-1 rounded-md border border-stone-200 text-[10px] font-mono">
                  <button
                    onClick={() => setScorecardActiveGridTab("dates")}
                    className={`px-3 py-1 rounded transition-all ${
                      scorecardActiveGridTab === "dates"
                        ? "bg-emerald-600 text-stone-900 font-bold"
                        : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    30日カレンダー
                  </button>
                  <button
                    onClick={() => setScorecardActiveGridTab("stars")}
                    className={`px-3 py-1 rounded transition-all ${
                      scorecardActiveGridTab === "stars"
                        ? "bg-emerald-600 text-stone-900 font-bold"
                        : "text-stone-500 hover:text-stone-700"
                    }`}
                  >
                    九星本命星別 (当日)
                  </button>
                </div>

                {/* Model Selector */}
                <select
                  value={gridModelView}
                  onChange={(e) =>
                    setGridModelView(e.target.value as typeof gridModelView)
                  }
                  className="bg-stone-50 text-stone-600 border border-stone-200 rounded-md px-2 py-1 text-[10px] font-mono focus:outline-none cursor-pointer"
                >
                  <option value="consensus">合意判定 (Consensus)</option>
                  <option value="classical">古典暦モデル (Classical)</option>
                  <option value="physicalIndep">
                    物理独立モデル (Phys Indep)
                  </option>
                  <option value="physicalCoupled">
                    伝統連動モデル (Phys Coupled)
                  </option>
                </select>

                {/* 表示軸 (Dimension Selector) */}
                <select
                  value={gridDimension}
                  onChange={(e) =>
                    setGridDimension(e.target.value as typeof gridDimension)
                  }
                  className="bg-stone-50 text-stone-600 border border-stone-200 rounded-md px-2 py-1 text-[10px] font-mono focus:outline-none cursor-pointer"
                >
                  <option value="total">表示軸: 総合スコア</option>
                  <option value="kigaku">表示軸: ①気学方位</option>
                  <option value="astro">表示軸: ②アストロライン</option>
                  <option value="timeGate">表示軸: ③時間ゲート</option>
                </select>

                {/* CSV Export Button */}
                <button
                  onClick={handleExportGridCsv}
                  className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-300 font-mono text-[9px] uppercase tracking-wider rounded transition-all"
                >
                  EXPORT PATTERN CSV
                </button>
              </div>
            </div>

            {/* Legend for Grid */}
            <div className="flex flex-wrap gap-3 text-[9px] font-mono text-stone-600 bg-white/80 p-2.5 rounded border border-stone-200">
              {/* しきい値を凡例に直書きしない。lib/scoreTier から引く。 */}
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-200"></span>
                {SCORE_TIER_LEGEND[0].label} ({SCORE_TIER_LEGEND[0].bound})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200"></span>
                {SCORE_TIER_LEGEND[1].label} ({SCORE_TIER_LEGEND[1].bound})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200"></span>
                {SCORE_TIER_LEGEND[2].label} ({SCORE_TIER_LEGEND[2].bound})
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-red-50 border border-red-200"></span>
                大凶 (その他)
              </span>
              {gridModelView === "consensus" && (
                <>
                  <span className="text-emerald-600">🌟 = トリプル大吉</span>
                  <span className="text-amber-500">⚠️ = 位相差警告</span>
                </>
              )}
            </div>

            {/* Grid Table */}
            <div className="w-full overflow-hidden bg-stone-50 border border-zinc-850 rounded-lg shadow-inner">
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-white/80 text-[9px] font-mono text-stone-500 uppercase tracking-wider">
                      <th className="p-2.5 text-left w-28">
                        {scorecardActiveGridTab === "dates" ? "日付" : "本命星"}
                      </th>
                      {["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map(
                        (dir) => {
                          const dirLabels: Record<string, string> = {
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
                            <th key={dir} className="p-2.5 w-20">
                              {dirLabels[dir]} ({dir})
                            </th>
                          );
                        },
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50 text-[10px] font-mono">
                    {scorecardActiveGridTab === "dates"
                      ? scorecard30DaysForecastAllModels?.map((day) => {
                          const wdayJa = [
                            "日",
                            "月",
                            "火",
                            "水",
                            "木",
                            "金",
                            "土",
                          ][day.weekday];
                          const wdayColor =
                            day.weekday === 0
                              ? "text-red-600"
                              : day.weekday === 6
                                ? "text-blue-600"
                                : "text-stone-500";
                          return (
                            <tr
                              key={day.dateStr}
                              className="hover:bg-white/80 transition-colors"
                            >
                              <td className="p-2 text-left text-[9px] text-stone-500 border-r border-stone-200 whitespace-nowrap">
                                {day.dateStr}{" "}
                                <span className={wdayColor}>({wdayJa})</span>
                              </td>
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
                                ] as ScorecardDirection[]
                              ).map((dir: ScorecardDirection) => {
                                const classData = day.models.classical[dir];
                                const indepData = day.models.physicalIndep[dir];
                                const coupledData =
                                  day.models.physicalCoupled[dir];

                                const isClassHigh =
                                  !classData.status.startsWith("NOISE");
                                const isIndepHigh =
                                  !indepData.status.startsWith("NOISE");
                                const isCoupledHigh =
                                  !coupledData.status.startsWith("NOISE");
                                const isConsensusClear =
                                  isClassHigh && isIndepHigh && isCoupledHigh;
                                const hasHigh =
                                  isClassHigh || isIndepHigh || isCoupledHigh;
                                const hasLow =
                                  !isClassHigh ||
                                  !isIndepHigh ||
                                  !isCoupledHigh;
                                const isDivergenceAlert = hasHigh && hasLow;

                                let activeScore = 50;
                                let activeStatus = "SAFE";
                                let cellVal = 0;
                                let cellLabel = "";

                                if (gridModelView === "classical") {
                                  activeScore = classData.score;
                                  activeStatus = classData.status;
                                  if (gridDimension === "total") {
                                    cellVal = classData.score;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = classData.kigakuScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = classData.astroBonus;
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = classData.timeGateModifier;
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                } else if (gridModelView === "physicalIndep") {
                                  activeScore = indepData.score;
                                  activeStatus = indepData.status;
                                  if (gridDimension === "total") {
                                    cellVal = indepData.score;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = indepData.kigakuScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = indepData.astroBonus;
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = indepData.timeGateModifier;
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                } else if (
                                  gridModelView === "physicalCoupled"
                                ) {
                                  activeScore = coupledData.score;
                                  activeStatus = coupledData.status;
                                  if (gridDimension === "total") {
                                    cellVal = coupledData.score;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = coupledData.kigakuScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = coupledData.astroBonus;
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = coupledData.timeGateModifier;
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                } else {
                                  activeScore = Math.round(
                                    (classData.score +
                                      indepData.score +
                                      coupledData.score) /
                                      3,
                                  );
                                  activeStatus = isConsensusClear
                                    ? "OPTIMAL"
                                    : isDivergenceAlert
                                      ? "WARNING"
                                      : "SAFE";
                                  if (gridDimension === "total") {
                                    cellVal = activeScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = Math.round(
                                      (classData.kigakuScore +
                                        indepData.kigakuScore +
                                        coupledData.kigakuScore) /
                                        3,
                                    );
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = Math.round(
                                      (classData.astroBonus +
                                        indepData.astroBonus +
                                        coupledData.astroBonus) /
                                        3,
                                    );
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = Math.round(
                                      (classData.timeGateModifier +
                                        indepData.timeGateModifier +
                                        coupledData.timeGateModifier) /
                                        3,
                                    );
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                }

                                const cellClass = getDimensionCellBgColor(
                                  gridDimension,
                                  cellVal,
                                  activeStatus,
                                  gridModelView === "consensus" &&
                                    isConsensusClear,
                                  gridModelView === "consensus" &&
                                    isDivergenceAlert,
                                );

                                return (
                                  <td
                                    key={dir}
                                    className={`p-2 font-bold transition-all ${cellClass}`}
                                  >
                                    <div className="flex items-center justify-center gap-0.5">
                                      {gridModelView === "consensus" &&
                                        gridDimension === "total" &&
                                        isConsensusClear && <span>🌟</span>}
                                      {gridModelView === "consensus" &&
                                        gridDimension === "total" &&
                                        isDivergenceAlert && <span>⚠️</span>}
                                      <span>{cellLabel}</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      : scorecardHonmeiStarsForecast?.map((star) => {
                          const isUserStar =
                            honmeiStar &&
                            ((useClassicalBoard &&
                              star.star === honmeiStar.classical) ||
                              (!useClassicalBoard &&
                                star.star === honmeiStar.physical));
                          return (
                            <tr
                              key={star.star}
                              className={`hover:bg-white/80 transition-colors ${isUserStar ? "bg-emerald-50 border-y border-emerald-200" : ""}`}
                            >
                              <td className="p-2 text-left text-[9px] text-stone-600 font-bold border-r border-stone-200 whitespace-nowrap flex items-center gap-1.5">
                                {isUserStar && (
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                )}
                                {star.label}
                              </td>
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
                                ] as ScorecardDirection[]
                              ).map((dir: ScorecardDirection) => {
                                const classData = star.models.classical[dir];
                                const indepData =
                                  star.models.physicalIndep[dir];
                                const coupledData =
                                  star.models.physicalCoupled[dir];

                                const isClassHigh =
                                  !classData.status.startsWith("NOISE");
                                const isIndepHigh =
                                  !indepData.status.startsWith("NOISE");
                                const isCoupledHigh =
                                  !coupledData.status.startsWith("NOISE");
                                const isConsensusClear =
                                  isClassHigh && isIndepHigh && isCoupledHigh;
                                const hasHigh =
                                  isClassHigh || isIndepHigh || isCoupledHigh;
                                const hasLow =
                                  !isClassHigh ||
                                  !isIndepHigh ||
                                  !isCoupledHigh;
                                const isDivergenceAlert = hasHigh && hasLow;

                                let activeScore = 50;
                                let activeStatus = "SAFE";
                                let cellVal = 0;
                                let cellLabel = "";

                                if (gridModelView === "classical") {
                                  activeScore = classData.score;
                                  activeStatus = classData.status;
                                  if (gridDimension === "total") {
                                    cellVal = classData.score;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = classData.kigakuScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = classData.astroBonus;
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = classData.timeGateModifier;
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                } else if (gridModelView === "physicalIndep") {
                                  activeScore = indepData.score;
                                  activeStatus = indepData.status;
                                  if (gridDimension === "total") {
                                    cellVal = indepData.score;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = indepData.kigakuScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = indepData.astroBonus;
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = indepData.timeGateModifier;
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                } else if (
                                  gridModelView === "physicalCoupled"
                                ) {
                                  activeScore = coupledData.score;
                                  activeStatus = coupledData.status;
                                  if (gridDimension === "total") {
                                    cellVal = coupledData.score;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = coupledData.kigakuScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = coupledData.astroBonus;
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = coupledData.timeGateModifier;
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                } else {
                                  activeScore = Math.round(
                                    (classData.score +
                                      indepData.score +
                                      coupledData.score) /
                                      3,
                                  );
                                  activeStatus = isConsensusClear
                                    ? "OPTIMAL"
                                    : isDivergenceAlert
                                      ? "WARNING"
                                      : "SAFE";
                                  if (gridDimension === "total") {
                                    cellVal = activeScore;
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "kigaku") {
                                    cellVal = Math.round(
                                      (classData.kigakuScore +
                                        indepData.kigakuScore +
                                        coupledData.kigakuScore) /
                                        3,
                                    );
                                    cellLabel = `${cellVal}`;
                                  } else if (gridDimension === "astro") {
                                    cellVal = Math.round(
                                      (classData.astroBonus +
                                        indepData.astroBonus +
                                        coupledData.astroBonus) /
                                        3,
                                    );
                                    cellLabel = `+${cellVal}`;
                                  } else {
                                    cellVal = Math.round(
                                      (classData.timeGateModifier +
                                        indepData.timeGateModifier +
                                        coupledData.timeGateModifier) /
                                        3,
                                    );
                                    cellLabel =
                                      cellVal > 0
                                        ? `+${cellVal}`
                                        : `${cellVal}`;
                                  }
                                }

                                const cellClass = getDimensionCellBgColor(
                                  gridDimension,
                                  cellVal,
                                  activeStatus,
                                  gridModelView === "consensus" &&
                                    isConsensusClear,
                                  gridModelView === "consensus" &&
                                    isDivergenceAlert,
                                );

                                return (
                                  <td
                                    key={dir}
                                    className={`p-2 font-bold transition-all ${cellClass}`}
                                  >
                                    <div className="flex items-center justify-center gap-0.5">
                                      {gridModelView === "consensus" &&
                                        gridDimension === "total" &&
                                        isConsensusClear && <span>🌟</span>}
                                      {gridModelView === "consensus" &&
                                        gridDimension === "total" &&
                                        isDivergenceAlert && <span>⚠️</span>}
                                      <span>{cellLabel}</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- DETAIL SIDE-DRAWER --- */}
      {selectedDirection &&
        (() => {
          const detail = scorecardSummary.find(
            (d) => d.direction === selectedDirection,
          );
          if (!detail) return null;

          return (
            <div className="fixed inset-0 z-50 overflow-hidden font-sans">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-white/70 backdrop-blur-xs transition-opacity"
                onClick={() => setSelectedDirection(null)}
              ></div>

              {/* Drawer Container */}
              <div className="absolute inset-y-0 right-0 max-w-full flex">
                <div className="w-screen max-w-lg bg-stone-50 border-l border-stone-200 shadow-2xl relative flex flex-col">
                  {/* Close button */}
                  <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-white/80">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold font-mono">
                        ▶
                      </span>
                      <h3 className="text-sm font-bold text-stone-700">
                        【方位詳細】 {detail.labelJa} ({detail.direction})
                      </h3>
                    </div>
                    <button
                      onClick={() => setSelectedDirection(null)}
                      className="text-stone-500 hover:text-stone-900 transition-colors p-1"
                    >
                      ✕ 閉じる
                    </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* Unified Ten-Chi-Jin Evaluation Block */}
                    {(() => {
                      const dateStr = baseTime
                        ? toJapanDateString(baseTime)
                        : todayInJapan();
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
                      const angle = dirAngles[selectedDirection] || 0;
                      const rad = (angle * Math.PI) / 180;
                      const stepObj = {
                        fromName: "現在地",
                        fromLat: lat || 35.0116,
                        fromLon: lon || 135.7681,
                        toName: `${detail.labelJa}方面`,
                        toLat: (lat || 35.0116) + Math.cos(rad) * 0.9,
                        toLon: (lon || 135.7681) + Math.sin(rad) * 0.9,
                        departureDate: dateStr,
                        purpose: "MIGRATION" as const,
                        notes: "当日詳細判定",
                        evaluation: {
                          status: detail.status,
                          // ここだけ 80/50/20 で「凶」と書いており、
                          // 凡例の「警告 ≥ 30」と食い違っていた。
                          // しきい値と語は lib/scoreTier から引く。
                          rating: scoreTierLabel(detail.score),
                          color: "",
                          score: detail.score,
                          details: {
                            yearLayer: "",
                            monthLayer: "",
                            dayLayer: "",
                          },
                        },
                      };

                      const qVal =
                        nbaData?.nba.actionResult.expectedReward ?? 0;
                      const simulatedAns = nbaData?.micro.ansLoad ?? 20;
                      const simulatedShield =
                        nbaData?.micro.shieldCapacity ?? 80;

                      const nbaEvaluationsMap = {
                        [dateStr]: {
                          date: dateStr,
                          qValue: qVal,
                          suggestedAction:
                            nbaData?.nba.actionResult.suggestedAction || "WAIT",
                          riskFactors:
                            nbaData?.macro.streams?.westernAstrology?.aspects ||
                            [],
                        },
                      };

                      return (
                        <TenChiJinEvaluation
                          mode="step"
                          steps={[stepObj]}
                          singleStepIndex={0}
                          nbaEvaluations={nbaEvaluationsMap}
                          simulatedAns={simulatedAns}
                          simulatedShield={simulatedShield}
                          birthDate={birthDate}
                          onApplyAction={() => {
                            window.location.href = `/relocation/simulator?date=${dateStr}&direction=${selectedDirection}`;
                          }}
                        />
                      );
                    })()}

                    {/* Status & Score Block */}
                    <div className="bg-white/80 border border-stone-200 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-stone-600 uppercase tracking-widest font-mono">
                          Astrological Wave
                        </span>
                        <span
                          className={`inline-flex items-center self-start px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold border uppercase tracking-wider ${statusBadgeClass(detail.status)}`}
                        >
                          {detail.status}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-stone-600 uppercase tracking-widest font-mono">
                          Score
                        </span>
                        <span
                          className={`text-2xl font-mono font-bold ${scoreTextColor(
                            detail.score,
                          )}`}
                        >
                          {detail.score}
                        </span>
                      </div>
                    </div>

                    {/* 30-Day Forecast Calendar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-mono text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
                          <span>📅 直近30日の時空吉凶シミュレーション</span>
                        </h4>
                        <span className="text-[9px] text-stone-600 font-mono">
                          吉日数: {detail.luckyDays}日
                        </span>
                      </div>

                      <div className="grid grid-cols-6 gap-1 bg-white/70 p-2 border border-stone-200 rounded-md">
                        {detail.dates.map((d, i) => {
                          let bg =
                            "bg-white/80 border-stone-200 text-stone-600";
                          if (d.status === "OPTIMAL")
                            bg =
                              "bg-emerald-500/20 border-emerald-200 text-emerald-600";
                          else if (d.status === "OPTIMAL_REGULAR")
                            bg =
                              "bg-emerald-500/10 border-emerald-200 text-emerald-600";
                          else if (d.status === "SAFE")
                            bg = "bg-blue-500/10 border-blue-200 text-blue-600";
                          else if (d.status === "WARNING")
                            bg =
                              "bg-orange-500/10 border-orange-200 text-orange-600";
                          else if (d.status.startsWith("NOISE"))
                            bg = "bg-red-500/10 border-red-200 text-red-600";

                          const dateParts = d.dateStr.split("-");
                          const mDay = dateParts[2];
                          const mMonth = dateParts[1];

                          return (
                            <div
                              key={i}
                              className={`border p-1 text-center rounded flex flex-col items-center justify-center transition-all ${bg}`}
                              title={`${d.dateStr}: ${d.status}`}
                            >
                              <span className="text-[9px] opacity-70 font-mono">
                                {mMonth}/{mDay}
                              </span>
                              <span className="text-[9px] font-bold font-mono">
                                {d.score}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top 5 Wealth Municipalities */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-mono text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-200 pb-1.5">
                        <span>🏢 富裕度市区町村 TOP 5</span>
                      </h4>
                      {detail.topAreas.length > 0 ? (
                        <div className="space-y-2">
                          {detail.topAreas.map((area, idx) => (
                            <div
                              key={area.id}
                              className="bg-white/70 border border-stone-200 rounded p-2.5 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-stone-600">
                                  #{idx + 1}
                                </span>
                                <div className="flex flex-col">
                                  <span className="text-stone-700 font-bold">
                                    {area.areaName}
                                  </span>
                                  <span className="text-[9px] text-stone-600 font-mono mt-0.5">
                                    コード: {area.areaCode}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right flex flex-col items-end">
                                <span className="text-stone-600 font-mono font-bold">
                                  {area.incomePerCapita
                                    ? `${(area.incomePerCapita / 10000).toFixed(1)}万円`
                                    : `${(area.taxableIncomeThousandYen / 1000).toFixed(0)}万円`}
                                </span>
                                <span className="text-[9px] text-stone-600 font-sans mt-0.5">
                                  一人当たり平均所得
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-stone-600 italic">
                          該当するエリアがありません。
                        </p>
                      )}
                    </div>

                    {/* Top 5 Rentals */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-mono text-stone-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-200 pb-1.5">
                        <span>🏠 推奨賃貸物件（掘り出し） TOP 5</span>
                      </h4>
                      {detail.topRentals.length > 0 ? (
                        <div className="space-y-2">
                          {detail.topRentals.map((rental, idx) => {
                            const innerContent = (
                              <>
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[10px] font-mono text-stone-600 mt-0.5">
                                      #{idx + 1}
                                    </span>
                                    <div className="flex flex-col">
                                      <span
                                        className="text-stone-700 font-bold truncate max-w-[280px] group-hover:text-indigo-600 group-hover:underline transition-colors"
                                        title={rental.property_name}
                                      >
                                        {rental.property_name}
                                      </span>
                                      <span className="text-[9px] text-stone-600 font-mono">
                                        {/* 応答の項目は building_age。
                                              age_years は存在せず、ここは
                                              ずっと「築年数: 年」と空欄で
                                              出ていた。#231 と同じ形。
                                              築 0 年（新築）と値が無い場合を
                                              取り違えないよう、null は「不明」。 */}
                                        距離: {rental.distanceKm?.toFixed(1)}
                                        km | 広さ: {rental.size_sqm}㎡ | 築年数:{" "}
                                        {rental.building_age ?? "不明"}年
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex justify-between items-center border-t border-stone-200 pt-1.5 text-[10px] text-stone-500">
                                  <span>
                                    賃料+管理費:{" "}
                                    <strong className="text-stone-600 font-bold font-mono">
                                      {(rental.totalRent / 10000).toFixed(1)}
                                      万円
                                    </strong>
                                  </span>
                                  <span
                                    className={`px-1 py-0.5 rounded text-[10px] font-mono border ${statusBadgeClass(rental.astrologyStatus)}`}
                                  >
                                    {rental.astrologyStatus}
                                  </span>
                                </div>
                              </>
                            );

                            if (rental.url) {
                              return (
                                <a
                                  key={rental.id}
                                  href={rental.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-white/70 border border-stone-200 hover:border-indigo-200 hover:bg-indigo-500/5 rounded p-2.5 flex flex-col gap-1.5 text-xs transition-all block group cursor-pointer"
                                >
                                  {innerContent}
                                </a>
                              );
                            }

                            return (
                              <div
                                key={rental.id}
                                className="bg-white/70 border border-stone-200 rounded p-2.5 flex flex-col gap-1.5 text-xs"
                              >
                                {innerContent}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-stone-600 italic">
                          該当する物件情報がありません。
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}

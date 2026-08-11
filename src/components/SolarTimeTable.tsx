"use client";

import React, { useMemo, useState } from "react";
import { getDailySolarSchedule, KimonScheduleItem } from "../utils/solarTime";
import {
  getCurrentZodiac,
  getCurrentEnvironmentalFrequencies,
} from "../utils/ephemerisEngine";
import { KigakuBoard } from "./KigakuBoard";

/** SolarTimeClock が渡してくる env そのもの。同じ形をここに書き写さない。 */
type EnvironmentalFrequencies = ReturnType<
  typeof getCurrentEnvironmentalFrequencies
>;

interface SolarTimeTableProps {
  date: Date;
  longitude: number;
  latitude: number | null;
  eot: number;
  kpIndex: number | null;
  xrayFlux: string | null;
  ansLoad: number;
  shieldCapacity: number;
  vectors?: Record<string, string> | null;
  honmeiStar?: { physical: number; classical: number } | null;
  envData?: EnvironmentalFrequencies | null;
  personalVoidZodiac?: string[];
  nbaData?: any;
  useClassical?: boolean;
}

export function SolarTimeTableComponent({
  date,
  longitude,
  latitude,
  eot,
  kpIndex,
  xrayFlux,
  ansLoad,
  shieldCapacity,
  vectors,
  honmeiStar,
  envData,
  personalVoidZodiac,
  nbaData,
  useClassical,
}: SolarTimeTableProps) {
  const schedule = useMemo(
    () => getDailySolarSchedule(date, longitude),
    [date, longitude],
  );

  const currentZodiac = useMemo(
    () => getCurrentZodiac(date, longitude),
    [date, longitude],
  );

  const isYearVoid =
    personalVoidZodiac?.includes(currentZodiac.yearZodiac) || false;
  const isMonthVoid =
    personalVoidZodiac?.includes(currentZodiac.monthZodiac) || false;
  const isDayVoid =
    personalVoidZodiac?.includes(currentZodiac.dayZodiac) || false;

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");

  // 完全ローカル化に伴い、制限を解除し常にエクスポートを許可
  const isAuthorized = true;

  const toggleRow = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const formatTime = (d: Date) => {
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const time = d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${year}/${month}/${day} ${time}`;
  };

  const isVoidTimeHour = (item: KimonScheduleItem) => {
    if (personalVoidZodiac && personalVoidZodiac.length > 0) {
      return personalVoidZodiac.includes(item.japanese);
    }
    return item.japanese === "午" || item.japanese === "未"; // 11:00 - 15:00
  };

  const getElementInfo = (starNum: number) => {
    if (starNum === 1)
      return { id: "Water", name: "水", color: "text-blue-600" };
    if ([2, 5, 8].includes(starNum))
      return { id: "Earth", name: "土", color: "text-amber-600" };
    if ([3, 4].includes(starNum))
      return { id: "Wood", name: "木", color: "text-emerald-600" };
    if ([6, 7].includes(starNum))
      return { id: "Metal", name: "金", color: "text-stone-600" };
    if (starNum === 9) return { id: "Fire", name: "火", color: "text-red-500" };
    return { id: "Earth", name: "土", color: "text-amber-600" }; // fallback
  };

  const evaluateTimePhase = (item: KimonScheduleItem) => {
    const isGoodGate = item.hachimon.auspicious; // 生, 休, 開

    if (!honmeiStar)
      return {
        isOptimal: false,
        myElement: null,
        timeElement: null,
        relation: null,
      };
    const activeStar = useClassical
      ? honmeiStar.classical
      : honmeiStar.physical;
    if (!activeStar)
      return {
        isOptimal: false,
        myElement: null,
        timeElement: null,
        relation: null,
      };

    const myElement = getElementInfo(activeStar);
    const timeElementNum =
      item.kyusei.number || parseInt(item.kyusei.japanese.substring(0, 1)) || 3;
    const timeElement = getElementInfo(timeElementNum);

    let relation = null;
    let isFavorable = false;

    // 相生・相比・相剋の完全判定 (五行理論)
    if (myElement.id === timeElement.id) {
      relation = "相比 (比和: 同調)";
      isFavorable = true;
    }
    // 木 (Wood)
    else if (myElement.id === "Wood" && timeElement.id === "Water") {
      relation = "水生木 (相生: 吸収)";
      isFavorable = true;
    } else if (myElement.id === "Wood" && timeElement.id === "Fire") {
      relation = "木生火 (相生: 放出)";
      isFavorable = true;
    } else if (myElement.id === "Wood" && timeElement.id === "Earth") {
      relation = "木剋土 (相剋: 衝突)";
      isFavorable = false;
    } else if (myElement.id === "Wood" && timeElement.id === "Metal") {
      relation = "金剋木 (相剋: 破壊)";
      isFavorable = false;
    }
    // 火 (Fire)
    else if (myElement.id === "Fire" && timeElement.id === "Wood") {
      relation = "木生火 (相生: 吸収)";
      isFavorable = true;
    } else if (myElement.id === "Fire" && timeElement.id === "Earth") {
      relation = "火生土 (相生: 放出)";
      isFavorable = true;
    } else if (myElement.id === "Fire" && timeElement.id === "Metal") {
      relation = "火剋金 (相剋: 衝突)";
      isFavorable = false;
    } else if (myElement.id === "Fire" && timeElement.id === "Water") {
      relation = "水剋火 (相剋: 破壊)";
      isFavorable = false;
    }
    // 土 (Earth)
    else if (myElement.id === "Earth" && timeElement.id === "Fire") {
      relation = "火生土 (相生: 吸収)";
      isFavorable = true;
    } else if (myElement.id === "Earth" && timeElement.id === "Metal") {
      relation = "土生金 (相生: 放出)";
      isFavorable = true;
    } else if (myElement.id === "Earth" && timeElement.id === "Water") {
      relation = "土剋水 (相剋: 衝突)";
      isFavorable = false;
    } else if (myElement.id === "Earth" && timeElement.id === "Wood") {
      relation = "木剋土 (相剋: 破壊)";
      isFavorable = false;
    }
    // 金 (Metal)
    else if (myElement.id === "Metal" && timeElement.id === "Earth") {
      relation = "土生金 (相生: 吸収)";
      isFavorable = true;
    } else if (myElement.id === "Metal" && timeElement.id === "Water") {
      relation = "金生水 (相生: 放出)";
      isFavorable = true;
    } else if (myElement.id === "Metal" && timeElement.id === "Wood") {
      relation = "金剋木 (相剋: 衝突)";
      isFavorable = false;
    } else if (myElement.id === "Metal" && timeElement.id === "Fire") {
      relation = "火剋金 (相剋: 破壊)";
      isFavorable = false;
    }
    // 水 (Water)
    else if (myElement.id === "Water" && timeElement.id === "Metal") {
      relation = "金生水 (相生: 吸収)";
      isFavorable = true;
    } else if (myElement.id === "Water" && timeElement.id === "Wood") {
      relation = "水生木 (相生: 放出)";
      isFavorable = true;
    } else if (myElement.id === "Water" && timeElement.id === "Fire") {
      relation = "水剋火 (相剋: 衝突)";
      isFavorable = false;
    } else if (myElement.id === "Water" && timeElement.id === "Earth") {
      relation = "土剋水 (相剋: 破壊)";
      isFavorable = false;
    }

    return {
      isOptimal: isGoodGate && isFavorable,
      isFavorable,
      isGoodGate,
      myElement,
      timeElement,
      relation,
    };
  };

  const getGateDescription = (gateName: string) => {
    if (gateName.includes("生")) return "新しい開始・生命力 (Start/Vitality)";
    if (gateName.includes("休")) return "休息・回復・平和 (Rest/Peace)";
    if (gateName.includes("開")) return "開拓・ビジネス・前進 (Open/Business)";
    if (gateName.includes("傷")) return "挑戦・トラブル注意 (Challenge/Risk)";
    if (gateName.includes("杜")) return "隠蔽・停滞・守り (Block/Defend)";
    if (gateName.includes("景")) return "文書・契約・表面化 (Document/Reveal)";
    if (gateName.includes("死")) return "停止・終わり・危険 (Stop/Danger)";
    if (gateName.includes("驚")) return "驚き・議論・警戒 (Surprise/Argue)";
    return "通常 (Normal)";
  };

  const generateCsvString = () => {
    // Telemetry Header
    const telemetryHeaders = [
      "Record Date",
      date.toLocaleDateString(),
      "Time",
      date.toLocaleTimeString(),
      "Latitude",
      latitude?.toFixed(4) || "N/A",
      "Longitude",
      longitude.toFixed(4),
      "EoT (min)",
      eot.toFixed(2),
      "Kp-Index",
      kpIndex?.toFixed(2) || "N/A",
      "X-Ray Flux",
      xrayFlux || "N/A",
      "ANS Load %",
      ansLoad.toString(),
      "Shield Cap %",
      shieldCapacity.toString(),
      "---",
      "---",
      "Year Phase",
      `${currentZodiac.yearZodiac} (${envData?.yearStar || "N/A"})`,
      "Month Phase",
      `${currentZodiac.monthZodiac} (${envData?.monthStar || "N/A"})`,
      "Day Phase",
      `${currentZodiac.dayZodiac} (${envData?.dayStar || "N/A"})`,
      "Year Void",
      isYearVoid ? "Yes (DANGER)" : "No",
      "Month Void",
      isMonthVoid ? "Yes (DANGER)" : "No",
      "Day Void",
      isDayVoid ? "Yes (DANGER)" : "No",
      "Yin/Yang Phase",
      envData?.isYinPhase !== undefined
        ? envData.isYinPhase
          ? "Yin"
          : "Yang"
        : "N/A",
      "---",
      "---",
      "Vector N",
      vectors?.["N"] || "N/A",
      "Vector NE",
      vectors?.["NE"] || "N/A",
      "Vector E",
      vectors?.["E"] || "N/A",
      "Vector SE",
      vectors?.["SE"] || "N/A",
      "Vector S",
      vectors?.["S"] || "N/A",
      "Vector SW",
      vectors?.["SW"] || "N/A",
      "Vector W",
      vectors?.["W"] || "N/A",
      "Vector NW",
      vectors?.["NW"] || "N/A",
      "---",
      "---",
      "Honmei Star (P)",
      honmeiStar?.physical?.toString() || "N/A",
      "Honmei Star (C)",
      honmeiStar?.classical?.toString() || "N/A",
      "Jupiter Lon",
      envData?.raw?.jupiterLon?.toFixed(2) || "N/A",
      "Lunar Lon",
      envData?.raw?.moonLon?.toFixed(2) || "N/A",
      "Solar Lon",
      envData?.raw?.sunLon?.toFixed(2) || "N/A",
      "---",
      "---",
      "NBA Suggested Action",
      nbaData?.nba?.actionResult?.suggestedAction || "N/A",
      "NBA Confidence",
      nbaData?.nba?.actionResult?.confidence?.toFixed(4) || "N/A",
      "DS Ephemeris Source",
      nbaData?.nba?.stateVector?.ephemerisData?.source || "N/A",
      "DS Ephemeris Detail",
      nbaData?.nba?.stateVector?.ephemerisData?.planetaryPositions || "N/A",
      "DS Astrology Source",
      nbaData?.nba?.stateVector?.astrologyData?.source || "N/A",
      "DS Astrology Detail",
      nbaData?.nba?.stateVector?.astrologyData?.transits || "N/A",
      "DS RAG Source",
      nbaData?.nba?.stateVector?.ragContext?.source || "N/A",
      "DS RAG Detail",
      nbaData?.nba?.stateVector?.ragContext?.classicalRules || "N/A",
      "DS Oura Readiness",
      nbaData?.micro?.readiness?.toString() || "N/A",
      "DS Oura Sleep",
      nbaData?.micro?.sleep?.toString() || "N/A",
      "DS Oura Stress",
      nbaData?.micro?.stress?.toString() || "N/A",
      "DS Oura Resilience",
      nbaData?.micro?.resilience?.toString() || "N/A",
      "DS Tavily Noise",
      nbaData?.macro?.environmentalNoise || "N/A",
      "NBA Env Risk",
      nbaData?.nba?.stateVector?.environmentalRisk?.toString() || "N/A",
      "NBA Solar Phase",
      nbaData?.nba?.stateVector?.solarPhase?.toString() || "N/A",
      "---",
      "---",
      "STS Method",
      "True Solar Time (Verified)",
      "Engine Version",
      "v2.5.0-Tactical",
    ];

    // Data Headers
    const headers = [
      "Eto",
      "Branch Name",
      "Stem Name",
      "Reading",
      "Nine Stars",
      "Eight Gates",
      "Auspicious Gate",
      "Void Time",
      "Standard Start",
      "Standard End",
      "Optimal",
      "Favorable",
      "Relation",
      "Time Element",
      "My Element",
    ];

    // Rows
    const rows = schedule.map((item) => {
      const phase = evaluateTimePhase(item);
      return [
        item.etoKanji,
        item.name,
        item.stemName,
        item.reading,
        item.kyusei.japanese,
        item.hachimon.japanese,
        item.hachimon.auspicious ? "Yes" : "No",
        isVoidTimeHour(item) ? "Yes (DANGER)" : "No",
        item.startStandard.toISOString(),
        item.endStandard.toISOString(),
        phase.isOptimal ? "Yes" : "No",
        phase.isFavorable ? "Yes" : "No",
        phase.relation || "Neutral",
        phase.timeElement?.name || "N/A",
        phase.myElement?.name || "N/A",
      ];
    });

    // CSV Content
    return (
      telemetryHeaders.map((c) => `"${c}"`).join(",") +
      "\n\n" +
      [headers, ...rows]
        .map((e) => e.map((c) => `"${c}"`).join(",")) // Quote fields
        .join("\n")
    );
  };

  const openPreview = () => {
    setPreviewContent(generateCsvString());
    setShowPreview(true);
  };

  const executeDownload = () => {
    const csvContent = "\uFEFF" + previewContent;
    const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.setAttribute("href", csvUrl);
    const dateStr = date.toLocaleDateString().replace(/\//g, "-");
    link.setAttribute("download", `temporal_matrix_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(csvUrl);
    setShowPreview(false);
  };

  return (
    <div className="w-full max-w-4xl mt-8 flex flex-col gap-4">
      {/* HUD Header */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs uppercase font-mono tracking-[0.3em] text-stone-500">
            Temporal Filter Matrix
          </h2>
          <span className="text-[8px] bg-stone-100 text-stone-500 px-1 py-0.5 ml-2">
            v2.4.2
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[8px] font-mono text-stone-400 tracking-widest hidden md:block">
            {date.toLocaleDateString()} / LON: {longitude.toFixed(4)}
          </div>
          {isAuthorized && (
            <button
              onClick={openPreview}
              className="px-3 py-1 bg-white border border-stone-300 text-stone-600 text-[9px] uppercase tracking-widest hover:bg-stone-100 transition-colors"
            >
              Review & Export Telemetry
            </button>
          )}
        </div>
      </div>

      {/* Global & Daily Phase Status */}
      <div className="grid grid-cols-3 gap-2 mt-1 mb-2 font-mono text-[9px] sm:text-[10px]">
        <div
          className={`p-2 sm:p-3 border rounded-sm flex flex-col gap-1 transition-colors ${isYearVoid ? "border-red-200 bg-red-50 shadow-inner" : "border-stone-200 bg-white/80"}`}
        >
          <div className="flex justify-between items-center text-stone-400 tracking-widest">
            <span>YEAR PHASE</span>
            <span className={isYearVoid ? "text-red-600" : "text-purple-600"}>
              {envData?.yearStar}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-xl sm:text-2xl font-bold leading-none ${isYearVoid ? "text-red-600" : "text-stone-600"}`}
            >
              {currentZodiac.yearZodiac}
            </span>
            {isYearVoid ? (
              <span className="bg-red-50 text-red-700 px-1 py-0.5 text-[8px] md:animate-pulse ml-auto border border-red-200 whitespace-nowrap">
                VOID / 天中殺
              </span>
            ) : (
              <span className="text-stone-400 text-[8px] ml-auto">NORMAL</span>
            )}
          </div>
          <div className="text-[8px] text-stone-400 mt-auto pt-1 border-t border-stone-200 leading-tight">
            長期的なベースとなる年の波長と干支
          </div>
        </div>

        <div
          className={`p-2 sm:p-3 border rounded-sm flex flex-col gap-1 transition-colors ${isMonthVoid ? "border-red-200 bg-red-50 shadow-inner" : "border-stone-200 bg-white/80"}`}
        >
          <div className="flex justify-between items-center text-stone-400 tracking-widest">
            <span>MONTH PHASE</span>
            <span className={isMonthVoid ? "text-red-600" : "text-amber-600"}>
              {envData?.monthStar}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-xl sm:text-2xl font-bold leading-none ${isMonthVoid ? "text-red-600" : "text-stone-600"}`}
            >
              {currentZodiac.monthZodiac}
            </span>
            {isMonthVoid ? (
              <span className="bg-red-50 text-red-700 px-1 py-0.5 text-[8px] md:animate-pulse ml-auto border border-red-200 whitespace-nowrap">
                VOID / 天中殺
              </span>
            ) : (
              <span className="text-stone-400 text-[8px] ml-auto">NORMAL</span>
            )}
          </div>
          <div className="text-[8px] text-stone-400 mt-auto pt-1 border-t border-stone-200 leading-tight">
            潮汐力による中期の波長と月の干支
          </div>
        </div>

        <div
          className={`p-2 sm:p-3 border rounded-sm flex flex-col gap-1 transition-colors ${isDayVoid ? "border-red-200 bg-red-50 shadow-inner" : "border-stone-200 bg-white/80"}`}
        >
          <div className="flex justify-between items-center text-stone-400 tracking-widest">
            <div className="flex items-center gap-1">
              <span>DAY PHASE</span>
              {envData?.isYinPhase !== undefined && (
                <span
                  className={`text-[8px] px-1 py-0.5 border ${envData.isYinPhase ? "border-blue-200 text-blue-600 bg-blue-50" : "border-amber-200 text-amber-600 bg-amber-50"}`}
                >
                  {envData.isYinPhase ? "陰遁 (YIN)" : "陽遁 (YANG)"}
                </span>
              )}
            </div>
            <span className={isDayVoid ? "text-red-600" : "text-blue-600"}>
              {envData?.dayStar}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-xl sm:text-2xl font-bold leading-none ${isDayVoid ? "text-red-600" : "text-stone-600"}`}
            >
              {currentZodiac.dayZodiac}
            </span>
            {isDayVoid ? (
              <span className="bg-red-50 text-red-700 px-1 py-0.5 text-[8px] md:animate-pulse ml-auto border border-red-200 whitespace-nowrap">
                VOID / 天中殺
              </span>
            ) : (
              <span className="text-stone-400 text-[8px] ml-auto">NORMAL</span>
            )}
          </div>
          <div className="text-[8px] text-stone-400 mt-auto pt-1 border-t border-stone-200 leading-tight">
            地球自転による短期の波長と日の干支。
            {envData?.isYinPhase !== undefined && (
              <span className="block mt-0.5">
                ※現在は
                {envData.isYinPhase
                  ? "夏至〜冬至の「陰」"
                  : "冬至〜夏至の「陽」"}
                のサイクル（エネルギーの
                {envData.isYinPhase ? "収束期" : "拡散期"}）です。
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actionable Directives Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <div className="bg-emerald-50 border-l-2 border-emerald-500 p-2 md:p-3 shadow-inner">
          <div className="text-emerald-500 font-bold text-[10px] md:text-xs mb-1 tracking-widest uppercase flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>{" "}
            [ ACTION WINDOW ] 実行推奨帯
          </div>
          <p className="text-stone-500 text-[9px] md:text-[10px] leading-relaxed font-sans text-justify">
            生体磁気と空間位相が最適化されるゴールデンタイム。重要な決断、交渉の開始、新しいプロジェクトの着手、および長距離移動（出発）に最も適した時間帯です。
          </p>
        </div>
        <div className="bg-red-50 border-l-2 border-red-500 p-2 md:p-3 shadow-inner">
          <div className="text-red-500 font-bold text-[10px] md:text-xs mb-1 tracking-widest uppercase flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>{" "}
            [ VOID TIME ] 警告帯・行動凍結
          </div>
          <p className="text-stone-500 text-[9px] md:text-[10px] leading-relaxed font-sans text-justify">
            地球の磁気シールドが乱れ、ヒューマンエラーや通信障害が多発する魔の時間帯（天中殺）。大きな決断、新規の開始、および長距離の物理的移動を完全に停止し、ルーチンワークに徹してください。
          </p>
        </div>
      </div>

      <details className="mb-4 bg-white/80 border border-stone-200 text-[9px] font-mono text-stone-400 group">
        <summary className="p-2 cursor-pointer hover:bg-white/80 list-none flex items-center justify-between uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 blur-[0.5px]">◆</span> [ ALGORITHM ]
            最適タイミングの分析ロジック
          </div>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="p-3 border-t border-stone-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-white/70 text-[10px] leading-relaxed font-sans">
          <div className="p-2 border border-purple-200 rounded-sm">
            <strong className="text-purple-600 block mb-1 font-mono text-[9px]">
              ◆ 1. 陰陽五行・四柱推命
            </strong>
            <p className="text-stone-500 text-justify">
              宇宙のエネルギーを「木・火・土・金・水」の5つの属性（周波数）に分類し、互いに生み出す「相生」、打ち消し合う「相剋」の物理的相互作用として計算します。これに干支暦（四柱推命）の天体位相を組み合わせています。
            </p>
          </div>
          <div className="p-2 border border-blue-200 rounded-sm">
            <strong className="text-blue-600 block mb-1 font-mono text-[9px]">
              ◆ 2. 九星気学・環境方位
            </strong>
            <p className="text-stone-500 text-justify">
              均時差を補正した「真太陽時」に基づき、その場所・時間に流れる磁気エネルギー（九星・八門）をリアルタイム算出します。五行理論と組み合わせ、あなたの「本命星」の周波数と共鳴する空間ベクトルを特定します。
            </p>
          </div>
          <div className="p-2 border border-red-200 rounded-sm">
            <strong className="text-red-600 block mb-1 font-mono text-[9px]">
              ◆ 3. VOID TIME（天中殺）
            </strong>
            <p className="text-stone-500 text-justify">
              天中殺（空亡）は地球の磁気シールドと生体リズムが同調外れを起こす時間帯です。四柱推命の干支の組み合わせにおける「空白の位相」であり、この時間帯での物理的移動や決断は自律神経エラーを招くため避けるべきです。
            </p>
          </div>
          <div className="p-2 border border-emerald-200 rounded-sm">
            <strong className="text-emerald-600 block mb-1 font-mono text-[9px]">
              ◆ 4. OPTIMAL TIME（吉門・相生）
            </strong>
            <p className="text-stone-500 text-justify">
              緑色ハイライトは、空間の「八門（生/休/開）」が開き、かつ九星の属性とあなたの属性が「相生（または相比）」関係にある完全同期状態です。肉体と環境の周波数が同調し、パフォーマンスが最大化されます。
            </p>
          </div>
        </div>
      </details>

      {/* Vertical Timeline Feed */}
      <div className="flex flex-col gap-2">
        {schedule.map((item, index) => {
          const isExpanded = expandedIndex === index;
          const isVoid = isVoidTimeHour(item);
          const evalPhase = evaluateTimePhase(item);
          const isOptimal = evalPhase.isOptimal;

          const cardClass = isVoid
            ? "border-red-200 bg-red-50"
            : isOptimal
              ? "border-emerald-200 bg-emerald-50 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              : "border-stone-200 bg-white/80 hover:bg-white transition-colors";

          return (
            <div
              key={index}
              className={`flex flex-col border ${cardClass} p-2 sm:p-3 rounded-md relative overflow-hidden group`}
            >
              {/* Background Flavor text */}
              <div className="absolute right-[-5%] top-[-10%] text-[60px] sm:text-[80px] font-bold text-black/20 select-none z-0 tracking-tighter mix-blend-overlay pointer-events-none">
                {item.etoKanji}
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between relative z-10 gap-2 md:gap-4">
                {/* Time and Zodiac */}
                <div className="flex items-center gap-3 min-w-[200px]">
                  <span className="text-sm sm:text-base font-mono text-stone-800 font-bold tracking-widest drop-shadow-md whitespace-nowrap">
                    {formatTime(item.startStandard)} -{" "}
                    {formatTime(item.endStandard)}
                  </span>
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-sm font-bold ${isVoid ? "text-red-500" : "text-stone-500"}`}
                    >
                      {item.etoKanji}の刻
                    </span>
                    <span className="text-[9px] text-stone-400 font-mono hidden sm:inline-block tracking-widest uppercase">
                      [{item.reading}]
                    </span>
                  </div>
                </div>

                {/* Kyusei and Hachimon Summaries */}
                <div className="flex flex-row items-center gap-2 md:gap-4 flex-1 text-[10px] sm:text-xs w-full">
                  {/* 九星 */}
                  <div className="flex flex-col w-1/3 md:w-auto">
                    <span className="text-stone-400 text-[8px] uppercase tracking-widest leading-none mb-1">
                      Star(周波数)
                    </span>
                    <span
                      className={`font-bold ${isVoid ? "text-red-800" : "text-stone-600"}`}
                    >
                      {item.kyusei.japanese}
                    </span>
                  </div>
                  {/* 八門 */}
                  <div className="flex flex-col flex-1">
                    <span className="text-stone-400 text-[8px] uppercase tracking-widest leading-none mb-1">
                      Gate(ゲート)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-bold ${isVoid ? "text-red-800" : item.hachimon.auspicious ? "text-amber-600" : "text-stone-500"}`}
                      >
                        {item.hachimon.japanese}
                      </span>
                      <span className="text-[9px] text-stone-400 hidden sm:inline-block border-l border-stone-300 pl-1.5">
                        {getGateDescription(item.hachimon.japanese)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Badge & Toggle Button */}
                <div className="flex items-center justify-between w-full md:w-auto gap-2 mt-2 md:mt-0">
                  <div className="flex-shrink-0">
                    {isVoid && (
                      <span className="bg-red-50 text-red-500 border border-red-500/80 px-2 py-0.5 font-bold text-[10px] tracking-widest md:animate-pulse shadow-md">
                        [ NO-GO ] 凍結
                      </span>
                    )}
                    {!isVoid && isOptimal && (
                      <span className="bg-emerald-50 text-emerald-600 border border-emerald-500/80 px-2 py-0.5 font-bold text-[10px] tracking-widest drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                        [ GO ] 推奨
                      </span>
                    )}
                    {!isVoid && !isOptimal && (
                      <span className="text-stone-400 text-[10px] font-mono tracking-widest border border-stone-200 px-2 py-0.5 bg-white/70">
                        ROUTINE
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleRow(index)}
                    className="text-[10px] text-stone-400 hover:text-blue-600 flex items-center gap-1 transition-colors uppercase tracking-widest font-bold bg-white/80 px-2 py-1 border border-stone-200 whitespace-nowrap"
                  >
                    <span
                      className={expandedIndex === index ? "text-blue-500" : ""}
                    >
                      {expandedIndex === index ? "▲" : "▼"}
                    </span>
                    {expandedIndex === index ? "HIDE" : "EXAMINE"}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-stone-200 relative z-10 flex flex-col md:flex-row gap-4 bg-white/70 p-2 rounded-sm animate-fade-in">
                  {/* Explain Phase */}
                  <div className="flex-1 flex flex-col gap-2 text-[10px] text-stone-500 leading-relaxed">
                    {isVoid ? (
                      <div className="bg-red-50 p-2 border-l-2 border-red-200 text-justify">
                        <div className="font-mono text-red-500 uppercase tracking-widest mb-1 font-bold md:animate-pulse">
                          ⚠ SYSTEM SHIELD OFFLINE
                        </div>
                        <div className="text-red-400/80 leading-relaxed">
                          {item.japanese}
                          の刻は強烈な電磁気定在波により地球共鳴と非同期状態にあります。物理的な移動・新規アクション・重要な決断の一切を停止し、ROUTINEタスクへ移行してください。
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white/80 p-2 border border-stone-200 flex flex-col gap-2">
                        <div>
                          <strong
                            className={`block mb-1 ${isOptimal ? "text-emerald-600" : "text-stone-600"}`}
                          >
                            [ 空間評価 (Spatial Eval) ]
                          </strong>
                          {isOptimal
                            ? "あなたの本命星と空間の周波数（九星）が共鳴し、さらに八門が吉方位を示しています。重要な決断や出発に最適なタイミングです。"
                            : "通常の時間帯です。極端なノイズはないため、日常の業務や生活に問題はありません。"}
                        </div>

                        {evalPhase.myElement && evalPhase.timeElement && (
                          <div className="border-t border-stone-200 pt-2 mt-1">
                            <strong className="block mb-1 text-purple-600">
                              [ 周波数共鳴解析 (Elemental Resonance) ]
                            </strong>
                            <div className="flex flex-wrap items-center gap-2 mb-1 font-mono">
                              <span className="bg-white border border-stone-200 px-1.5 py-0.5">
                                My Base:{" "}
                                <span
                                  className={`${evalPhase.myElement.color} font-bold`}
                                >
                                  {evalPhase.myElement.name} (
                                  {evalPhase.myElement.id})
                                </span>
                              </span>
                              <span className="text-stone-400">×</span>
                              <span className="bg-white border border-stone-200 px-1.5 py-0.5">
                                Time Qi:{" "}
                                <span
                                  className={`${evalPhase.timeElement.color} font-bold`}
                                >
                                  {evalPhase.timeElement.name} (
                                  {evalPhase.timeElement.id})
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-stone-400">Status:</span>
                              <span
                                className={`font-bold ${evalPhase.isFavorable ? "text-emerald-600" : "text-stone-500"}`}
                              >
                                {evalPhase.relation || "関係性なし (中立)"}
                              </span>
                            </div>
                            <p className="mt-1 text-[9px] opacity-80 text-justify">
                              陰陽五行説（木火土金水）と九星気学の数理モデルによる解析です。あなたの固有波長（本命星）と現在の空間波長（九星）の相性を計算しています。相生（生み出す関係）や相比（同じ属性）であれば、空間エネルギーを味方に付けやすくなります。
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="bg-white/80 p-2 border border-stone-200">
                      <strong className="block mb-1 text-stone-600">
                        [ {item.hachimon.japanese}門の特性 (Gate Filter) ]
                      </strong>
                      <span className="text-amber-400/80">
                        {getGateDescription(item.hachimon.japanese)}
                      </span>
                      <p className="mt-1 text-[9px] opacity-80 text-justify">
                        特定の時間帯におけるエネルギーの「出口」や「傾向」を表すフィルターです。吉門であれば物事がスムーズに運び、凶門であれば予期せぬトラブルが生じやすくなります。
                      </p>
                    </div>
                  </div>

                  {/* Compass Matrix */}
                  <div className="bg-white/70 p-2 border border-stone-200 rounded-sm flex flex-col items-center justify-center min-w-[200px]">
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-2 font-bold">
                      Kigaku Compass Matrix
                    </div>
                    <div className="scale-75 origin-top opacity-90">
                      <KigakuBoard centerStar={item.kyusei} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SECURE DATA REVIEW MODAL */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/70 backdrop-blur-sm">
          <div className="bg-stone-50 border border-stone-200 p-6 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="flex justify-between items-center border-b border-stone-200 pb-4 mb-4">
              <h3 className="text-emerald-500 font-mono tracking-widest uppercase text-sm font-bold">
                [ SECURE DATA REVIEW ]
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-stone-400 hover:text-stone-900 font-mono text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <p className="text-stone-500 text-xs font-mono mb-4 text-justify leading-relaxed">
              以下のデータは現在の生体・環境・メタフィジカル計算式をすべて統合したフル・テレメトリーデータです。
              本命星・現在地・推命ベクトルのすべてが含まれます。内容を精査し、問題がなければアーカイブ用としてエクスポートしてください。
            </p>

            <div className="flex-grow overflow-auto border border-stone-200 bg-white/70 p-4 mb-4">
              <pre className="text-[10px] sm:text-xs text-stone-500 font-mono whitespace-pre-wrap leading-tight">
                {previewContent.replace(
                  "data:text/csv;charset=utf-8,\uFEFF",
                  "",
                )}
              </pre>
            </div>

            <div className="flex justify-end gap-4 border-t border-stone-200 pt-4">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-stone-500 text-xs font-mono uppercase tracking-widest hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                onClick={executeDownload}
                className="px-6 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 text-xs font-mono uppercase tracking-widest hover:bg-emerald-900 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.2)]"
              >
                Confirm & Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const SolarTimeTable = React.memo(SolarTimeTableComponent);

"use client";

import React, { useMemo, useState } from "react";
import { getDailySolarSchedule, KimonScheduleItem } from "../utils/solarTime";
import {
  getCurrentZodiac,
  type ZodiacTimeBasis,
  getCurrentEnvironmentalFrequencies,
} from "../utils/ephemerisEngine";
import { KigakuBoard } from "./KigakuBoard";
import {
  evaluateTimePhase as evaluateTimePhaseShared,
  getGateDescription,
  isVoidTimeHour as isVoidTimeHourShared,
} from "@/lib/timePhase";

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
  /* 呼び出し側（SolarTimeClock）が一度も渡していない実質デッドの prop
     （既知の問題。全参照が ?. 経由で常に "N/A" になる）。期待する形は
     NBADashboard の NBAData とも一致しない（micro.readiness などは
     実物に無い）ので、既存の型は引けない。ここで読む枝だけを書く。
     繋ぐときは、渡す側の実際の形とこの期待の食い違いから直すこと。 */
  nbaData?: {
    nba?: {
      actionResult?: { suggestedAction?: string; confidence?: number };
      stateVector?: {
        ephemerisData?: { source?: string; planetaryPositions?: string };
        astrologyData?: { source?: string; transits?: string };
        ragContext?: { source?: string; classicalRules?: string };
        environmentalRisk?: number;
        solarPhase?: number;
      };
    };
    micro?: {
      readiness?: number;
      sleep?: number;
      stress?: number;
      resilience?: number;
    };
    macro?: { environmentalNoise?: string };
  } | null;
  useClassical?: boolean;
  /** 時支をどの時刻で採るか。省くと標準時（従来の答え）。 */
  zodiacTimeBasis?: ZodiacTimeBasis;
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
  zodiacTimeBasis = "standard",
}: SolarTimeTableProps) {
  const schedule = useMemo(
    () => getDailySolarSchedule(date, longitude),
    [date, longitude],
  );

  const currentZodiac = useMemo(
    () => getCurrentZodiac(date, longitude, zodiacTimeBasis),
    [date, longitude, zodiacTimeBasis],
  );

  const isYearVoid =
    personalVoidZodiac?.includes(currentZodiac.yearZodiac) || false;
  const isMonthVoid =
    personalVoidZodiac?.includes(currentZodiac.monthZodiac) || false;
  const isDayVoid =
    personalVoidZodiac?.includes(currentZodiac.dayZodiac) || false;

  // 判定は lib/timePhase に集約した（ホームのポータルと共用）。
  // 呼び出し側の書き方を変えないよう、ここでは束縛だけ足す。
  const isVoidTimeHour = (item: KimonScheduleItem) =>
    isVoidTimeHourShared(item, personalVoidZodiac);
  const evaluateTimePhase = (item: KimonScheduleItem) =>
    evaluateTimePhaseShared(item, honmeiStar ?? null, useClassical ?? true);

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
    /*
      幅の上限はここでは持たない。以前は max-w-4xl（896px）を自分で持って
      いて、外側を 1700px にしても効かなかった（#347 と同じ型）。
      ここは 1 日 12 帯の一覧なので、広げたぶんがそのまま各帯の情報量に
      なる（時刻・八門・星・吉凶が折り返さずに並ぶ）。
    */
    <div className="w-full mt-8 flex flex-col gap-4">
      {/* HUD Header */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-stone-200 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs uppercase font-mono tracking-[0.3em] text-stone-500">
            Temporal Filter Matrix
          </h2>
          <span className="text-[10px] bg-stone-100 text-stone-500 px-1 py-0.5 ml-2">
            v2.4.2
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[10px] font-mono text-stone-600 tracking-widest hidden md:block">
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
          className={`p-2 sm:p-3 border rounded-xl flex flex-col gap-1 transition-colors ${isYearVoid ? "border-red-200 bg-red-50 shadow-inner" : "border-stone-200 bg-white/80"}`}
        >
          <div className="flex justify-between items-center text-stone-600 tracking-widest">
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
              <span className="bg-red-50 text-red-700 px-1 py-0.5 text-[10px] md:animate-pulse ml-auto border border-red-200 whitespace-nowrap">
                VOID / 天中殺
              </span>
            ) : (
              <span className="text-stone-600 text-[10px] ml-auto">NORMAL</span>
            )}
          </div>
          <div className="text-[10px] text-stone-600 mt-auto pt-1 border-t border-stone-200 leading-tight">
            年盤の九星と、その年の干支
          </div>
        </div>

        <div
          className={`p-2 sm:p-3 border rounded-xl flex flex-col gap-1 transition-colors ${isMonthVoid ? "border-red-200 bg-red-50 shadow-inner" : "border-stone-200 bg-white/80"}`}
        >
          <div className="flex justify-between items-center text-stone-600 tracking-widest">
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
              <span className="bg-red-50 text-red-700 px-1 py-0.5 text-[10px] md:animate-pulse ml-auto border border-red-200 whitespace-nowrap">
                VOID / 天中殺
              </span>
            ) : (
              <span className="text-stone-600 text-[10px] ml-auto">NORMAL</span>
            )}
          </div>
          <div className="text-[10px] text-stone-600 mt-auto pt-1 border-t border-stone-200 leading-tight">
            月盤の九星と、その月の干支
          </div>
        </div>

        <div
          className={`p-2 sm:p-3 border rounded-xl flex flex-col gap-1 transition-colors ${isDayVoid ? "border-red-200 bg-red-50 shadow-inner" : "border-stone-200 bg-white/80"}`}
        >
          <div className="flex justify-between items-center text-stone-600 tracking-widest">
            <div className="flex items-center gap-1">
              <span>DAY PHASE</span>
              {envData?.isYinPhase !== undefined && (
                <span
                  className={`text-[10px] px-1 py-0.5 border ${envData.isYinPhase ? "border-blue-200 text-blue-600 bg-blue-50" : "border-amber-200 text-amber-600 bg-amber-50"}`}
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
              <span className="bg-red-50 text-red-700 px-1 py-0.5 text-[10px] md:animate-pulse ml-auto border border-red-200 whitespace-nowrap">
                VOID / 天中殺
              </span>
            ) : (
              <span className="text-stone-600 text-[10px] ml-auto">NORMAL</span>
            )}
          </div>
          <div className="text-[10px] text-stone-600 mt-auto pt-1 border-t border-stone-200 leading-tight">
            日盤の九星と、その日の干支。
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
            暦の上で吉が重なる時間帯です。伝統的に、重要な決断・交渉の開始・新しいことの着手・長距離移動（出発）に良いとされます。
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

      <details className="mb-4 bg-white/80 border border-stone-200 text-[9px] font-mono text-stone-600 group">
        <summary className="p-2 cursor-pointer hover:bg-white/80 list-none flex items-center justify-between uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 blur-[0.5px]">◆</span> [ ALGORITHM ]
            最適タイミングの分析ロジック
          </div>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="p-3 border-t border-stone-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-white/70 text-[10px] leading-relaxed font-sans">
          <div className="p-2 border border-purple-200 rounded-xl">
            <strong className="text-purple-600 block mb-1 font-mono text-[9px]">
              ◆ 1. 陰陽五行・四柱推命
            </strong>
            <p className="text-stone-500 text-justify">
              「木・火・土・金・水」の五行に分け、互いに生み出す「相生」、打ち消し合う「相剋」という関係の決まりで計算します。干支暦（四柱推命）の組み合わせを併せて見ます。エネルギーを測っているのではなく、伝統的に決まっている規則をそのまま計算に写したものです。
            </p>
          </div>
          <div className="p-2 border border-blue-200 rounded-xl">
            <strong className="text-blue-600 block mb-1 font-mono text-[9px]">
              ◆ 2. 九星気学・環境方位
            </strong>
            <p className="text-stone-500 text-justify">
              均時差を補正した「真太陽時」でその日の境目を決め、その日・その場所の九星と八門の配置を出します。五行の相生・相剋と合わせて、あなたの本命星と相性のよい方位を判定します。
            </p>
          </div>
          <div className="p-2 border border-red-200 rounded-xl">
            <strong className="text-red-600 block mb-1 font-mono text-[9px]">
              ◆ 3. VOID TIME（天中殺）
            </strong>
            <p className="text-stone-500 text-justify">
              天中殺（空亡）は、四柱推命で干支の組み合わせが欠ける期間を指す考え方です。伝統的に、この期間の移動や大きな決断は避けるとされます。体調や自律神経への影響を示すものではありません。
            </p>
          </div>
          <div className="p-2 border border-emerald-200 rounded-xl">
            <strong className="text-emerald-600 block mb-1 font-mono text-[9px]">
              ◆ 4. OPTIMAL TIME（吉門・相生）
            </strong>
            <p className="text-stone-500 text-justify">
              緑は、八門（生・休・開）が開き、かつ九星の属性とあなたの属性が「相生（または相比）」にあたる日です。九星気学で条件が最もそろう組み合わせとして扱っています。
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
              className={`flex flex-col border ${cardClass} p-2 sm:p-3 rounded-xl relative overflow-hidden group`}
            >
              {/* Background Flavor text */}
              <div className="absolute right-[-5%] top-[-10%] text-[60px] sm:text-[80px] font-bold text-black/20 select-none z-0 tracking-tighter mix-blend-overlay pointer-events-none">
                {item.etoKanji}
              </div>

              {/*
                  横 1 列にするのは xl（1280px）から。以前は md（768px）で
                  横並びにしていたが、この行は時刻の範囲（2026/08/19 22:55 -
                  2026/08/20 00:55）だけで 330px あり、干支・九星・八門・
                  判定・ボタンを足すと 1000px 近く要る。タブレットでは
                  収まらず、時刻が箱からはみ出して「戊子の刻」に重なり、
                  干支が 1 文字ずつ縦に折り返していた（利用者の画面で確認）。
                  収まらない幅では縦に積む。
                */}
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between relative z-10 gap-2 xl:gap-4">
                {/* Time and Zodiac */}
                {/*
                    min-w-[200px] は「200px までは縮んでよい」の意味になる。
                    中の時刻は whitespace-nowrap なので、縮んだぶんがそのまま
                    はみ出して隣に重なっていた。縮ませない（shrink-0）。
                  */}
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
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
                    <span className="text-[9px] text-stone-600 font-mono hidden sm:inline-block tracking-widest uppercase">
                      [{item.reading}]
                    </span>
                  </div>
                </div>

                {/* Kyusei and Hachimon Summaries */}
                <div className="flex flex-row items-center gap-2 xl:gap-4 flex-1 min-w-0 text-[10px] sm:text-xs w-full">
                  {/* 九星 */}
                  <div className="flex flex-col w-1/3 xl:w-auto shrink-0">
                    <span className="text-stone-600 text-[10px] uppercase tracking-widest leading-none mb-1">
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
                    <span className="text-stone-600 text-[10px] uppercase tracking-widest leading-none mb-1">
                      Gate(ゲート)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-bold ${isVoid ? "text-red-800" : item.hachimon.auspicious ? "text-amber-600" : "text-stone-500"}`}
                      >
                        {item.hachimon.japanese}
                      </span>
                      <span className="text-[9px] text-stone-600 hidden sm:inline-block border-l border-stone-300 pl-1.5">
                        {getGateDescription(item.hachimon.japanese)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Badge & Toggle Button */}
                <div className="flex items-center justify-between w-full xl:w-auto gap-2 mt-2 xl:mt-0 shrink-0">
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
                      <span className="text-stone-600 text-[10px] font-mono tracking-widest border border-stone-200 px-2 py-0.5 bg-white/70">
                        ROUTINE
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleRow(index)}
                    className="text-[10px] text-stone-600 hover:text-blue-600 flex items-center gap-1 transition-colors uppercase tracking-widest font-bold bg-white/80 px-2 py-1 border border-stone-200 whitespace-nowrap"
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
                <div className="mt-3 pt-3 border-t border-stone-200 relative z-10 flex flex-col md:flex-row gap-4 bg-white/70 p-2 rounded-xl animate-fade-in">
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
                              <span className="text-stone-600">×</span>
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
                              <span className="text-stone-600">Status:</span>
                              <span
                                className={`font-bold ${evalPhase.isFavorable ? "text-emerald-600" : "text-stone-500"}`}
                              >
                                {evalPhase.relation || "関係性なし (中立)"}
                              </span>
                            </div>
                            <p className="mt-1 text-[9px] opacity-80 text-justify">
                              陰陽五行説（木火土金水）に基づく、あなたの本命星といまの九星の相性です。相生（生み出す関係）や比和（同じ属性）であれば、良い組み合わせとされます。
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
                  <div className="bg-white/70 p-2 border border-stone-200 rounded-xl flex flex-col items-center justify-center min-w-[200px]">
                    <div className="text-[9px] text-stone-600 uppercase tracking-widest mb-2 font-bold">
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
                className="text-stone-600 hover:text-stone-900 font-mono text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <p className="text-stone-500 text-xs font-mono mb-4 text-justify leading-relaxed">
              以下は、いまの判定に使っている値の一覧です。本命星・現在地・盤の状態がすべて含まれます。内容を確かめて、手元に残す場合は書き出してください。
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

"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Info,
  TrendingUp,
  Globe,
  Radio,
  Zap,
  Activity,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { getRokuyo, getLuckyDays, isJapaneseHoliday } from "@/utils/lunar";
import { AstroEngine } from "@/utils/ephemerisEngine";

interface DayData {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  rokuyo: string;
  luckyDays: {
    isIchiryumanbai: boolean;
    isTensho: boolean;
    labels: string[];
  };
  holiday: {
    isHoliday: boolean;
    name: string;
  };
  lunarPhase: {
    name: string;
    symbol: string;
    desc: string;
  };
  solarLongitude: number;
  sekki: string;
  retrogrades: {
    mercury: boolean;
    venus: boolean;
    mars: boolean;
    jupiter: boolean;
    saturn: boolean;
  };
  score: number;
}

// 24 seasonal nodes (24節気) mapping
const SEKKI = [
  "春分 (Shunbun)",
  "清明 (Seimei)",
  "穀雨 (Kokuu)",
  "立夏 (Rikka)",
  "小満 (Shoman)",
  "芒種 (Boshu)",
  "夏至 (Geshi)",
  "小暑 (Shosho)",
  "大暑 (Taisho)",
  "立秋 (Risshu)",
  "処暑 (Shosho)",
  "白露 (Hakuro)",
  "秋分 (Shubun)",
  "寒露 (Kanro)",
  "霜降 (Soko)",
  "立冬 (Ritto)",
  "小雪 (Shosetsu)",
  "大雪 (Taisetsu)",
  "冬至 (Toji)",
  "小寒 (Shokan)",
  "大寒 (Daikan)",
  "立春 (Risshun)",
  "雨水 (Usui)",
  "啓蟄 (Keichitsu)",
];

function getSekki(solarLong: number): string {
  const idx = Math.floor((solarLong + 7.5) / 15) % 24;
  return SEKKI[idx];
}

// Retrograde helper
function isPlanetRetrograde(
  planetGetter: (d: Date) => number,
  date: Date,
): boolean {
  try {
    const today = planetGetter(date);
    const yesterdayDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const yesterday = planetGetter(yesterdayDate);
    let diff = today - yesterday;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff < 0;
  } catch (err) {
    console.error("Retrograde check failed:", err);
    return false;
  }
}

// Lunar phase helper
function getLunarPhase(date: Date) {
  try {
    const sun = AstroEngine.getSolarLongitude(date);
    const moon = AstroEngine.getLunarLongitude(date);
    const diff = (moon - sun + 360) % 360;

    if (diff < 15 || diff >= 345)
      return {
        name: "新月",
        symbol: "🌑",
        desc: "新月: 物事をスタートするのに最適な時期。計画の種まきに吉。",
      };
    if (diff >= 15 && diff < 75)
      return {
        name: "三日月",
        symbol: "🌒",
        desc: "三日月: 計画を育て始めるのに良い時期。ゆっくりと行動へ。",
      };
    if (diff >= 75 && diff < 105)
      return {
        name: "上弦の月",
        symbol: "🌓",
        desc: "上弦の月: 積極的な行動を起こし、課題に向き合うべき時期。",
      };
    if (diff >= 105 && diff < 165)
      return {
        name: "十三夜月",
        symbol: "🌔",
        desc: "十三夜月: 満月に向けた最終調整を行うのに適した時期。",
      };
    if (diff >= 165 && diff < 195)
      return {
        name: "満月",
        symbol: "🌕",
        desc: "満月: 成果の収穫、感謝を示す時期。気が満ちており吉兆。",
      };
    if (diff >= 195 && diff < 255)
      return {
        name: "寝待月",
        symbol: "🌖",
        desc: "寝待月: 内省と不要なものの整理・手放しを始める時期。",
      };
    if (diff >= 255 && diff < 285)
      return {
        name: "下弦の月",
        symbol: "🌗",
        desc: "下弦の月: 断捨離や片付け、過去のリセットに適した整理期。",
      };
    return {
      name: "有明の月",
      symbol: "🌘",
      desc: "有明の月: 心身の回復を最優先し、次のサイクルに備える時期。",
    };
  } catch (err) {
    console.error("Lunar phase computation failed:", err);
    return {
      name: "中高月",
      symbol: "🌓",
      desc: "月相データの算出に一時的な障害があります。",
    };
  }
}

// Ingestion score calculation
function calculateAlignmentScore(
  rokuyo: string,
  luckyDays: { isIchiryumanbai: boolean; isTensho: boolean },
  retrogrades: { mercury: boolean; venus: boolean; mars: boolean },
  lunarPhase: string,
): number {
  let score = 60;

  // Rokuyo adjustments
  if (rokuyo.includes("大安")) score += 15;
  else if (rokuyo.includes("友引")) score += 10;
  else if (rokuyo.includes("先勝") || rokuyo.includes("先負")) score += 2;
  else if (rokuyo.includes("赤口")) score -= 10;
  else if (rokuyo.includes("仏滅")) score -= 15;

  // Lucky days adjustments
  if (luckyDays.isIchiryumanbai) score += 15;
  if (luckyDays.isTensho) score += 25;

  // Retrograde penalties (communication and motivation drops)
  if (retrogrades.mercury) score -= 6;
  if (retrogrades.venus) score -= 8;
  if (retrogrades.mars) score -= 8;

  // Lunar adjustments
  if (lunarPhase === "満月" || lunarPhase === "新月") score += 5;

  return Math.max(0, Math.min(100, score));
}

// Actionable advice logic
function getActionableAdvice(day: DayData): string {
  const retrogradeCount = Object.values(day.retrogrades).filter(Boolean).length;

  if (day.score >= 80) {
    return "🪐 [OPTIMAL_ALIGNMENT] 宇宙エネルギーとの共鳴が極めて高い吉日です。新規事業、大きな契約、引っ越し、旅立ちに最適。自信を持って前進してください。";
  }
  if (day.score >= 65) {
    return "✨ [FAVORABLE_ENERGY] 物事を前向きに進めやすい安定した日です。特に一粒万倍日を活かした自己投資、新しい知識のインプット、買い物に適しています。";
  }
  if (retrogradeCount >= 3) {
    return "⚠️ [COMMUNICATION_VOLATILITY] 3つ以上の天体逆行が重なり、通信障害やスケジュールの乱れが生じやすい警戒期です。契約書の見直しと丁寧な対話を。";
  }
  if (day.score < 45) {
    return "🛑 [ENERGY_DISSIPATION] 磁気ノイズや暦の凶兆が優勢です。大きな決断や新規の取り組みは極力避け、ルーチンワークや休息、メンテナンスに充ててください。";
  }
  return "🌐 [NEUTRAL_COGNITION] エネルギーのバランスが取れた日常の日です。新しい動きを起こすよりは、これまでの進捗確認や整理整頓に向いています。";
}

export function CosmicCalendar() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [days, setDays] = useState<DayData[]>([]);

  // JST weekday titles
  const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  // Compute days in grid when month changes
  useEffect(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startOffset = firstDayOfMonth.getDay(); // index of weekday
    const daysInMonth = lastDayOfMonth.getDate();

    const result: DayData[] = [];

    // 1. Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthLastDay - i);
      result.push(generateDayData(prevDate, false));
    }

    // 2. Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      result.push(generateDayData(date, true));
    }

    // 3. Next month padding days to complete grid (multiples of 7)
    const currentGridSize = result.length;
    const endOffset = currentGridSize % 7 === 0 ? 0 : 7 - (currentGridSize % 7);
    for (let i = 1; i <= endOffset; i++) {
      const nextDate = new Date(year, month + 1, i);
      result.push(generateDayData(nextDate, false));
    }

    setDays(result);

    // Auto-select today or first day
    const todayStr = new Date().toDateString();
    const matchedToday = result.find(
      (d) => d.isCurrentMonth && d.date.toDateString() === todayStr,
    );
    setSelectedDay(
      matchedToday || result.find((d) => d.isCurrentMonth) || null,
    );
  }, [currentDate]);

  const generateDayData = (date: Date, isCurrentMonth: boolean): DayData => {
    const rokuyo = getRokuyo(date);
    const luckyDays = getLuckyDays(date);
    const holiday = isJapaneseHoliday(date);
    const lunarPhase = getLunarPhase(date);
    const solarLong = AstroEngine.getSolarLongitude(date);
    const sekki = getSekki(solarLong);

    // Planet retrogrades
    const retrogrades = {
      mercury: isPlanetRetrograde(AstroEngine.getMercuryLongitude, date),
      venus: isPlanetRetrograde(AstroEngine.getVenusLongitude, date),
      mars: isPlanetRetrograde(AstroEngine.getMarsLongitude, date),
      jupiter: isPlanetRetrograde(AstroEngine.getJupiterLongitude, date),
      saturn: isPlanetRetrograde(AstroEngine.getSaturnLongitude, date),
    };

    const score = calculateAlignmentScore(
      rokuyo,
      luckyDays,
      retrogrades,
      lunarPhase.name,
    );

    return {
      date,
      dayOfMonth: date.getDate(),
      isCurrentMonth,
      rokuyo,
      luckyDays,
      holiday,
      lunarPhase,
      solarLongitude: solarLong,
      sekki,
      retrogrades,
      score,
    };
  };

  const handlePrevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 75)
      return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]";
    if (score >= 60)
      return "bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]";
    if (score >= 45) return "bg-zinc-400 shadow-none";
    return "bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]";
  };

  const getScoreBorder = (day: DayData) => {
    if (day.luckyDays.isTensho)
      return "border-amber-400/50 shadow-[inset_0_0_8px_rgba(251,191,36,0.15)]";
    if (day.luckyDays.isIchiryumanbai)
      return "border-emerald-400/30 shadow-[inset_0_0_8px_rgba(52,211,153,0.1)]";
    return "border-white/5";
  };

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Calendar Grid Section */}
      <div
        className="lg:col-span-2 p-5 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden"
        style={{
          borderColor: "rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Decorative Grid Lightbar */}
        <div
          className="absolute top-0 left-0 w-full h-[1px] opacity-50"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-accent, #10b981), transparent)",
          }}
        />

        {/* Calendar Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full animate-ping"
              style={{ backgroundColor: "var(--color-accent, #10b981)" }}
            />
            <span className="text-xs font-mono text-zinc-500 tracking-widest">
              {"// Cosmic Calendar Telemetry"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-lg font-bold font-mono tracking-wider text-white select-none">
              {currentDate.getFullYear()}.
              {String(currentDate.getMonth() + 1).padStart(2, "0")}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Weekday Labels */}
        <div className="grid grid-cols-7 gap-1.5 text-center mb-2">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`text-[9px] font-mono font-bold tracking-wider py-1 select-none ${
                i === 0
                  ? "text-rose-500/80"
                  : i === 6
                    ? "text-sky-500/80"
                    : "text-zinc-600"
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Day Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day, idx) => {
            const isToday =
              new Date().toDateString() === day.date.toDateString();
            const isSelected =
              selectedDay?.date.toDateString() === day.date.toDateString();

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(day)}
                className={`p-1.5 min-h-[56px] rounded-xl border flex flex-col justify-between items-start transition-all duration-300 relative group cursor-pointer ${
                  day.isCurrentMonth
                    ? "bg-white/[0.01] hover:bg-white/[0.03]"
                    : "bg-transparent opacity-20 pointer-events-none"
                } ${getScoreBorder(day)}`}
                style={{
                  borderColor: isSelected
                    ? "var(--color-accent, #10b981)"
                    : undefined,
                  boxShadow: isSelected
                    ? "0 0 12px color-mix(in srgb, var(--color-accent, #10b981) 15%, transparent)"
                    : undefined,
                }}
              >
                {/* Visual Indicators */}
                <div className="flex justify-between items-center w-full leading-none">
                  {/* Date number */}
                  <span
                    className={`text-xs font-mono font-bold ${
                      day.holiday.isHoliday || day.date.getDay() === 0
                        ? "text-rose-400"
                        : day.date.getDay() === 6
                          ? "text-sky-400"
                          : "text-zinc-300"
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>

                  {/* Moon icon */}
                  <span className="text-[10px] select-none text-zinc-500 leading-none">
                    {day.lunarPhase.symbol}
                  </span>
                </div>

                {/* Score LED indicator */}
                <div className="w-full flex items-center justify-between mt-2.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${getScoreColor(day.score)}`}
                  />

                  {/* Tiny label for major days */}
                  {day.luckyDays.isTensho && (
                    <span className="text-[8px] font-bold text-amber-400 font-mono scale-90 select-none">
                      赦
                    </span>
                  )}
                  {!day.luckyDays.isTensho && day.luckyDays.isIchiryumanbai && (
                    <span className="text-[8px] font-bold text-emerald-400 font-mono scale-90 select-none">
                      万
                    </span>
                  )}
                </div>

                {/* Cyber decoration dot */}
                {isToday && (
                  <span
                    className="absolute -top-[1.5px] -left-[1.5px] w-2 h-2 border-t-2 border-l-2 rounded-tl-sm"
                    style={{ borderColor: "var(--color-accent, #10b981)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inspector Details Column */}
      <div className="space-y-6">
        {selectedDay ? (
          <div
            className="p-5 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden transition-all duration-300"
            style={{
              borderColor: "rgba(255, 255, 255, 0.05)",
            }}
          >
            {/* Top Light Accent bar */}
            <div
              className="absolute top-0 left-0 w-full h-[2px]"
              style={{
                background: `linear-gradient(90deg, transparent, ${getScoreColor(selectedDay.score).includes("emerald") ? "rgb(52,211,153)" : getScoreColor(selectedDay.score).includes("indigo") ? "rgb(99,102,241)" : "rgba(255,255,255,0.2)"}, transparent)`,
              }}
            />

            {/* Title & Date */}
            <div className="border-b border-white/5 pb-4 mb-4">
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block">
                {"// Selected Node Telemetry"}
              </span>
              <h3 className="text-lg font-bold font-mono text-white mt-1">
                {selectedDay.date.getFullYear()}.
                {String(selectedDay.date.getMonth() + 1).padStart(2, "0")}.
                {String(selectedDay.date.getDate()).padStart(2, "0")}{" "}
                <span className="text-xs text-zinc-400 font-normal">
                  ({WEEKDAYS[selectedDay.date.getDay()]})
                </span>
              </h3>
              {selectedDay.holiday.isHoliday && (
                <span className="inline-block text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md mt-1 font-mono">
                  {selectedDay.holiday.name}
                </span>
              )}
            </div>

            {/* Score & Gauge */}
            <div className="mb-6">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                  Alignment Rating
                </span>
                <span
                  className="text-lg font-mono font-bold"
                  style={{
                    color:
                      selectedDay.score >= 75
                        ? "rgb(52,211,153)"
                        : selectedDay.score >= 60
                          ? "rgb(99,102,241)"
                          : selectedDay.score >= 45
                            ? "rgb(161,161,170)"
                            : "rgb(248,113,113)",
                  }}
                >
                  {selectedDay.score} INDEX
                </span>
              </div>
              <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${selectedDay.score}%`,
                    backgroundColor:
                      selectedDay.score >= 75
                        ? "rgb(52,211,153)"
                        : selectedDay.score >= 60
                          ? "rgb(99,102,241)"
                          : selectedDay.score >= 45
                            ? "rgb(161,161,170)"
                            : "rgb(248,113,113)",
                  }}
                />
              </div>
            </div>

            {/* Telemetry Grid */}
            <div className="space-y-4 font-mono text-xs">
              {/* Moon phase info */}
              <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <Moon className="w-3.5 h-3.5 text-zinc-400" />
                  Lunar Phase Telemetry
                </div>
                <div className="flex items-center gap-2 font-bold text-white mb-1">
                  <span className="text-lg leading-none">
                    {selectedDay.lunarPhase.symbol}
                  </span>
                  <span>{selectedDay.lunarPhase.name}</span>
                </div>
                <p className="text-[10.5px] text-zinc-400 leading-relaxed">
                  {selectedDay.lunarPhase.desc}
                </p>
              </div>

              {/* Solar seasonal node */}
              <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <Sun className="w-3.5 h-3.5 text-zinc-400" />
                  Solar seasonal Telemetry
                </div>
                <div className="text-white font-bold mb-1">
                  Node: {selectedDay.sekki}
                </div>
                <div className="text-[10px] text-zinc-500">
                  Solar Longitude: {selectedDay.solarLongitude.toFixed(2)}°
                </div>
              </div>

              {/* Rokuyo & Lucky calendar fortunes */}
              <div className="p-3 bg-black/30 border border-white/5 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  Calendar Fortunes
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">Rokuyo:</span>
                  <span className="text-white font-bold">
                    {selectedDay.rokuyo}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">吉兆 (Auspicious):</span>
                  <span className="text-white font-bold text-right">
                    {selectedDay.luckyDays.labels.join(" / ") || "特になし"}
                  </span>
                </div>
              </div>

              {/* Planet retrograde telemetry */}
              <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-[10px] text-zinc-500 uppercase tracking-wider">
                  <Radio className="w-3.5 h-3.5 text-zinc-400" />
                  Planetary Retrogrades
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <div className="flex justify-between items-center bg-black/20 p-1.5 rounded-lg border border-white/[0.03]">
                    <span className="text-zinc-500">水星 (Mercury)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.mercury
                          ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      {selectedDay.retrogrades.mercury ? "逆行" : "順行"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-1.5 rounded-lg border border-white/[0.03]">
                    <span className="text-zinc-500">金星 (Venus)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.venus
                          ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      {selectedDay.retrogrades.venus ? "逆行" : "順行"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-1.5 rounded-lg border border-white/[0.03]">
                    <span className="text-zinc-500">火星 (Mars)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.mars
                          ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      {selectedDay.retrogrades.mars ? "逆行" : "順行"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-black/20 p-1.5 rounded-lg border border-white/[0.03]">
                    <span className="text-zinc-500">木星 (Jupiter)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.jupiter
                          ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      }`}
                    >
                      {selectedDay.retrogrades.jupiter ? "逆行" : "順行"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Monospaced actionable advice (NBA) */}
              <div
                className="p-3.5 border rounded-xl"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.01)",
                  borderColor: "rgba(255, 255, 255, 0.05)",
                }}
              >
                <div className="flex items-center gap-2 mb-2 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                  <Activity className="w-3.5 h-3.5 text-zinc-400" />
                  Next Best Action Recommendation
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed font-mono">
                  {getActionAdvice(selectedDay)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white/[0.01] border border-white/5 text-center text-zinc-500 font-mono text-xs">
            {"// SELECT_NODE_TO_INSPECT"}
          </div>
        )}
      </div>
    </div>
  );

  function getActionAdvice(day: DayData): string {
    return getActionableAdvice(day);
  }
}

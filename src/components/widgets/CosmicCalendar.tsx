"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { AstroEngine, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { baziEngine } from "@/utils/baziEngine";
import { Solar, Lunar } from "lunar-javascript";
import { getZonedDateTimeFields } from "@/utils/solarTime";

export interface DayData {
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
  personalFortune?: {
    isVoid: boolean;
    isClash: boolean;
    isHarmony: boolean;
    dayZhi: string;
  };
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

const CLASH_MAP: Record<string, string> = {
  "子": "午", "午": "子",
  "丑": "未", "未": "丑",
  "寅": "申", "申": "寅",
  "卯": "酉", "酉": "卯",
  "辰": "戌", "戌": "辰",
  "巳": "亥", "亥": "巳"
};

const HARMONY_MAP: Record<string, string> = {
  "子": "丑", "丑": "子",
  "寅": "亥", "亥": "寅",
  "卯": "戌", "戌": "卯",
  "辰": "酉", "酉": "辰",
  "巳": "申", "申": "巳",
  "午": "未", "未": "午"
};

const ZHI_ELEMENTS: Record<string, string> = {
  "子": "水 (Water)",
  "丑": "土 (Earth)",
  "寅": "木 (Wood)",
  "卯": "木 (Wood)",
  "辰": "土 (Earth)",
  "巳": "火 (Fire)",
  "午": "火 (Fire)",
  "未": "土 (Earth)",
  "申": "金 (Metal)",
  "酉": "金 (Metal)",
  "戌": "土 (Earth)",
  "亥": "水 (Water)",
};

// Ingestion score calculation
function calculateAlignmentScore(
  rokuyo: string,
  luckyDays: { isIchiryumanbai: boolean; isTensho: boolean },
  retrogrades: { mercury: boolean; venus: boolean; mars: boolean },
  lunarPhase: string,
  personalFortune?: { isVoid: boolean; isClash: boolean; isHarmony: boolean; dayZhi: string },
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

  // Personal Fortune adjustments
  if (personalFortune) {
    if (personalFortune.isVoid) score -= 15;
    if (personalFortune.isClash) score -= 10;
    if (personalFortune.isHarmony) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

// Actionable advice logic
function getActionableAdvice(day: DayData): string {
  const retrogradeCount = Object.values(day.retrogrades).filter(Boolean).length;

  // Personal Fortune overrides
  if (day.personalFortune) {
    if (day.personalFortune.isVoid) {
      return "🌀 [天中殺/VOID] 本日はあなたにとって「天中殺（空亡）」の日です。天のシールドが薄く、想定外のエラーが起きやすい時。新しい契約や高額な買い物は避け、内省や心身のメンテナンス、清掃に専念することをおすすめします。";
    }
    if (day.personalFortune.isClash) {
      return "⚡ [日破/CLASH] 本日はあなたの日支と対沖（日破）する日です。他者との衝突や突発的な障害が生じやすい不安定な気流があります。感情的にならず、一歩引いて慎重に行動すると災いを避けられます。";
    }
    if (day.personalFortune.isHarmony) {
      return "🤝 [支合/HARMONY] 本日はあなたの日支と支合（合運）する調和の日です。周囲との繋がりが強化され、交渉、契約、協力関係の構築が極めてスムーズに進みます。重要な打ち合わせや自己アピールに最適なタイミングです。";
    }
  }

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

// The birth config is edited in the calendar card but consumed by every
// CosmicCalendar on the page (the top page mounts calendar/telemetry as two
// separate instances), so edits are broadcast instead of only living in state.
const BIRTH_CONFIG_EVENT = "cosmic-birth-config";

type BirthConfigKey = "wealth_birthDate" | "wealth_birthLon";

function persistBirthConfig(key: BirthConfigKey, value: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
  window.dispatchEvent(
    new CustomEvent(BIRTH_CONFIG_EVENT, { detail: { key, value } }),
  );
}

// Marker badges rendered inside each day cell, mirrored in the calendar legend
const LEGEND_MARKS = [
  { mark: "赦", label: "天赦日", className: "text-amber-600 bg-amber-500/10" },
  {
    mark: "万",
    label: "一粒万倍日",
    className: "text-emerald-600 bg-emerald-500/10",
  },
  {
    mark: "殺",
    label: "天中殺",
    className: "text-purple-600 bg-purple-500/20 border border-purple-200",
  },
  {
    mark: "破",
    label: "日破",
    className: "text-rose-600 bg-rose-500/20 border border-rose-200",
  },
  {
    mark: "合",
    label: "支合",
    className: "text-sky-600 bg-sky-500/20 border border-sky-200",
  },
];

// Thresholds mirror getScoreColor()
const LEGEND_SCORES = [
  { label: "75+", className: "bg-emerald-400" },
  { label: "60+", className: "bg-indigo-400" },
  { label: "45+", className: "bg-zinc-400" },
  { label: "<45", className: "bg-rose-400" },
];

export function CosmicCalendar({
  compact = false,
  view = "both",
  selectedDayState,
  setSelectedDayState,
}: {
  compact?: boolean;
  view?: "both" | "calendar" | "telemetry";
  selectedDayState?: DayData | null;
  setSelectedDayState?: (day: DayData | null) => void;
}) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [internalSelectedDay, setInternalSelectedDay] = useState<DayData | null>(null);
  
  const selectedDay = selectedDayState !== undefined ? selectedDayState : internalSelectedDay;
  const setSelectedDay = setSelectedDayState !== undefined ? setSelectedDayState : setInternalSelectedDay;
  
  const [days, setDays] = useState<DayData[]>([]);

  // Birthdate settings for personal calculations
  const [birthDate, setBirthDate] = useState<string>("");
  const [birthLon, setBirthLon] = useState<string>("139.6917");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedDate = localStorage.getItem("wealth_birthDate");
      const storedLon = localStorage.getItem("wealth_birthLon");
      if (storedDate) {
        setBirthDate(storedDate);
      } else {
        setIsSettingsOpen(true); // Default open if not configured
      }
      if (storedLon) setBirthLon(storedLon);
    }
  }, []);

  // Keep sibling instances in sync when the config is edited in one of them
  useEffect(() => {
    const handler = (event: Event) => {
      const { key, value } = (
        event as CustomEvent<{ key: BirthConfigKey; value: string }>
      ).detail;
      if (key === "wealth_birthDate") setBirthDate(value);
      if (key === "wealth_birthLon") setBirthLon(value);
    };
    window.addEventListener(BIRTH_CONFIG_EVENT, handler);
    return () => window.removeEventListener(BIRTH_CONFIG_EVENT, handler);
  }, []);

  // Compute user's natal day branch and void zodiacs
  let userDayZhi = "";
  let userVoidZodiacs: string[] = [];
  if (birthDate) {
    try {
      const bDate = new Date(birthDate);
      if (!isNaN(bDate.getTime())) {
        const bLonVal = parseFloat(birthLon) || 139.6917;
        const bazi = baziEngine.calculate(bDate, bLonVal);
        userDayZhi = bazi.pillars.day.zhi;
        userVoidZodiacs = getPersonalVoidZodiac(bDate);
      }
    } catch (e) {
      console.error("Failed to parse birthdate or calculate Bazi:", e);
    }
  }

  // JST weekday titles
  const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  // Compute days in grid when month or birthdate config changes
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
  }, [currentDate, birthDate, birthLon]);

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

    // Calculate personal transit fortunes
    let personalFortune = undefined;
    if (userDayZhi && userVoidZodiacs.length > 0) {
      try {
        const fields = getZonedDateTimeFields(date, 9);
        const solar = Solar.fromYmdHms(
          fields.year,
          fields.month,
          fields.day,
          12, // Standardize to noon to avoid boundary issues
          0,
          0
        );
        const lunar = solar.getLunar();
        const dayZhi = lunar.getEightChar().getDayZhi();

        const isVoid = userVoidZodiacs.includes(dayZhi);
        const isClash = dayZhi === CLASH_MAP[userDayZhi];
        const isHarmony = dayZhi === HARMONY_MAP[userDayZhi];

        personalFortune = {
          isVoid,
          isClash,
          isHarmony,
          dayZhi
        };
      } catch (e) {
        console.error("Personal fortune calculation failed:", e);
      }
    }

    const score = calculateAlignmentScore(
      rokuyo,
      luckyDays,
      retrogrades,
      lunarPhase.name,
      personalFortune,
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
      personalFortune,
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

  // Month-level aggregate shown in the calendar footer
  const monthSummary = useMemo(() => {
    const current = days.filter((d) => d.isCurrentMonth);
    if (current.length === 0) {
      return { lucky: 0, voidDays: 0, avgScore: 0, best: null as DayData | null };
    }
    return {
      lucky: current.filter(
        (d) => d.luckyDays.isIchiryumanbai || d.luckyDays.isTensho,
      ).length,
      voidDays: current.filter((d) => d.personalFortune?.isVoid).length,
      avgScore: Math.round(
        current.reduce((sum, d) => sum + d.score, 0) / current.length,
      ),
      best: current.reduce((a, b) => (b.score > a.score ? b : a)),
    };
  }, [days]);

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
      return "border-amber-200 shadow-[inset_0_0_8px_rgba(251,191,36,0.15)]";
    if (day.luckyDays.isIchiryumanbai)
      return "border-emerald-200 shadow-[inset_0_0_8px_rgba(52,211,153,0.1)]";
    return "border-stone-200/60";
  };

  const renderCalendar = (wrapperClassName: string) => (
    <div
      className={`${wrapperClassName} p-5 rounded-2xl bg-white/70 border backdrop-blur-md relative overflow-hidden flex flex-col`}
      style={{
        borderColor: "rgb(214, 211, 209)", // stone-300。白背景では白5%の枠が見えない
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
          <span className="text-xs font-mono text-stone-400 tracking-widest">
            {"// 暦カレンダー"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg bg-stone-100/80 border border-stone-200/60 text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-lg font-bold font-mono tracking-wider text-stone-900 select-none">
            {currentDate.getFullYear()}.
            {String(currentDate.getMonth() + 1).padStart(2, "0")}
          </h2>
          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg bg-stone-100/80 border border-stone-200/60 text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 transition-colors"
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
                  : "text-stone-400"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day Grid */}
      <div className="grid grid-cols-7 auto-rows-fr gap-1.5">
        {days.map((day, idx) => {
          const isToday =
            new Date().toDateString() === day.date.toDateString();
          const isSelected =
            selectedDay?.date.toDateString() === day.date.toDateString();

          return (
            <button
              key={idx}
              onClick={() => setSelectedDay(day)}
              className={`p-1.5 min-h-[80px] h-full rounded-xl border flex flex-col justify-between items-start transition-all duration-300 relative group cursor-pointer ${
                day.isCurrentMonth
                  ? "bg-white/70 hover:bg-white/90"
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
                      ? "text-rose-600"
                      : day.date.getDay() === 6
                        ? "text-sky-600"
                        : "text-stone-600"
                  }`}
                >
                  {day.dayOfMonth}
                </span>

                {/* Moon icon */}
                <span className="text-[10px] select-none text-stone-400 leading-none">
                  {day.lunarPhase.symbol}
                </span>
              </div>

              {/* Score LED indicator */}
              <div className="w-full flex items-center justify-between mt-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${getScoreColor(day.score)}`}
                />

                <div className="flex gap-0.5 items-center leading-none">
                  {/* Tiny label for major days */}
                  {day.luckyDays.isTensho && (
                    <span className="text-[8px] font-bold text-amber-600 font-mono scale-90 select-none bg-amber-500/10 px-0.5 rounded" title="天赦日">
                      赦
                    </span>
                  )}
                  {!day.luckyDays.isTensho && day.luckyDays.isIchiryumanbai && (
                    <span className="text-[8px] font-bold text-emerald-600 font-mono scale-90 select-none bg-emerald-500/10 px-0.5 rounded" title="一粒万倍日">
                      万
                    </span>
                  )}

                  {/* Personal Astro Fortunes */}
                  {day.personalFortune?.isVoid && (
                    <span className="text-[8px] font-bold text-purple-600 font-mono scale-90 select-none bg-purple-500/20 border border-purple-200 px-0.5 rounded animate-pulse" title="天中殺 (Void)">
                      殺
                    </span>
                  )}
                  {day.personalFortune?.isClash && (
                    <span className="text-[8px] font-bold text-rose-600 font-mono scale-90 select-none bg-rose-500/20 border border-rose-200 px-0.5 rounded" title="日破 (Clash)">
                      破
                    </span>
                  )}
                  {day.personalFortune?.isHarmony && (
                    <span className="text-[8px] font-bold text-sky-600 font-mono scale-90 select-none bg-sky-500/20 border border-sky-200 px-0.5 rounded" title="支合 (Harmony)">
                      合
                    </span>
                  )}
                </div>
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

      {/* Legend & Monthly Summary */}
      <div className="mt-5 pt-4 border-t border-stone-200/60 space-y-4">
        <div>
          <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block mb-2">
            {"// 凡例"}
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {LEGEND_MARKS.map((item) => (
              <div key={item.mark} className="flex items-center gap-1">
                <span
                  className={`text-[8px] font-bold font-mono px-0.5 rounded select-none ${item.className}`}
                >
                  {item.mark}
                </span>
                <span className="text-[9px] font-mono text-stone-500">
                  {item.label}
                </span>
              </div>
            ))}
            <span className="w-[1px] h-3 bg-stone-200" />
            {LEGEND_SCORES.map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${item.className}`}
                />
                <span className="text-[9px] font-mono text-stone-500">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block mb-2">
            {"// 月間集計"}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                label: "吉日",
                value: `${monthSummary.lucky}`,
                unit: "日",
              },
              {
                label: "天中殺",
                value: `${monthSummary.voidDays}`,
                unit: "日",
              },
              {
                label: "平均",
                value: `${monthSummary.avgScore}`,
                unit: "指数",
              },
              {
                label: "最良",
                value: monthSummary.best
                  ? `${monthSummary.best.dayOfMonth}`
                  : "--",
                unit: monthSummary.best
                  ? `/ ${monthSummary.best.score}`
                  : "指数",
              },
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-stone-200/60 bg-white/70 px-3 py-2"
              >
                <div className="text-[9px] font-mono text-stone-400 truncate">
                  {tile.label}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono text-stone-900">
                    {tile.value}
                  </span>
                  <span className="text-[9px] font-mono text-stone-400">
                    {tile.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Personal Setup / Info Settings */}
        <div className="pt-1 font-mono text-[11px]">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-full flex justify-between items-center text-stone-400 hover:text-stone-600 py-1 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              ⚙️ 暦・占術設定
            </span>
            <span>{isSettingsOpen ? "▲" : "▼"}</span>
          </button>

          {isSettingsOpen && (
            <div className="mt-2 p-3 bg-white/70 border border-stone-200/60 rounded-xl space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] text-stone-400 uppercase mb-1">
                    生年月日・時刻 (JST)
                  </label>
                  <input
                    type="datetime-local"
                    value={birthDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBirthDate(val);
                      persistBirthConfig("wealth_birthDate", val);
                    }}
                    className="w-full bg-white/70 border border-stone-200/80 rounded px-2 py-1 text-stone-900 text-[11px] focus:outline-none focus:border-emerald-200"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-stone-400 uppercase mb-1">
                    出生地の経度
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={birthLon}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBirthLon(val);
                      persistBirthConfig("wealth_birthLon", val);
                    }}
                    className="w-full bg-white/70 border border-stone-200/80 rounded px-2 py-1 text-stone-900 text-[11px] focus:outline-none focus:border-emerald-200"
                    placeholder="139.6917"
                  />
                </div>
              </div>
              <p className="text-[9px] text-stone-400 leading-normal">
                ※生年月日と経度を設定すると、あなたの宿命干支（日柱地支）と空亡（天中殺）を自動算出し、吉凶日と補正指数をカレンダーへ動的に投影します。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTelemetry = (wrapperClassName: string) => {
    return (
      <div className={wrapperClassName}>
        {selectedDay ? (
          <div
            className="p-5 rounded-2xl bg-white/70 border backdrop-blur-md relative overflow-hidden transition-all duration-300"
            style={{
              borderColor: "rgb(214, 211, 209)", // stone-300。白背景では白5%の枠が見えない
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
            <div className="border-b border-stone-200/60 pb-4 mb-4">
              <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">
                {"// 選択日の詳細"}
              </span>
              <h3 className="text-lg font-bold font-mono text-stone-900 mt-1">
                {selectedDay.date.getFullYear()}.
                {String(selectedDay.date.getMonth() + 1).padStart(2, "0")}.
                {String(selectedDay.date.getDate()).padStart(2, "0")}{" "}
                <span className="text-xs text-stone-500 font-normal">
                  ({WEEKDAYS[selectedDay.date.getDay()]})
                </span>
              </h3>
              {selectedDay.holiday.isHoliday && (
                <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-500/10 border border-rose-200 px-2 py-0.5 rounded-md mt-1 font-mono">
                  {selectedDay.holiday.name}
                </span>
              )}
            </div>

            {/* Score & Gauge */}
            <div className="mb-6">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">
                  適合度
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
                  {selectedDay.score} 指数
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/70 rounded-full overflow-hidden border border-stone-200/60">
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
              <div className="p-3 bg-white/70 border border-stone-200/60 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5 text-[10px] text-stone-400 uppercase tracking-wider">
                  <Moon className="w-3.5 h-3.5 text-stone-500" />
                  月相
                </div>
                <div className="flex items-center gap-2 font-bold text-stone-900 mb-1">
                  <span className="text-lg leading-none">
                    {selectedDay.lunarPhase.symbol}
                  </span>
                  <span>{selectedDay.lunarPhase.name}</span>
                </div>
                <p className="text-[10.5px] text-stone-500 leading-relaxed">
                  {selectedDay.lunarPhase.desc}
                </p>
              </div>

              {/* Solar seasonal node */}
              <div className="p-3 bg-white/70 border border-stone-200/60 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5 text-[10px] text-stone-400 uppercase tracking-wider">
                  <Sun className="w-3.5 h-3.5 text-stone-500" />
                  二十四節気
                </div>
                <div className="text-stone-900 font-bold mb-1">
                  節気: {selectedDay.sekki}
                </div>
                <div className="text-[10px] text-stone-400">
                  太陽黄経: {selectedDay.solarLongitude.toFixed(2)}°
                </div>
              </div>

              {/* Rokuyo & Lucky calendar fortunes */}
              <div className="p-3 bg-white/70 border border-stone-200/60 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-stone-400 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-stone-500" />
                  暦の吉凶
                </div>
                <div className="flex justify-between border-b border-stone-200/60 pb-1.5">
                  <span className="text-stone-400">六曜:</span>
                  <span className="text-stone-900 font-bold">
                    {selectedDay.rokuyo}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">吉兆:</span>
                  <span className="text-stone-900 font-bold text-right">
                    {selectedDay.luckyDays.labels.join(" / ") || "特になし"}
                  </span>
                </div>
              </div>

              {/* Personal Fortune Telemetry */}
              {selectedDay.personalFortune && (
                <div className="p-3 bg-white/70 border border-stone-200/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-[10px] text-stone-400 uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5 text-purple-600" />
                    個人運
                  </div>
                  <div className="flex justify-between border-b border-stone-200/60 pb-1.5 text-[11px] font-mono">
                    <span className="text-stone-400">本日の地支:</span>
                    <span className="text-stone-900 font-bold">
                      {selectedDay.personalFortune.dayZhi} ({ZHI_ELEMENTS[selectedDay.personalFortune.dayZhi]})
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-stone-200/60 pb-1.5 text-[11px] font-mono">
                    <span className="text-stone-400">宿命の日支:</span>
                    <span className="text-stone-900 font-bold">
                      {userDayZhi} ({ZHI_ELEMENTS[userDayZhi]})
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-stone-200/60 pb-1.5 text-[11px] font-mono">
                    <span className="text-stone-400">宿命の空亡:</span>
                    <span className="text-purple-600 font-bold">
                      {userVoidZodiacs.join("")}天中殺
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-stone-400">個人相性:</span>
                    <span className="font-bold">
                      {selectedDay.personalFortune.isVoid && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-600 border border-purple-200">
                          天中殺 (Void Day)
                        </span>
                      )}
                      {selectedDay.personalFortune.isClash && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-600 border border-rose-200">
                          対沖 (Clash / 日破)
                        </span>
                      )}
                      {selectedDay.personalFortune.isHarmony && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/10 text-sky-600 border border-sky-200">
                          支合 (Harmony / 合運)
                        </span>
                      )}
                      {!selectedDay.personalFortune.isVoid &&
                        !selectedDay.personalFortune.isClash &&
                        !selectedDay.personalFortune.isHarmony && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-500/10 text-stone-500 border border-zinc-500/20">
                            平常 (Neutral Day)
                          </span>
                        )}
                    </span>
                  </div>
                </div>
              )}

              {/* Planet retrograde telemetry */}
              <div className="p-3 bg-white/70 border border-stone-200/60 rounded-xl">
                <div className="flex items-center gap-2 mb-2 text-[10px] text-stone-400 uppercase tracking-wider">
                  <Radio className="w-3.5 h-3.5 text-stone-500" />
                  Planetary Retrogrades
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <div className="flex justify-between items-center bg-white/70 p-1.5 rounded-lg border border-stone-200">
                    <span className="text-stone-400">水星 (Mercury)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.mercury
                          ? "bg-rose-500/10 text-rose-600 border border-rose-200"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-200"
                      }`}
                    >
                      {selectedDay.retrogrades.mercury ? "逆行" : "順行"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-white/70 p-1.5 rounded-lg border border-stone-200">
                    <span className="text-stone-400">金星 (Venus)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.venus
                          ? "bg-rose-500/10 text-rose-600 border border-rose-200"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-200"
                      }`}
                    >
                      {selectedDay.retrogrades.venus ? "逆行" : "順行"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-white/70 p-1.5 rounded-lg border border-stone-200">
                    <span className="text-stone-400">火星 (Mars)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.mars
                          ? "bg-rose-500/10 text-rose-600 border border-rose-200"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-200"
                      }`}
                    >
                      {selectedDay.retrogrades.mars ? "逆行" : "順行"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-white/70 p-1.5 rounded-lg border border-stone-200">
                    <span className="text-stone-400">木星 (Jupiter)</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        selectedDay.retrogrades.jupiter
                          ? "bg-rose-500/10 text-rose-600 border border-rose-200"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-200"
                      }`}
                    >
                      {selectedDay.retrogrades.jupiter ? "逆行" : "順行"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Monospaced actionable advice (NBA) */}
              <div className="p-3 bg-white/70 border border-stone-200/60 rounded-xl">
                <div className="flex items-center gap-2 mb-1.5 text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                  <Activity className="w-3.5 h-3.5 text-stone-500" />
                  Next Best Action Recommendation
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed font-mono font-medium">
                  {getActionAdvice(selectedDay)}
                </p>
              </div>

            </div>
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-white/70 border border-stone-200/60 text-center text-stone-400 font-mono text-xs">
            {"// SELECT_NODE_TO_INSPECT"}
          </div>
        )}
      </div>
    );
  };

  if (view === "calendar") {
    return renderCalendar("w-full");
  }

  if (view === "telemetry") {
    return renderTelemetry("w-full space-y-6");
  }

  return (
    <div className={`w-full grid gap-6 items-start ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-1 2xl:grid-cols-3"}`}>
      {renderCalendar(compact ? "" : "2xl:col-span-2")}
      {renderTelemetry("space-y-6")}
    </div>
  );

  function getActionAdvice(day: DayData): string {
    return getActionableAdvice(day);
  }
}

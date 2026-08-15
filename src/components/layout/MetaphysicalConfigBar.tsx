"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Calendar,
  Sliders,
  PlayCircle,
  Info,
  RefreshCw,
} from "lucide-react";
import { todayInJapan } from "@/utils/japanDate";
import {
  loadProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";

export interface MetaphysicalConfig {
  targetDate: string; // YYYY-MM-DD
  useClassicalBoard: boolean; // true = 暦基準, false = 木星黄経基準
  physicalMonthMode?: "coupled" | "independent";
  directionFilterMode:
    | "composite"
    | "personal_kigaku"
    | "personal_bazi"
    | "environmental";
  actionIntent: "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION";
  birthDate?: string;
  birthLat?: number;
  birthLon?: number;
  baseLat?: number;
  baseLon?: number;
}

const FILTER_LABELS = {
  composite: "総合判定 (Composite)",
  personal_kigaku: "個人吉凶のみ (Nine Star Ki)",
  personal_bazi: "個人天中殺のみ (Void Zodiac)",
  environmental: "環境方位のみ (Environmental)",
} satisfies Record<MetaphysicalConfig["directionFilterMode"], string>;

const INTENT_LABELS = {
  DEFAULT: "標準 (Default)",
  REST: "休息・健康 (Rest)",
  BUSINESS: "ビジネス (Business)",
  MIGRATION: "長期移住 (Migration)",
} satisfies Record<MetaphysicalConfig["actionIntent"], string>;

function normalizeDirectionFilterMode(
  value: unknown,
): MetaphysicalConfig["directionFilterMode"] {
  return typeof value === "string" && Object.hasOwn(FILTER_LABELS, value)
    ? (value as MetaphysicalConfig["directionFilterMode"])
    : "composite";
}

function normalizeActionIntent(
  value: unknown,
): MetaphysicalConfig["actionIntent"] {
  return typeof value === "string" && Object.hasOwn(INTENT_LABELS, value)
    ? (value as MetaphysicalConfig["actionIntent"])
    : "DEFAULT";
}

function normalizeConfig(config: MetaphysicalConfig): MetaphysicalConfig {
  return {
    ...config,
    directionFilterMode: normalizeDirectionFilterMode(
      config.directionFilterMode,
    ),
    actionIntent: normalizeActionIntent(config.actionIntent),
  };
}
const DEFAULT_CONFIG: MetaphysicalConfig = {
  targetDate: todayInJapan(),
  useClassicalBoard: true,
  physicalMonthMode: "independent",
  directionFilterMode: "composite",
  actionIntent: "DEFAULT",
};

interface MetaphysicalConfigBarProps {
  onConfigChange?: (config: MetaphysicalConfig) => void;
}

/** 座標入力の受け口。範囲はそれぞれ緯度 ±90 / 経度 ±180。 */
type CoordField = "baseLat" | "baseLon" | "birthLat" | "birthLon";

const COORD_RANGE: Record<CoordField, number> = {
  baseLat: 90,
  baseLon: 180,
  birthLat: 90,
  birthLon: 180,
};

export const MetaphysicalConfigBar: React.FC<MetaphysicalConfigBarProps> = ({
  onConfigChange,
}) => {
  const [config, setConfig] = useState<MetaphysicalConfig>(DEFAULT_CONFIG);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  /**
   * 座標の下書き。確定（blur）まで saveConfig しない。
   *
   * 座標は桁が多く、1 文字ごとに保存すると「35」の時点で東京が能登沖に
   * 飛び、そのたび API へも POST が走る。入力中は下書きに置き、離れた
   * ときに数値として通れば保存、通らなければ元の値に戻す。
   */
  const [coordDrafts, setCoordDrafts] = useState<
    Partial<Record<CoordField, string>>
  >({});
  /**
   * 保存済みプロフィール（ホームの「保存済みプロフィールの呼び出し」と
   * 同じもの）。ホームまで戻らないと呼び出せない、という指摘への対応。
   * 展開パネルを開いたときに一度だけ読む。バーは全ページに居るので、
   * マウント時に読むと開きもしないページで毎回 API を叩くことになる。
   */
  const [presets, setPresets] = useState<ProfilePreset[] | null>(null);

  useEffect(() => {
    if (!isExpanded || presets !== null) return;
    let alive = true;
    loadProfilePresets(fetch, localStorage)
      .then((r) => {
        if (alive) setPresets(r.presets);
      })
      .catch(() => {
        if (alive) setPresets([]);
      });
    return () => {
      alive = false;
    };
  }, [isExpanded, presets]);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      const loadedConfig = { ...DEFAULT_CONFIG };

      // 1. Try local storage
      const localData = localStorage.getItem("tactical_config_v1");
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (parsed.use_classical_board !== undefined)
            loadedConfig.useClassicalBoard = parsed.use_classical_board;
          if (parsed.physical_month_mode !== undefined)
            loadedConfig.physicalMonthMode = parsed.physical_month_mode;
          if (parsed.direction_filter_mode !== undefined)
            loadedConfig.directionFilterMode = normalizeDirectionFilterMode(
              parsed.direction_filter_mode,
            );
          if (parsed.action_intent !== undefined)
            loadedConfig.actionIntent = normalizeActionIntent(
              parsed.action_intent,
            );
          if (parsed.target_date) loadedConfig.targetDate = parsed.target_date;
          if (parsed.birth_date) loadedConfig.birthDate = parsed.birth_date;
          if (parsed.birth_lat !== undefined)
            loadedConfig.birthLat = parsed.birth_lat;
          if (parsed.birth_lon !== undefined)
            loadedConfig.birthLon = parsed.birth_lon;
          if (parsed.base_lat !== undefined)
            loadedConfig.baseLat = parsed.base_lat;
          if (parsed.base_lon !== undefined)
            loadedConfig.baseLon = parsed.base_lon;
        } catch (e) {
          console.error("Failed to parse localStorage config:", e);
        }
      }

      // 2. Try API user-config (overwrite/merge)
      try {
        const res = await fetch("/api/user-config");
        if (res.ok) {
          const apiData = await res.json();
          if (apiData.use_classical_board !== undefined)
            loadedConfig.useClassicalBoard = apiData.use_classical_board;
          if (apiData.physical_month_mode !== undefined)
            loadedConfig.physicalMonthMode = apiData.physical_month_mode;
          if (apiData.direction_filter_mode !== undefined)
            loadedConfig.directionFilterMode = normalizeDirectionFilterMode(
              apiData.direction_filter_mode,
            );
          if (apiData.action_intent !== undefined)
            loadedConfig.actionIntent = normalizeActionIntent(
              apiData.action_intent,
            );
          if (apiData.target_date)
            loadedConfig.targetDate = apiData.target_date;
          if (apiData.birth_date) loadedConfig.birthDate = apiData.birth_date;
          if (apiData.birth_lat !== undefined)
            loadedConfig.birthLat = apiData.birth_lat;
          if (apiData.birth_lon !== undefined)
            loadedConfig.birthLon = apiData.birth_lon;
          if (apiData.base_lat !== undefined)
            loadedConfig.baseLat = apiData.base_lat;
          if (apiData.base_lon !== undefined)
            loadedConfig.baseLon = apiData.base_lon;
        }
      } catch (e) {
        console.warn(
          "Failed to load user config from API, relying on localStorage:",
          e,
        );
      }

      setConfig(loadedConfig);
      if (onConfigChange) onConfigChange(loadedConfig);
    };

    loadConfig();

    // Listen to updates from other instances
    const handleGlobalUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<MetaphysicalConfig>;
      if (customEvent.detail) {
        const normalizedConfig = normalizeConfig(customEvent.detail);
        setConfig(normalizedConfig);
        if (onConfigChange) onConfigChange(normalizedConfig);
      }
    };

    window.addEventListener("metaphysical-config-updated", handleGlobalUpdate);
    return () => {
      window.removeEventListener(
        "metaphysical-config-updated",
        handleGlobalUpdate,
      );
    };
  }, []);

  const saveConfig = async (newConfig: MetaphysicalConfig) => {
    const updatedConfig = normalizeConfig({ ...config, ...newConfig });
    setConfig(updatedConfig);
    setIsSyncing(true);

    const apiBody: any = {
      use_classical_board: updatedConfig.useClassicalBoard,
      physical_month_mode: updatedConfig.physicalMonthMode || "independent",
      direction_filter_mode: updatedConfig.directionFilterMode,
      action_intent: updatedConfig.actionIntent,
      target_date: updatedConfig.targetDate,
    };
    if (updatedConfig.birthDate) apiBody.birth_date = updatedConfig.birthDate;
    if (updatedConfig.birthLat !== undefined)
      apiBody.birth_lat = updatedConfig.birthLat;
    if (updatedConfig.birthLon !== undefined)
      apiBody.birth_lon = updatedConfig.birthLon;
    if (updatedConfig.baseLat !== undefined)
      apiBody.base_lat = updatedConfig.baseLat;
    if (updatedConfig.baseLon !== undefined)
      apiBody.base_lon = updatedConfig.baseLon;

    // Save locally
    try {
      const localData = localStorage.getItem("tactical_config_v1");
      let currentLocal = {};
      if (localData) {
        try {
          currentLocal = JSON.parse(localData);
        } catch (e) {}
      }
      localStorage.setItem(
        "tactical_config_v1",
        JSON.stringify({
          ...currentLocal,
          ...apiBody,
        }),
      );
    } catch (e) {
      console.error("Failed to save config to localStorage:", e);
    }

    // Save to API
    try {
      await fetch("/api/user-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
    } catch (e) {
      console.error("Failed to save config to API:", e);
    }

    // Dispatch global event for instant synchrony across same-page components
    const event = new CustomEvent<MetaphysicalConfig>(
      "metaphysical-config-updated",
      { detail: updatedConfig },
    );
    window.dispatchEvent(event);

    // Trigger parent callback
    if (onConfigChange) {
      onConfigChange(updatedConfig);
    }

    setTimeout(() => setIsSyncing(false), 400);
  };

  const handleToggleClassical = () => {
    saveConfig({ ...config, useClassicalBoard: !config.useClassicalBoard });
  };

  /**
   * 座標の確定。数値として通れば保存、通らなければ元の値に戻す。
   *
   * 空欄は「触っていない」として何もしない。バーから座標を消す操作は
   * 提供しない（消すと、そのページだけでなく全ページの判定が同時に
   * 出せなくなる。消したい場面が無いのに事故の口だけ増える）。
   */
  const commitCoord = (field: CoordField) => {
    const draft = coordDrafts[field];
    if (draft === undefined) return;
    setCoordDrafts((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    const trimmed = draft.trim();
    if (trimmed === "") return;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || Math.abs(value) > COORD_RANGE[field]) {
      return; // 下書きを捨てるだけで、保存済みの値はそのまま
    }
    if (value === config[field]) return;
    saveConfig({ ...config, [field]: value });
  };

  /** 座標欄の表示値。下書きがあれば下書き、無ければ保存済みの値。 */
  const coordValue = (field: CoordField): string => {
    const draft = coordDrafts[field];
    if (draft !== undefined) return draft;
    const saved = config[field];
    return typeof saved === "number" && Number.isFinite(saved)
      ? String(saved)
      : "";
  };

  /**
   * 保存済みプロフィールを反映する。書き込むのは判定の基準
   * （生年月日・出生地・現在地）だけ。プリセットには HRV や API キー
   * など専門項目も入っているが、それらはホームの画面が管理していて、
   * バーから黙って上書きすると「触っていない設定が変わった」になる。
   */
  const applyPreset = (id: string) => {
    const preset = presets?.find((entry) => entry.id === id);
    if (!preset) return;
    saveConfig({
      ...config,
      birthDate: preset.birthDate,
      birthLat: preset.birthLat,
      birthLon: preset.birthLon,
      baseLat: preset.baseLat,
      baseLon: preset.baseLon,
    });
    // 座標欄に古い下書きが残っていると、反映した値が見えない。
    setCoordDrafts({});
  };

  /** 座標 1 枠。緯度・経度のペアで 4 回使うので畳んである。 */
  const coordInput = (field: CoordField, placeholder: string) => (
    <input
      type="text"
      inputMode="decimal"
      value={coordValue(field)}
      placeholder={placeholder}
      onChange={(e) =>
        setCoordDrafts((prev) => ({ ...prev, [field]: e.target.value }))
      }
      onBlur={() => commitCoord(field)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-indigo-200 transition-colors shadow-inner"
    />
  );

  const handleFilterChange = (
    mode: MetaphysicalConfig["directionFilterMode"],
  ) => {
    saveConfig({ ...config, directionFilterMode: mode });
  };

  const handleIntentChange = (intent: MetaphysicalConfig["actionIntent"]) => {
    saveConfig({ ...config, actionIntent: intent });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    saveConfig({ ...config, targetDate: e.target.value });
  };

  const getFilterLabel = (mode: MetaphysicalConfig["directionFilterMode"]) => {
    return FILTER_LABELS[normalizeDirectionFilterMode(mode)];
  };

  const getIntentLabel = (intent: MetaphysicalConfig["actionIntent"]) => {
    return INTENT_LABELS[normalizeActionIntent(intent)];
  };

  return (
    <div className="w-full bg-white/80 border border-stone-200 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden text-stone-800 transition-all font-mono text-xs select-none">
      {/* 1. Header (Compact Display Bar) */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-white/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 border border-indigo-200 animate-pulse">
            <Compass className="w-4 h-4" />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 font-bold uppercase tracking-wider">
                目標日:
              </span>
              <span className="text-stone-900 font-bold">
                {config.targetDate}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 font-bold uppercase tracking-wider">
                基準:
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  config.useClassicalBoard
                    ? "bg-indigo-500/20 text-indigo-600 border border-indigo-200"
                    : "bg-amber-500/20 text-amber-600 border border-amber-200"
                }`}
              >
                {config.useClassicalBoard
                  ? "古典暦基準 (立春基準)"
                  : `物理天体基準 (木星黄経 - ${config.physicalMonthMode === "coupled" ? "伝統連動" : "物理独立"})`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 font-bold uppercase tracking-wider">
                フィルタ:
              </span>
              <span className="text-stone-600 font-semibold">
                {getFilterLabel(config.directionFilterMode).split(" ")[0]}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 font-bold uppercase tracking-wider">
                目的:
              </span>
              <span className="text-stone-600 font-semibold">
                {getIntentLabel(config.actionIntent).split(" ")[0]}
              </span>
            </div>
            {/* 生年月日は判定の前提なので、畳んだ状態でも設定の有無が
                見えるようにする。未設定なら琥珀色で「開けば直せる」ことを
                示す（未設定のまま使うと判定が出ないため）。 */}
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 font-bold uppercase tracking-wider">
                生年月日:
              </span>
              <span
                className={
                  config.birthDate
                    ? "text-stone-600 font-semibold"
                    : "text-amber-600 font-semibold"
                }
              >
                {config.birthDate?.slice(0, 10) ?? "未設定"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {isSyncing && (
            <span className="text-[10px] text-stone-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
              Syncing...
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-stone-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-400" />
          )}
        </div>
      </div>

      {/* 2. Expanded Options (Accordion Settings Panel) */}
      {isExpanded && (
        <div className="border-t border-stone-200 bg-white/80 p-5 space-y-5 animate-slideDown">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {/* Target Date */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" /> 目標年月日
              </label>
              <input
                type="date"
                value={config.targetDate}
                onChange={handleDateChange}
                className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-indigo-200 transition-colors shadow-inner"
              />
            </div>

            {/* Board Standard */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" /> 方位盤基準
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-stone-200">
                <button
                  type="button"
                  onClick={() =>
                    saveConfig({ ...config, useClassicalBoard: true })
                  }
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    config.useClassicalBoard
                      ? "bg-indigo-500/20 text-indigo-600 border border-indigo-200"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  暦基準 (古典)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveConfig({ ...config, useClassicalBoard: false })
                  }
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    !config.useClassicalBoard
                      ? "bg-amber-500/20 text-amber-600 border border-amber-200"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  木星黄経 (物理)
                </button>
              </div>

              {/* Sub-option for Physical Month Star Calculation */}
              {!config.useClassicalBoard && (
                <div className="pt-1 space-y-1">
                  <span className="text-[9px] text-stone-400 block">
                    月盤の算出方法:
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-white rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() =>
                        saveConfig({
                          ...config,
                          physicalMonthMode: "independent",
                        })
                      }
                      className={`py-1 rounded text-[9px] font-bold transition-all ${
                        config.physicalMonthMode === "independent" ||
                        !config.physicalMonthMode
                          ? "bg-stone-100 text-stone-900 shadow-sm"
                          : "bg-transparent text-stone-400 hover:text-stone-600"
                      }`}
                      title="物理独立型: 年盤は木星、月盤は太陽の位置から、それぞれ他方に依存せず独立して算出します。"
                    >
                      物理独立
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        saveConfig({ ...config, physicalMonthMode: "coupled" })
                      }
                      className={`py-1 rounded text-[9px] font-bold transition-all ${
                        config.physicalMonthMode === "coupled"
                          ? "bg-stone-100 text-stone-900 shadow-sm"
                          : "bg-transparent text-stone-400 hover:text-stone-600"
                      }`}
                      title="伝統連動型: 木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。"
                    >
                      伝統連動
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Direction Filter Mode */}
            <div className="space-y-2 col-span-1 sm:col-span-2">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-600" />{" "}
                吉凶方位フィルター
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-white rounded-xl border border-stone-200">
                {(
                  [
                    "composite",
                    "personal_kigaku",
                    "personal_bazi",
                    "environmental",
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFilterChange(mode)}
                    className={`py-1.5 rounded-lg text-[9px] font-bold transition-all border ${
                      config.directionFilterMode === mode
                        ? "bg-stone-100 text-stone-900 border-stone-300 shadow-sm"
                        : "bg-transparent text-stone-400 border-transparent hover:text-stone-600"
                    }`}
                  >
                    {mode === "composite"
                      ? "総合 (ALL)"
                      : mode === "personal_kigaku"
                        ? "個人吉凶"
                        : mode === "personal_bazi"
                          ? "天中殺のみ"
                          : "環境のみ"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* プロフィール（生年月日・出生地・現在地）。
              保存経路（tactical_config_v1 / user-config）も同期イベントも
              以前からこのバーを通っていて、入力欄だけが無かった。そのため
              「ホームで設定してから来てください」という導線になっており、
              どのページからでも直せるようにする（利用者の要望）。
              ホームと同じ値を読み書きするので、どちらで変えても揃う。 */}
          <div className="space-y-2 pt-3 border-t border-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-600" />
                プロフィール（全ページ共通・判定の基準）
              </label>
              {/* 保存済みプロフィールの呼び出し。ホームで保存したもの
                  （本人・家族など）をどのページからでも切り替えられる。
                  選ぶと生年月日と座標が入れ替わり、判定が引き直される */}
              {presets !== null && presets.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) applyPreset(e.target.value);
                  }}
                  className="px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-[10px] text-stone-600 outline-none focus:border-indigo-200 cursor-pointer"
                >
                  <option value="">保存済みプロフィールを呼び出す...</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-[9px] text-stone-400 block">
                  生年月日（本命星と天中殺の基準）
                </span>
                <input
                  type="date"
                  value={config.birthDate?.slice(0, 10) ?? ""}
                  onChange={(e) => {
                    // 空は「消した」ではなく入力途中。保存しない。
                    if (e.target.value)
                      saveConfig({ ...config, birthDate: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-indigo-200 transition-colors shadow-inner"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-stone-400 block">
                  現在地＝出発地（方位はここから測る）
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {coordInput("baseLat", "緯度 34.99")}
                  {coordInput("baseLon", "経度 135.72")}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-stone-400 block">
                  出生地（任意・天体ラインの基準）
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {coordInput("birthLat", "緯度 37.57")}
                  {coordInput("birthLon", "経度 126.98")}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-stone-200">
            {/* Action Intent Weighting */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-400 tracking-wider flex items-center gap-1">
                <PlayCircle className="w-3.5 h-3.5 text-indigo-600" />{" "}
                アクション目的 (重みづけ)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-white rounded-xl border border-stone-200">
                {(["DEFAULT", "REST", "BUSINESS", "MIGRATION"] as const).map(
                  (intent) => (
                    <button
                      key={intent}
                      type="button"
                      onClick={() => handleIntentChange(intent)}
                      className={`py-1.5 rounded-lg text-[9px] font-bold transition-all border ${
                        config.actionIntent === intent
                          ? "bg-indigo-500/20 text-indigo-600 border-indigo-200"
                          : "bg-transparent text-stone-400 border-transparent hover:text-stone-600"
                      }`}
                    >
                      {intent === "DEFAULT"
                        ? "標準"
                        : intent === "REST"
                          ? "休息・健康"
                          : intent === "BUSINESS"
                            ? "ビジネス"
                            : "長期移住"}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Explanation box */}
            <div className="p-3 bg-white/70 rounded-xl border border-stone-200 flex items-start gap-2.5 text-[10px] text-stone-400 leading-normal">
              <Info className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-500 block mb-0.5">
                  フィルター/目的の効果説明
                </span>
                {config.directionFilterMode === "personal_kigaku" &&
                  "「個人吉凶」が選択されているため、本命星や相性星のみを評価します。五黄殺等の共通環境凶方位や天中殺は計算から無視されます。"}
                {config.directionFilterMode === "personal_bazi" &&
                  "「個人天中殺のみ」が選択されています。生誕の日干支から算出される空亡（天中殺）方位のみをペナルティとして抽出します。"}
                {config.directionFilterMode === "environmental" &&
                  "「環境方位のみ」が選択されています。五黄殺・暗剣殺・各種「破」といった万人共通の環境凶方位のみをマッピングします。"}
                {config.directionFilterMode === "composite" &&
                  "「総合判定」が選択されています。環境の地磁気および天体干渉と、個人のバイオリズムを重ね合わせて統合評価します。"}
                {!config.useClassicalBoard && (
                  <span className="block mt-1 text-amber-600">
                    {config.physicalMonthMode === "coupled"
                      ? "※物理月盤は「伝統連動型」で動作中：木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。"
                      : "※物理月盤は「物理独立型」で動作中：年盤は木星、月盤は太陽の位置から、それぞれ他方に依存せず独立して算出します。"}
                  </span>
                )}
                <span className="block mt-1">
                  {config.actionIntent === "REST" &&
                    "※「休息目的」に合わせたバイオリズム・月相・気学の吉方位の重み付け補正がアクティブです。"}
                  {config.actionIntent === "BUSINESS" &&
                    "※「ビジネス目的」に合わせたタイミング・方位価値（Q値）の活性化補正がアクティブです。"}
                  {config.actionIntent === "MIGRATION" &&
                    "※「長期移住目的」に特化し、年盤・月盤の長期レイヤーを最重要視する評価ロジックが働いています。"}
                  {config.actionIntent === "DEFAULT" &&
                    "※「標準目的」で動作中。各レイヤーをフラットに評価します。"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

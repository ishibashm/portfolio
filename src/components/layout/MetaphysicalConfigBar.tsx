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
import type { ZodiacTimeBasis } from "@/utils/ephemerisEngine";
/* 絞り込みの見方は葉から取る。ephemerisEngine から値で取ると、
   暦エンジン一式が client のバンドルに乗る（backlog 17 節）。 */
import {
  DIRECTION_FILTER_MODES,
  type DirectionFilterMode,
} from "@/utils/directionFilterMode";
import {
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import { PROFILE_FIELDS } from "@/lib/profileFields";

export interface MetaphysicalConfig {
  targetDate: string; // YYYY-MM-DD
  useClassicalBoard: boolean; // true = 暦基準, false = 木星黄経基準
  /**
   * 時支をどの時刻で採るか。
   *
   *   "standard"  標準時（JST 一律）。**既定。**従来の答えのまま
   *   "solar"     真太陽時（出発地の経度補正 + 均時差）
   *
   * 流派で分かれるので切り替えにしてある。詳しくは
   * `ZodiacTimeBasis`（utils/ephemerisEngine）。
   */
  zodiacTimeBasis: ZodiacTimeBasis;
  physicalMonthMode?: "coupled" | "independent";
  directionFilterMode: DirectionFilterMode;
  actionIntent: "DEFAULT" | "REST" | "BUSINESS" | "MIGRATION";
  birthDate?: string;
  birthLat?: number;
  birthLon?: number;
  baseLat?: number;
  baseLon?: number;
}

const FILTER_LABELS = {
  composite: "総合判定 (Composite)",
  personal_kigaku: "本命星のみ (Nine Star Ki)",
  personal_bazi: "天中殺のみ (Void Zodiac)",
  environmental: "環境方位のみ (Environmental)",
  personal_kigaku_environmental: "本命星 ＋ 環境方位",
  personal_kigaku_bazi: "本命星 ＋ 天中殺",
  environmental_bazi: "環境方位 ＋ 天中殺",
} satisfies Record<MetaphysicalConfig["directionFilterMode"], string>;

/**
 * 選んだ見方の説明。**7 つ全部に文がある**ことを型で強制する。
 *
 * 以前は 4 つの `&&` 分岐で、組み合わせの 3 つ（本命星＋環境方位 など）を
 * 選ぶと見出しだけ出て中身が空だった。利用者の求めで足した組み合わせが
 * まさにその 3 つ。
 *
 * 文言は `directionFilterMode.ts` の LAYERS（どの層を見るか）を写す。
 * 「地磁気」「バイオリズム」のように、判定に入っていないものを書かない。
 */
const FILTER_EXPLANATIONS: Record<DirectionFilterMode, string> = {
  composite:
    "「総合判定」が選択されています。本命星（本命殺・本命的殺・相性）、環境方位（五黄殺・暗剣殺・破・月交点）、天中殺（空亡）の 3 つの層をすべて重ねて評価します。",
  personal_kigaku:
    "「本命星のみ」が選択されているため、本命星や相性星のみを評価します。五黄殺等の共通環境凶方位や天中殺は計算から無視されます。",
  personal_bazi:
    "「天中殺のみ」が選択されています。生誕の日干支から算出される空亡（天中殺）方位のみをペナルティとして抽出します。",
  environmental:
    "「環境方位のみ」が選択されています。五黄殺・暗剣殺・各種「破」といった万人共通の環境凶方位のみをマッピングします。",
  personal_kigaku_environmental:
    "「本命星 ＋ 環境方位」が選択されています。本命星の相性と、五黄殺・暗剣殺・破などの共通凶方位を重ねます。天中殺は見ません。",
  personal_kigaku_bazi:
    "「本命星 ＋ 天中殺」が選択されています。本命星の相性と、生誕の日干支から出る空亡（天中殺）方位を重ねます。五黄殺などの共通凶方位は見ません。",
  environmental_bazi:
    "「環境方位 ＋ 天中殺」が選択されています。五黄殺・暗剣殺・破などの共通凶方位と、空亡（天中殺）方位を重ねます。本命星の相性は見ません。",
};

/** ボタンに出す短い名前。 */
const FILTER_SHORT_LABELS: Record<DirectionFilterMode, string> = {
  composite: "総合 (ALL)",
  personal_kigaku: "本命星",
  environmental: "環境",
  personal_bazi: "天中殺",
  personal_kigaku_environmental: "本命星＋環境",
  personal_kigaku_bazi: "本命星＋天中殺",
  environmental_bazi: "環境＋天中殺",
};

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

/**
 * 時支の時刻基準を正す。**"solar" 以外は全部 "standard" に倒す。**
 *
 * 古い localStorage や別画面から来た値には、この欄が無いことがある。
 * 無いときに undefined のまま持ち回ると、「既定は標準時」という約束が
 * 画面ごとの書き方（`!== "solar"` か `=== "standard"` か）に依存してしまう。
 * ここで 1 か所に倒しておく。
 */
export function normalizeZodiacTimeBasis(value: unknown): ZodiacTimeBasis {
  return value === "solar" ? "solar" : "standard";
}

function normalizeConfig(config: MetaphysicalConfig): MetaphysicalConfig {
  return {
    ...config,
    directionFilterMode: normalizeDirectionFilterMode(
      config.directionFilterMode,
    ),
    actionIntent: normalizeActionIntent(config.actionIntent),
    zodiacTimeBasis: normalizeZodiacTimeBasis(config.zodiacTimeBasis),
  };
}
const DEFAULT_CONFIG: MetaphysicalConfig = {
  targetDate: todayInJapan(),
  useClassicalBoard: true,
  // 既定は据え置き。変えると全利用者の答えが動く。
  zodiacTimeBasis: "standard",
  physicalMonthMode: "independent",
  directionFilterMode: "composite",
  actionIntent: "DEFAULT",
};

interface MetaphysicalConfigBarProps {
  onConfigChange?: (config: MetaphysicalConfig) => void;
}

/** 座標入力の受け口。範囲はそれぞれ緯度 ±90 / 経度 ±180。 */

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
  /**
   * 保存済みプロフィール（ホームの「保存済みプロフィールの呼び出し」と
   * 同じもの）。ホームまで戻らないと呼び出せない、という指摘への対応。
   * 展開パネルを開いたときに一度だけ読む。バーは全ページに居るので、
   * マウント時に読むと開きもしないページで毎回 API を叩くことになる。
   */
  const [presets, setPresets] = useState<ProfilePreset[] | null>(null);
  /*
    いまの設定を保存済みプロフィールに足す。呼び出す口はあったのに
    登録する口がホーム（QuickProfileBar）とダッシュボードのタブにしか
    無く、物件検索の頁からは「登録できる所が無い」に見えていた
    （利用者の指摘）。保存先は既存の 1 か所（lib/profilePresetSync）。
    書くのは判定の基準（生年月日・出生地・現在地）だけ。
  */
  const [presetName, setPresetName] = useState("");
  const [presetNote, setPresetNote] = useState<string | null>(null);

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
          // 時支の時刻基準。"solar" 以外は標準時に倒す。
          if (parsed.zodiac_time_basis === "solar")
            loadedConfig.zodiacTimeBasis = "solar";
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
          /*
            クラウドにも保存するようになった（metaphysical_config、#407）。
            列が無かった頃はここが常に undefined で、端末にしか残らなかった。
          */
          if (apiData.zodiac_time_basis !== undefined)
            loadedConfig.zodiacTimeBasis = normalizeZodiacTimeBasis(
              apiData.zodiac_time_basis,
            );
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

    /*
      API へ送る形。項目名が snake_case になるだけで、値の型は
      MetaphysicalConfig と同じ。新しい型は作らず、そこから引く
      （CLAUDE.md 3 節）。こうしておくと、config 側に項目が増えた
      ときに型のほうがずれを教えてくれる。
    */
    const apiBody: {
      use_classical_board: MetaphysicalConfig["useClassicalBoard"];
      zodiac_time_basis: MetaphysicalConfig["zodiacTimeBasis"];
      physical_month_mode: NonNullable<MetaphysicalConfig["physicalMonthMode"]>;
      direction_filter_mode: MetaphysicalConfig["directionFilterMode"];
      action_intent: MetaphysicalConfig["actionIntent"];
      target_date: MetaphysicalConfig["targetDate"];
      birth_date?: MetaphysicalConfig["birthDate"];
      birth_lat?: MetaphysicalConfig["birthLat"];
      birth_lon?: MetaphysicalConfig["birthLon"];
      base_lat?: MetaphysicalConfig["baseLat"];
      base_lon?: MetaphysicalConfig["baseLon"];
    } = {
      use_classical_board: updatedConfig.useClassicalBoard,
      zodiac_time_basis: updatedConfig.zodiacTimeBasis,
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
        } catch {
          // 壊れていれば無かったことにして、今回の値で作り直す
        }
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

  /*
    座標の下書き（打ちかけを保持して確定時に検証する仕組み）は、
    緯度経度の直接入力を PlaceInput の中に畳んだので不要になった。
    検証は PlaceInput 側が持つ。
  */

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
  };

  const canSavePreset =
    presetName.trim() !== "" &&
    !!config.birthDate &&
    typeof config.baseLat === "number" &&
    typeof config.baseLon === "number";

  const savePresetFromConfig = async () => {
    const name = presetName.trim();
    if (
      !name ||
      !config.birthDate ||
      typeof config.baseLat !== "number" ||
      typeof config.baseLon !== "number"
    )
      return;
    const next: ProfilePreset[] = [
      ...(presets ?? []),
      {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `preset_${Date.now()}`,
        name,
        birthDate: config.birthDate,
        birthLat: config.birthLat ?? config.baseLat,
        birthLon: config.birthLon ?? config.baseLon,
        baseLat: config.baseLat,
        baseLon: config.baseLon,
        createdAt: new Date().toISOString(),
      },
    ];
    setPresets(next);
    setPresetName("");
    const result = await saveProfilePresets(next, fetch, localStorage);
    // 足す・上書きだけで他所の分は残る。返ってきた最新で差し替える
    setPresets(result.presets);
    setPresetNote(
      result.cloudSynced
        ? `「${name}」を保存しました（他の端末でも呼び出せます）`
        : `「${name}」をこの端末に保存しました（他の端末で使うにはログイン）`,
    );
  };

  /**
   * いま端末がいる場所を現在地にする。以前は「デバイスの GPS を取得」
   * という別の場所にしかなく、座標欄からは辿れなかった。
   */
  const useCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        saveConfig({
          ...config,
          baseLat: Number(pos.coords.latitude.toFixed(6)),
          baseLon: Number(pos.coords.longitude.toFixed(6)),
        }),
      () => {
        /* 断られても画面は止めない。地名でも入れられる */
      },
      { timeout: 10000 },
    );
  };

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
              <span className="text-stone-600 font-bold uppercase tracking-wider">
                目標日:
              </span>
              <span className="text-stone-900 font-bold">
                {config.targetDate}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-600 font-bold uppercase tracking-wider">
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
              <span className="text-stone-600 font-bold uppercase tracking-wider">
                フィルタ:
              </span>
              <span className="text-stone-600 font-semibold">
                {getFilterLabel(config.directionFilterMode).split(" ")[0]}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-600 font-bold uppercase tracking-wider">
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
              <span className="text-stone-600 font-bold uppercase tracking-wider">
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
            <span className="text-[10px] text-stone-600 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
              Syncing...
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-stone-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-600" />
          )}
        </div>
      </div>

      {/* 2. Expanded Options (Accordion Settings Panel) */}
      {isExpanded && (
        <div className="border-t border-stone-200 bg-white/80 p-5 space-y-5 animate-slideDown">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {/* Target Date */}
            <div className="min-w-0 space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-600 tracking-wider flex items-center gap-1">
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
            <div className="min-w-0 space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-600 tracking-wider flex items-center gap-1">
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
                      : "text-stone-600 hover:text-stone-800"
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
                      : "text-stone-600 hover:text-stone-800"
                  }`}
                >
                  木星黄経 (物理)
                </button>
              </div>

              {/* Sub-option for Physical Month Star Calculation */}
              {!config.useClassicalBoard && (
                <div className="pt-1 space-y-1">
                  <span className="text-[9px] text-stone-600 block">
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
                          : "bg-transparent text-stone-600 hover:text-stone-800"
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
                          : "bg-transparent text-stone-600 hover:text-stone-800"
                      }`}
                      title="伝統連動型: 木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。"
                    >
                      伝統連動
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 時支の時刻基準 */}
            <div className="min-w-0 space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-600 tracking-wider flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" /> 時支の時刻
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-xl border border-stone-200">
                <button
                  type="button"
                  onClick={() =>
                    saveConfig({ ...config, zodiacTimeBasis: "standard" })
                  }
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    config.zodiacTimeBasis !== "solar"
                      ? "bg-indigo-500/20 text-indigo-600 border border-indigo-200"
                      : "text-stone-600 hover:text-stone-800"
                  }`}
                  title="標準時: 日本標準時（東経135度）の時計時刻で時支を決めます。出発地に関わらず全国同じ答えになります。"
                >
                  標準時
                </button>
                <button
                  type="button"
                  onClick={() =>
                    saveConfig({ ...config, zodiacTimeBasis: "solar" })
                  }
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    config.zodiacTimeBasis === "solar"
                      ? "bg-amber-500/20 text-amber-600 border border-amber-200"
                      : "text-stone-600 hover:text-stone-800"
                  }`}
                  title="真太陽時: 出発地の経度と均時差で時刻を補正してから時支を決めます。那覇と根室では最大71分ずれます。"
                >
                  真太陽時
                </button>
              </div>
              <p className="text-[9px] text-stone-600 leading-relaxed">
                {config.zodiacTimeBasis === "solar"
                  ? "出発地の経度で時刻を補正します。時支と、真夜中付近では日支も変わります。年盤・月盤は変わりません。"
                  : "全国一律で日本標準時（東経135度）を使います。"}
              </p>
            </div>

            {/* Direction Filter Mode */}
            <div className="space-y-2 col-span-1 sm:col-span-2">
              <label className="text-[10px] uppercase font-bold text-stone-600 tracking-wider flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-600" />{" "}
                吉凶方位フィルター
              </label>
              {/* 3 つの層（本命星・環境方位・天中殺）の組み合わせ。
                  以前は 4 つが排他で、本命星と環境方位を一緒に見る手段が
                  無かった（利用者の報告）。並びは「単独 → 組み合わせ」。 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-white rounded-xl border border-stone-200">
                {DIRECTION_FILTER_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFilterChange(mode)}
                    title={FILTER_LABELS[mode]}
                    className={`py-1.5 rounded-lg text-[9px] font-bold transition-all border ${
                      config.directionFilterMode === mode
                        ? "bg-stone-100 text-stone-900 border-stone-300 shadow-sm"
                        : "bg-transparent text-stone-600 border-transparent hover:text-stone-800"
                    }`}
                  >
                    {FILTER_SHORT_LABELS[mode]}
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
              <label className="text-[10px] uppercase font-bold text-stone-600 tracking-wider flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-600" />
                プロフィール（全ページ共通・判定の基準）
              </label>
              {/* 保存済みプロフィールの呼び出し。ホームで保存したもの
                  （本人・家族など）をどのページからでも切り替えられる。
                  選ぶと生年月日と座標が入れ替わり、判定が引き直される */}
              <div className="flex flex-wrap items-center gap-1.5">
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
                {/* いまの設定を名前を付けて保存する。生年月日と現在地が
                    入っているときだけ押せる（空のプロフィールを作らない） */}
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSavePreset) {
                      e.preventDefault();
                      void savePresetFromConfig();
                    }
                  }}
                  placeholder="名前を付けて保存（本人・家族など）"
                  aria-label="保存するプロフィールの名前"
                  className="w-44 px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-[10px] text-stone-700 outline-none focus:border-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => void savePresetFromConfig()}
                  disabled={!canSavePreset}
                  title={
                    canSavePreset
                      ? "いまの生年月日・出生地・現在地を保存済みプロフィールに足す"
                      : "名前と、生年月日・現在地が要ります"
                  }
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </div>
            {presetNote && (
              <p className="text-[10px] text-emerald-700">{presetNote}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <span className="text-[9px] text-stone-600 block">
                  {PROFILE_FIELDS.birthDate.label}
                </span>
                {/*
                  以前は type="date" で、値も slice(0, 10) で日付だけに
                  切っていた。ホームの入力欄は datetime-local で出生時間まで
                  受けるので、**この欄を一度触ると出生時間が消えていた。**
                  時間は四柱推命や太陽時の計算に効くので、同じ形で受ける。
                */}
                <input
                  type="datetime-local"
                  value={config.birthDate ?? ""}
                  onChange={(e) => {
                    // 空は「消した」ではなく入力途中。保存しない。
                    if (e.target.value)
                      saveConfig({ ...config, birthDate: e.target.value });
                  }}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-stone-700 focus:outline-none focus:border-indigo-200 transition-colors shadow-inner"
                />
              </div>
              {/*
                以前は緯度経度をそのまま 4 つ並べていた。14 桁の数字は
                人が読み書きする値ではなく、とくに出生地は自分の座標を
                知っている人のほうが少ない。地名・郵便番号で入れられる
                ようにして、緯度経度は畳んだ（利用者の要望）。
              */}
              <PlaceInput
                label={PROFILE_FIELDS.base.label}
                lat={config.baseLat ?? null}
                lon={config.baseLon ?? null}
                onChange={(lat, lon) =>
                  saveConfig({ ...config, baseLat: lat, baseLon: lon })
                }
                help={PROFILE_FIELDS.base.help}
                onUseCurrentLocation={useCurrentLocation}
              />
              <PlaceInput
                label={PROFILE_FIELDS.birthPlace.label}
                optional
                lat={config.birthLat ?? null}
                lon={config.birthLon ?? null}
                onChange={(lat, lon) =>
                  saveConfig({ ...config, birthLat: lat, birthLon: lon })
                }
                help={PROFILE_FIELDS.birthPlace.help}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-stone-200">
            {/* Action Intent Weighting */}
            <div className="min-w-0 space-y-2">
              <label className="text-[10px] uppercase font-bold text-stone-600 tracking-wider flex items-center gap-1">
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
                          : "bg-transparent text-stone-600 border-transparent hover:text-stone-800"
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
            <div className="p-3 bg-white/70 rounded-xl border border-stone-200 flex items-start gap-2.5 text-[10px] text-stone-600 leading-normal">
              <Info className="w-4 h-4 text-stone-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-500 block mb-0.5">
                  フィルター/目的の効果説明
                </span>
                {FILTER_EXPLANATIONS[config.directionFilterMode]}
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

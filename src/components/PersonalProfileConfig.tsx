"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  MapPin,
  CalendarClock,
  Crosshair,
  Fingerprint,
  Save,
  Plus,
  Trash2,
  FolderOpen,
  UserCheck,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { getProfileStorageMode } from "@/lib/profilePresentation";

const LocationPickerInner = dynamic(() => import("./LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-stone-50 border border-stone-200 flex items-center justify-center font-mono text-xs text-stone-400">
      [ INITIALIZING MAP INTERFACE... ]
    </div>
  ),
});

interface PersonalProfileProps {
  birthDate: string;
  setBirthDate: (v: string) => void;
  birthLat: number;
  setBirthLat: (v: number) => void;
  birthLon: number;
  setBirthLon: (v: number) => void;
  baseLat: number;
  setBaseLat: (v: number) => void;
  baseLon: number;
  setBaseLon: (v: number) => void;
  onSave?: () => void;
  isSaving?: boolean;
  onLoad?: () => void;
  onGetGPS?: () => void;
  voidZodiacOverride?: string;
  setVoidZodiacOverride?: (v: string) => void;
  geminiKey?: string;
  setGeminiKey?: (v: string) => void;
  baselineHrvMean?: number;
  setBaselineHrvMean?: (v: number) => void;
  baselineHrvStd?: number;
  setBaselineHrvStd?: (v: number) => void;
  baselineGsrMean?: number;
  setBaselineGsrMean?: (v: number) => void;
  baselineGsrStd?: number;
  setBaselineGsrStd?: (v: number) => void;
  baseSyncTimestamp?: string | null;
  setBaseSyncTimestamp?: (v: string | null) => void;
  // --- Timing Optimizer Preferences ---
  usePsychologyScorer?: boolean;
  setUsePsychologyScorer?: (v: boolean) => void;
  useKigakuScorer?: boolean;
  setUseKigakuScorer?: (v: boolean) => void;
  useAstrologyScorer?: boolean;
  setUseAstrologyScorer?: (v: boolean) => void;
  // --- Derived Metrics (Read-only feedback) ---
  derivedHonmeiStar?: {
    physical: number | string;
    classical: number | string;
  } | null;
  derivedPersonalVoid?: string[];
}

export function PersonalProfileConfig({
  birthDate,
  setBirthDate,
  birthLat,
  setBirthLat,
  birthLon,
  setBirthLon,
  baseLat,
  setBaseLat,
  baseLon,
  setBaseLon,
  onSave,
  isSaving,
  onLoad,
  onGetGPS,
  voidZodiacOverride,
  setVoidZodiacOverride,
  geminiKey,
  setGeminiKey,
  baselineHrvMean,
  setBaselineHrvMean,
  baselineHrvStd,
  setBaselineHrvStd,
  baselineGsrMean,
  setBaselineGsrMean,
  baselineGsrStd,
  setBaselineGsrStd,
  baseSyncTimestamp,
  setBaseSyncTimestamp,
  usePsychologyScorer,
  setUsePsychologyScorer,
  useKigakuScorer,
  setUseKigakuScorer,
  useAstrologyScorer,
  setUseAstrologyScorer,
  derivedHonmeiStar,
  derivedPersonalVoid,
}: PersonalProfileProps) {
  const [showBirthMapPicker, setShowBirthMapPicker] = useState(false);
  const [showBaseMapPicker, setShowBaseMapPicker] = useState(false);

  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [presetCloudSynced, setPresetCloudSynced] = useState<boolean | null>(
    null,
  );
  // トップページは保護対象外なので未ログインでも開ける。その状態では
  // クラウドのプリセットが 401 で読めず「登録が無い」ように見えるため、
  // 通信エラーと区別してログインを促す。
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const loadPresets = async () => {
      if (typeof window === "undefined") return;
      const result = await loadProfilePresets(fetch, window.localStorage);
      setPresets(result.presets);
      setPresetCloudSynced(result.cloudSynced);
      setNeedsLogin(result.reason === "unauthenticated");
    };

    void loadPresets();
  }, []);

  const savePresetsToStorage = async (newPresets: ProfilePreset[]) => {
    setPresets(newPresets);
    if (typeof window === "undefined") return false;

    const result = await saveProfilePresets(
      newPresets,
      fetch,
      window.localStorage,
    );
    setPresetCloudSynced(result.cloudSynced);
    setNeedsLogin(result.reason === "unauthenticated");
    return result.cloudSynced;
  };

  const handleSaveNewPreset = async () => {
    const name = newPresetName.trim() || `プロファイル ${presets.length + 1}`;
    const newPreset: ProfilePreset = {
      id: `preset_${Date.now()}`,
      name,
      birthDate,
      birthLat,
      birthLon,
      baseLat,
      baseLon,
      voidZodiacOverride,
      geminiKey,
      baselineHrvMean,
      baselineHrvStd,
      baselineGsrMean,
      baselineGsrStd,
      usePsychologyScorer,
      useKigakuScorer,
      useAstrologyScorer,
      createdAt: new Date().toISOString(),
    };
    const updated = [...presets, newPreset];
    const cloudSynced = await savePresetsToStorage(updated);
    setSelectedPresetId(newPreset.id);
    setNewPresetName("");
    if (onSave) onSave();
    alert(
      cloudSynced
        ? `プリセット「${name}」をクラウドへ保存しました。`
        : `プリセット「${name}」をこの端末に保存しました。クラウド同期にはログインが必要です。`,
    );
  };

  const handleUpdateSelectedPreset = async () => {
    if (!selectedPresetId) return;
    const target = presets.find((p) => p.id === selectedPresetId);
    const updatedName = newPresetName.trim() || target?.name || "プロファイル";
    const updated = presets.map((p) => {
      if (p.id === selectedPresetId) {
        return {
          ...p,
          name: updatedName,
          birthDate,
          birthLat,
          birthLon,
          baseLat,
          baseLon,
          voidZodiacOverride,
          geminiKey,
          baselineHrvMean,
          baselineHrvStd,
          baselineGsrMean,
          baselineGsrStd,
          usePsychologyScorer,
          useKigakuScorer,
          useAstrologyScorer,
        };
      }
      return p;
    });
    const cloudSynced = await savePresetsToStorage(updated);
    if (onSave) onSave();
    alert(
      cloudSynced
        ? `プリセット「${updatedName}」をクラウドで更新しました。`
        : `プリセット「${updatedName}」をこの端末で更新しました。クラウド同期にはログインが必要です。`,
    );
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return;
    const target = presets.find((p) => p.id === selectedPresetId);
    if (
      !confirm(`プリセット「${target?.name}」を削除してもよろしいですか？`)
    )
      return;
    const updated = presets.filter((p) => p.id !== selectedPresetId);
    await savePresetsToStorage(updated);
    setSelectedPresetId("");
    setNewPresetName("");
  };

  const handleLoadPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      if (preset.birthDate) setBirthDate(preset.birthDate);
      if (preset.birthLat !== undefined) setBirthLat(Number(preset.birthLat));
      if (preset.birthLon !== undefined) setBirthLon(Number(preset.birthLon));
      if (preset.baseLat !== undefined) setBaseLat(Number(preset.baseLat));
      if (preset.baseLon !== undefined) setBaseLon(Number(preset.baseLon));
      if (preset.voidZodiacOverride !== undefined && setVoidZodiacOverride) {
        setVoidZodiacOverride(preset.voidZodiacOverride);
      }
      if (preset.geminiKey !== undefined && setGeminiKey) {
        setGeminiKey(preset.geminiKey);
      }
      if (preset.baselineHrvMean !== undefined && setBaselineHrvMean) {
        setBaselineHrvMean(preset.baselineHrvMean);
      }
      if (preset.baselineHrvStd !== undefined && setBaselineHrvStd) {
        setBaselineHrvStd(preset.baselineHrvStd);
      }
      if (preset.baselineGsrMean !== undefined && setBaselineGsrMean) {
        setBaselineGsrMean(preset.baselineGsrMean);
      }
      if (preset.usePsychologyScorer !== undefined && setUsePsychologyScorer) {
        setUsePsychologyScorer(preset.usePsychologyScorer);
      }
      if (preset.useKigakuScorer !== undefined && setUseKigakuScorer) {
        setUseKigakuScorer(preset.useKigakuScorer);
      }
      if (preset.useAstrologyScorer !== undefined && setUseAstrologyScorer) {
        setUseAstrologyScorer(preset.useAstrologyScorer);
      }
      setNewPresetName(preset.name);
    }
  };

  // 右上の表示とプリセット欄のバッジは同じ状態を指す。文言が割れないよう 1 か所から。
  const storageMode = getProfileStorageMode(presetCloudSynced, needsLogin);

  return (
    <div className="w-full max-w-4xl mt-4 bg-white/80 border border-stone-200 p-4 rounded-sm shadow-2xl md:backdrop-blur-md relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <Database size={120} className="text-stone-400" />
      </div>

      <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-stone-200 pb-2 justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-blue-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-stone-500">
            初期設定・ベース同期座標
          </h2>
        </div>
        <div className="flex items-center">
          <span
            className={`text-[9px] font-mono tracking-widest flex items-center gap-1 ${
              storageMode.tone === "synced"
                ? "text-emerald-500"
                : storageMode.tone === "local"
                  ? "text-amber-600"
                  : "text-stone-500"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                storageMode.tone === "synced"
                  ? "bg-emerald-500 md:animate-pulse"
                  : storageMode.tone === "local"
                    ? "bg-amber-500"
                    : "bg-stone-400"
              }`}
            ></span>
            {storageMode.label}
          </span>
        </div>
      </div>

      {/* Profile Presets Manager Card */}
      <div className="mb-6 p-3 bg-white/80 border border-purple-200 rounded-sm relative z-10 font-mono text-xs">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <UserCheck size={14} className="text-purple-600" />
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">
              保存済みプロフィールの呼び出し・マルチ管理
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[9px] border px-2 py-0.5 rounded-xs ${
                storageMode.tone === "synced"
                  ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                  : storageMode.tone === "local"
                    ? "text-amber-700 bg-amber-50 border-amber-200"
                    : "text-stone-500 bg-stone-50 border-stone-200"
              }`}
            >
              {storageMode.label}
            </span>
            {selectedPresetId && (
              <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-xs">
                選択中: {presets.find((p) => p.id === selectedPresetId)?.name}
              </span>
            )}
          </div>
        </div>

        {/* 9px のバッジだけでは気付けない。空リストの理由をその場に書く。 */}
        {needsLogin && (
          <div className="mb-2 flex items-center gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            <span>
              未ログインのため、保存済みプロフィールを読み込めていません。
              ここでの保存はこの端末だけに残ります。
            </span>
            <a
              href="/login"
              className="shrink-0 rounded-xs border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
            >
              ログイン
            </a>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-2 items-center">
          {/* Preset Dropdown */}
          <div className="flex-1 w-full">
            <select
              aria-label="保存済みプロフィールの選択"
              value={selectedPresetId}
              onChange={(e) => handleLoadPreset(e.target.value)}
              className="w-full bg-stone-50 border border-purple-200 text-purple-600 px-3 py-1.5 rounded-sm outline-none focus:border-purple-400 text-xs font-mono"
            >
              <option value="">-- 保存済みプロフィールを選択 --</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({new Date(p.createdAt).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {/* Preset Name Input */}
          <div className="w-full md:w-48">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="プロフィール名を入力..."
              className="w-full bg-stone-50 border border-stone-300 text-stone-700 px-3 py-1.5 rounded-sm outline-none focus:border-purple-400 text-xs font-mono"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 w-full md:w-auto shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleSaveNewPreset}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-sm bg-purple-600 hover:bg-purple-500 text-stone-900 text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer"
              title="現在の設定を新規プロフィールとして追加保存"
            >
              <Plus size={12} />
              新規保存
            </button>
            {selectedPresetId && (
              <>
                <button
                  onClick={handleUpdateSelectedPreset}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-stone-900 text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer"
                  title="選択中プロフィールの内容を上書き更新"
                >
                  <Save size={12} />
                  更新
                </button>
                <button
                  onClick={handleDeletePreset}
                  className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-sm bg-rose-50 hover:bg-rose-900 border border-rose-200 text-rose-600 text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer"
                  title="選択中のプロフィールを削除"
                >
                  <Trash2 size={12} />
                  削除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10 font-mono text-xs">
        {/* Factory Settings (Birth) */}
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 mb-2 border-b border-stone-200 pb-1">
            <CalendarClock size={12} className="text-stone-400" />
            <span className="text-[9px] text-stone-500 tracking-wider">
              ハードウェア初期値 (生年月日・出生地)
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="profile-birth"
              className="text-[8px] text-stone-400 uppercase"
            >
              生年月日・出生時間 (Birth Timestamp)
            </label>
            <input
              id="profile-birth"
              type="datetime-local"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full"
            />
            <span className="text-[7px] text-stone-400 mt-0.5 text-justify">
              自律神経の初期ベースライン（本命星システム）を設定。
            </span>
          </div>

          {/* Derived Identity Summary Box */}
          <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-sm mt-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Fingerprint size={12} className="text-blue-600" />
              <span className="text-[8px] text-blue-600 font-bold uppercase tracking-widest">
                算出された特性 (Derived Identity)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-[7px] text-stone-400 uppercase block mb-0.5">
                  Honmei Star (Physical)
                </span>
                <span className="text-sm text-emerald-600 font-bold">
                  {derivedHonmeiStar?.physical || "---"}
                </span>
              </div>
              <div>
                <span className="text-[7px] text-stone-400 uppercase block mb-0.5">
                  Honmei Star (Classical)
                </span>
                <span className="text-sm text-stone-500 font-bold">
                  {derivedHonmeiStar?.classical || "---"}
                </span>
              </div>
              <div className="col-span-2 border-t border-blue-200 pt-1 mt-1">
                <span className="text-[7px] text-stone-400 uppercase block mb-0.5">
                  Void Zodiac (天中殺)
                </span>
                <span className="text-xs text-red-600 font-bold tracking-widest">
                  {derivedPersonalVoid?.join("・") || "---"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-2">
            <label
              htmlFor="profile-void"
              className="text-[8px] text-stone-400 uppercase"
            >
              Void Zodiac (天中殺) Override
            </label>
            <select
              id="profile-void"
              value={voidZodiacOverride || ""}
              onChange={(e) => setVoidZodiacOverride?.(e.target.value)}
              className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full uppercase"
            >
              <option value="">生年月日から自動計算</option>
              <option value="戌亥">戌亥 (Inui)</option>
              <option value="申酉">申酉 (Sarutori)</option>
              <option value="午未">午未 (Umapi)</option>
              <option value="辰巳">辰巳 (Tatsumi)</option>
              <option value="寅卯">寅卯 (Torau)</option>
              <option value="子丑">子丑 (Neushi)</option>
            </select>
            <span className="text-[7px] text-stone-400 mt-0.5 text-justify">
              独自の流派や自覚に基づく天中殺の上書き。
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center justify-between">
              <label className="text-[8px] text-stone-400 uppercase">
                出生地座標 (緯度・経度)
              </label>
              <button
                onClick={() => setShowBirthMapPicker(!showBirthMapPicker)}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showBirthMapPicker ? "bg-blue-500/20 text-blue-600 border-blue-200" : "bg-stone-100 text-stone-500 border-stone-300 hover:bg-stone-200"}`}
              >
                {showBirthMapPicker ? "[ 地図を閉じる ]" : "[ 地図検索 ]"}
              </button>
            </div>
            {showBirthMapPicker && (
              <div className="w-full h-48 sm:h-64 mt-1 mb-1 animate-fade-in z-20 border border-stone-300 rounded overflow-hidden">
                <LocationPickerInner
                  initialLat={birthLat || 35.6895}
                  initialLon={birthLon || 139.6917}
                  onSelect={(newLat: number, newLon: number) => {
                    setBirthLat(Number(newLat.toFixed(5)));
                    setBirthLon(Number(newLon.toFixed(5)));
                  }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input
                type="number"
                step="0.000001"
                value={birthLat}
                onChange={(e) => setBirthLat(Number(e.target.value))}
                className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full uppercase text-center"
                placeholder="Lat"
              />
              <input
                type="number"
                step="0.000001"
                value={birthLon}
                onChange={(e) => setBirthLon(Number(e.target.value))}
                className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full uppercase text-center"
                placeholder="Lon"
              />
            </div>
            <div className="col-span-2 text-[7px] text-stone-400 mt-0.5 text-justify">
              生まれた瞬間の磁場（磁束密度と伏角）がハードの防御力係数を決定。
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-2">
            <label className="text-[8px] text-stone-400 uppercase flex items-center justify-between">
              <span>Gemini API Key (Expert Council)</span>
              <span className="text-[7px] text-stone-400">
                ※ 暗号化されてDBに保存されます
              </span>
            </label>
            <input
              type="password"
              value={geminiKey || ""}
              onChange={(e) => setGeminiKey?.(e.target.value)}
              placeholder="AI_..."
              className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full font-mono text-[10px]"
            />
            <span className="text-[7px] text-stone-400 mt-0.5 text-justify">
              Knowledge Baseとは異なり、こちらは高度推論用のため gemini-2.5-pro
              が指定されています。
            </span>
          </div>
        </div>

        {/* Current Anchor (Base) */}
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 mb-2 border-b border-stone-200 pb-1">
            <Crosshair size={12} className="text-stone-400" />
            <span className="text-[9px] text-stone-500 tracking-wider">
              現在の居住地 (基準座標・±0V基準)
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-2">
            <div className="flex items-center justify-between">
              <label className="text-[8px] text-stone-400 uppercase">
                現在地の座標 (緯度・経度)
              </label>
              <button
                onClick={() => setShowBaseMapPicker(!showBaseMapPicker)}
                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showBaseMapPicker ? "bg-emerald-500/20 text-emerald-600 border-emerald-200" : "bg-stone-100 text-stone-500 border-stone-300 hover:bg-stone-200"}`}
              >
                {showBaseMapPicker ? "[ 地図を閉じる ]" : "[ 地図検索 ]"}
              </button>
            </div>
            {showBaseMapPicker && (
              <div className="w-full h-48 sm:h-64 mt-1 mb-1 animate-fade-in z-20 border border-stone-300 rounded overflow-hidden">
                <LocationPickerInner
                  initialLat={baseLat || 35.6895}
                  initialLon={baseLon || 139.6917}
                  onSelect={(newLat: number, newLon: number) => {
                    setBaseLat(Number(newLat.toFixed(5)));
                    setBaseLon(Number(newLon.toFixed(5)));
                  }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <input
                type="number"
                step="0.000001"
                value={baseLat}
                onChange={(e) => setBaseLat(Number(e.target.value))}
                className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-emerald-500 transition-colors w-full uppercase text-center"
                placeholder="Lat"
              />
              <input
                type="number"
                step="0.000001"
                value={baseLon}
                onChange={(e) => setBaseLon(Number(e.target.value))}
                className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-emerald-500 transition-colors w-full uppercase text-center"
                placeholder="Lon"
              />
            </div>
            <div className="col-span-2 text-[7px] text-stone-400 mt-0.5 text-justify">
              現在の自律神経が同調（順化）している絶対的な磁気ゼロポイント。電位差（ダメージ/回復）の方位ベクトル計算の起点。
            </div>
          </div>

          <div className="mt-4 p-2 bg-blue-50 border border-blue-200 rounded-sm">
            <div className="flex gap-2 items-start">
              <MapPin size={10} className="text-blue-600 mt-0.5 min-w-[10px]" />
              <p className="text-[8px] text-blue-200/70 leading-relaxed text-justify">
                現在位置のGPS（{baseLat.toFixed(2)}, {baseLon.toFixed(2)}
                ）を基準に、タクティカルマップの磁気偏角とベクトルがリアルタイム生成されています。
              </p>
            </div>
          </div>

          {/* Bio-Baseline Configuration */}
          <div className="mt-4 pt-4 border-t border-stone-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-stone-500 tracking-wider font-bold">
                生体情報ベースライン (Z-Score)
              </span>
              <span className="text-[7px] text-emerald-500">
                {baseSyncTimestamp
                  ? `Sync: ${new Date(baseSyncTimestamp).toLocaleDateString()}`
                  : "Not Synced"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bio-hrv-mean"
                  className="text-[8px] text-stone-400 uppercase"
                >
                  HRV 平均 (ms)
                </label>
                <input
                  id="bio-hrv-mean"
                  type="number"
                  step="0.1"
                  value={baselineHrvMean ?? ""}
                  onChange={(e) => setBaselineHrvMean?.(Number(e.target.value))}
                  className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bio-hrv-std"
                  className="text-[8px] text-stone-400 uppercase"
                >
                  HRV 標準偏差
                </label>
                <input
                  id="bio-hrv-std"
                  type="number"
                  step="0.1"
                  value={baselineHrvStd ?? ""}
                  onChange={(e) => setBaselineHrvStd?.(Number(e.target.value))}
                  className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bio-gsr-mean"
                  className="text-[8px] text-stone-400 uppercase"
                >
                  GSR 平均 (μS)
                </label>
                <input
                  id="bio-gsr-mean"
                  type="number"
                  step="0.1"
                  value={baselineGsrMean ?? ""}
                  onChange={(e) => setBaselineGsrMean?.(Number(e.target.value))}
                  className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="bio-gsr-std"
                  className="text-[8px] text-stone-400 uppercase"
                >
                  GSR 標準偏差
                </label>
                <input
                  id="bio-gsr-std"
                  type="number"
                  step="0.1"
                  value={baselineGsrStd ?? ""}
                  onChange={(e) => setBaselineGsrStd?.(Number(e.target.value))}
                  className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                />
              </div>
            </div>
            <p className="text-[7px] text-stone-400 mt-1 text-justify">
              直近1ヶ月のHRV（心拍変動）とGSR（皮膚電気反応）の平均値・標準偏差を入力すると、ANS
              LoadのZ-Score異常検知がパーソナライズされます。
            </p>
          </div>

          {/* Timing Optimizer Engine Configuration */}
          <div className="mt-4 pt-4 border-t border-stone-200">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[9px] text-purple-600 tracking-wider font-bold uppercase">
                Multi-Dimensional Timing Engine
              </span>
            </div>

            <div className="flex flex-col gap-3 mt-3">
              {/* 心理学スコアラー */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[8px] text-stone-500 font-bold uppercase">
                    Behavioral Psychology (Fresh Start)
                  </span>
                  <span className="text-[7px] text-stone-400">
                    月初や月曜、誕生日などのモチベーションブーストを加味します
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={usePsychologyScorer ?? true}
                    onChange={(e) => setUsePsychologyScorer?.(e.target.checked)}
                  />
                  <div className="w-7 h-4 bg-stone-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* 気学スコアラー */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[8px] text-stone-500 font-bold uppercase">
                    Oriental Astrology (Kigaku)
                  </span>
                  <span className="text-[7px] text-stone-400">
                    東洋気学の五行（相生・相剋）と本命星からエネルギーの吉凶を判定します
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={useKigakuScorer ?? true}
                    onChange={(e) => setUseKigakuScorer?.(e.target.checked)}
                  />
                  <div className="w-7 h-4 bg-stone-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* 西洋占星術スコアラー */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[8px] text-stone-500 font-bold uppercase">
                    Western Astrology (Transits & Void)
                  </span>
                  <span className="text-[7px] text-stone-400">
                    月星座やボイドタイムによる警告と適性を判定します
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={useAstrologyScorer ?? true}
                    onChange={(e) => setUseAstrologyScorer?.(e.target.checked)}
                  />
                  <div className="w-7 h-4 bg-stone-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 pt-4 flex justify-between gap-2 border-t border-stone-200 mt-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onGetGPS}
              className="px-4 py-2 rounded-sm font-mono text-[10px] uppercase border border-emerald-200 text-emerald-600 hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              [ デバイスのGPSを取得 ]
            </button>
            <button
              onClick={onLoad}
              className="px-4 py-2 rounded-sm font-mono text-[10px] uppercase border border-purple-200 text-purple-600 hover:bg-purple-500/10 transition-colors cursor-pointer"
            >
              [ 画面設定を再読込 ]
            </button>
            {presets.length > 0 && (
              <select
                value={selectedPresetId}
                className="bg-white border border-purple-200 text-purple-600 px-2 py-2 rounded-sm outline-none focus:border-purple-500 transition-colors text-[10px] font-mono cursor-pointer uppercase tracking-wider"
                onChange={(e) => handleLoadPreset(e.target.value)}
              >
                <option value="">[ プリセットを選択... ]</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {/* 保存先を名前で示す。「永久保存」と書いてあったが実体は端末の
              localStorage だけで、別の端末で開くと空になる。何が起きるのか
              分からないまま押させない。 */}
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`px-8 py-2 rounded-sm font-mono text-[10px] uppercase tracking-[0.2em] transition-all relative overflow-hidden group cursor-pointer ${
                isSaving
                  ? "bg-stone-100 text-stone-400 cursor-wait"
                  : "bg-blue-600 hover:bg-blue-500 text-stone-900 shadow-[0_0_15px_rgba(37,99,235,0.3)] active:scale-95"
              }`}
            >
              {isSaving
                ? "[ 保存中... ]"
                : needsLogin
                  ? "[ この端末に保存 ]"
                  : "[ 設定を保存（クラウド同期） ]"}
              <div className="absolute inset-0 bg-stone-200/70 -translate-x-full group-hover:translate-x-full transition-transform duration-500 skew-x-[-20deg]"></div>
            </button>
            <span className="text-[9px] text-stone-400">
              {needsLogin
                ? "この端末にのみ保存されます"
                : "他の端末でも同じ設定が使えます"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

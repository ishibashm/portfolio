"use client";

import React, { useState, useEffect } from "react";
import { PROFILE_FIELDS } from "@/lib/profileFields";
import {
  Database,
  MapPin,
  CalendarClock,
  Crosshair,
  Fingerprint,
  Save,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { getProfileStorageMode } from "@/lib/profilePresentation";

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
  /**
   * 詳細設定（天中殺の上書き・判定に使う要素・生体の基準値・API キー）を
   * 畳んでおく。既定は閉じる。初めて開いた人が設定すべきなのは
   * 生年月日と現在地だけで、専門項目が同列に並んでいると、全部
   * 埋めないと使えないように見える（利用者の指摘で画面を整理した）。
   */
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    if (!confirm(`プリセット「${target?.name}」を削除してもよろしいですか？`))
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
    /*
      幅の上限はここでは持たない。以前は max-w-4xl（896px）で、外側を
      1700px にしても効かず、画面の両端に余白が残っていた（利用者の指摘）。
      置かれる側（プロフィールのタブ）が列で幅を決める。
    */
    <div className="w-full h-full mt-4 bg-white/80 border border-stone-200 p-4 rounded-sm shadow-2xl md:backdrop-blur-md relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <Database size={120} className="text-stone-600" />
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
              未ログインのため、保存済みプロフィールを読み込めていません。ここでの保存はこの端末だけに残ります。
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
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-sm bg-purple-600 hover:bg-purple-500 text-white text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer"
              title="現在の設定を新規プロフィールとして追加保存"
            >
              <Plus size={12} />
              新規保存
            </button>
            {selectedPresetId && (
              <>
                <button
                  onClick={handleUpdateSelectedPreset}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer"
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
            <CalendarClock size={12} className="text-stone-600" />
            <span className="text-[9px] text-stone-500 tracking-wider">
              生まれたとき（生年月日・出生地）
            </span>
          </div>

          {/*
            生年月日の入力は頁の上（まずここを入れる）に移した。同じ欄が
            2 か所にあると、どちらが効いているのか分からなくなる。
            ここには**入っている値と、そこから出た結果だけ**を出す。
          */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-stone-600 uppercase">
              {PROFILE_FIELDS.birthDate.label}
            </span>
            <span className="text-sm text-stone-700 font-bold">
              {birthDate || "未設定"}
            </span>
            <span className="text-[9px] text-stone-600 mt-0.5 text-justify">
              {
                "変えるときは頁の上の「まずここを入れる」から。本命星と天中殺はここから決まります。"
              }
            </span>
          </div>

          {/* Derived Identity Summary Box */}
          <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-sm mt-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Fingerprint size={12} className="text-blue-600" />
              <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">
                あなたの星（生年月日から自動算出）
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div>
                <span className="text-[9px] text-stone-600 block mb-0.5">
                  本命星（物理・天体基準）
                </span>
                <span className="text-sm text-emerald-600 font-bold">
                  {derivedHonmeiStar?.physical || "---"}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-stone-600 block mb-0.5">
                  本命星（古典・暦基準）
                </span>
                <span className="text-sm text-stone-500 font-bold">
                  {derivedHonmeiStar?.classical || "---"}
                </span>
              </div>
              <div className="col-span-2 border-t border-blue-200 pt-1 mt-1">
                <span className="text-[9px] text-stone-600 block mb-0.5">
                  天中殺
                </span>
                <span className="text-xs text-red-700 font-bold tracking-widest">
                  {derivedPersonalVoid?.join("・") || "---"}
                </span>
              </div>
            </div>
          </div>

          {/* ここから下は詳細設定。既定では畳む */}
          {showAdvanced && (
            <div className="flex flex-col gap-1 mt-2">
              <label
                htmlFor="profile-void"
                className="text-[10px] text-stone-600 uppercase"
              >
                天中殺の上書き
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
              <span className="text-[9px] text-stone-600 mt-0.5 text-justify">
                流派や自覚が自動算出と違うときだけ使います。通常は自動計算のままで構いません。
              </span>
            </div>
          )}

          {/* 出生地の入力も上へ移した（地名・郵便番号でも入れられる）。 */}
          <div className="flex flex-col gap-1 mt-2">
            <span className="text-[10px] text-stone-600 uppercase">
              出生地座標 (緯度・経度)
            </span>
            <span className="text-xs text-stone-700 font-bold">
              北緯 {birthLat.toFixed(3)} / 東経 {birthLon.toFixed(3)}
            </span>
            <span className="text-[9px] text-stone-600 mt-0.5 text-justify">
              {
                "任意。天体ライン（補助的な判定）に使います。未入力でも方位の吉凶は出ます。変えるときは頁の上から。"
              }
            </span>
          </div>

          {showAdvanced && (
            <div className="flex flex-col gap-1 mt-2">
              <label className="text-[10px] text-stone-600 uppercase flex items-center justify-between">
                <span>Gemini API キー（AI 相談用・任意）</span>
                <span className="text-[9px] text-stone-600">
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
              <span className="text-[9px] text-stone-600 mt-0.5 text-justify">
                AI
                への相談機能を使うときだけ必要です。空のままで他の機能はすべて動きます。
              </span>
            </div>
          )}
        </div>

        {/* Current Anchor (Base) */}
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 mb-2 border-b border-stone-200 pb-1">
            <Crosshair size={12} className="text-stone-600" />
            <span className="text-[9px] text-stone-500 tracking-wider">
              {PROFILE_FIELDS.base.label}
            </span>
          </div>

          {/* 現在地の入力も上へ移した（地名・郵便番号でも入れられる）。 */}
          <div className="flex flex-col gap-1 mt-2">
            <span className="text-[10px] text-stone-600 uppercase">
              現在地の座標 (緯度・経度)
            </span>
            <span className="text-xs text-stone-700 font-bold">
              北緯 {baseLat.toFixed(3)} / 東経 {baseLon.toFixed(3)}
            </span>
            <span className="text-[9px] text-stone-600 mt-0.5 text-justify">
              {PROFILE_FIELDS.base.help}
            </span>
          </div>

          <div className="mt-4 p-2 bg-blue-50 border border-blue-200 rounded-sm">
            <div className="flex gap-2 items-start">
              <MapPin size={10} className="text-blue-600 mt-0.5 min-w-[10px]" />
              <p className="text-[10px] text-stone-600 leading-relaxed text-justify">
                生年月日・現在地・生まれたところは、
                <strong className="text-stone-700">
                  頁の上の「まずここを入れる」
                </strong>
                {
                  "で変えます。地名や郵便番号でも入れられます。ここは算出結果と、普段は触らない設定だけを置いています。"
                }
              </p>
            </div>
          </div>

          {/* Bio-Baseline Configuration（詳細設定） */}
          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-stone-500 tracking-wider font-bold">
                  体調の基準値（HRV・GSR / 任意）
                </span>
                <span className="text-[9px] text-emerald-500">
                  {baseSyncTimestamp
                    ? `Sync: ${new Date(baseSyncTimestamp).toLocaleDateString()}`
                    : "Not Synced"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="bio-hrv-mean"
                    className="text-[10px] text-stone-600 uppercase"
                  >
                    HRV 平均 (ms)
                  </label>
                  <input
                    id="bio-hrv-mean"
                    type="number"
                    step="0.1"
                    value={baselineHrvMean ?? ""}
                    onChange={(e) =>
                      setBaselineHrvMean?.(Number(e.target.value))
                    }
                    className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="bio-hrv-std"
                    className="text-[10px] text-stone-600 uppercase"
                  >
                    HRV 標準偏差
                  </label>
                  <input
                    id="bio-hrv-std"
                    type="number"
                    step="0.1"
                    value={baselineHrvStd ?? ""}
                    onChange={(e) =>
                      setBaselineHrvStd?.(Number(e.target.value))
                    }
                    className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="bio-gsr-mean"
                    className="text-[10px] text-stone-600 uppercase"
                  >
                    GSR 平均 (μS)
                  </label>
                  <input
                    id="bio-gsr-mean"
                    type="number"
                    step="0.1"
                    value={baselineGsrMean ?? ""}
                    onChange={(e) =>
                      setBaselineGsrMean?.(Number(e.target.value))
                    }
                    className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="bio-gsr-std"
                    className="text-[10px] text-stone-600 uppercase"
                  >
                    GSR 標準偏差
                  </label>
                  <input
                    id="bio-gsr-std"
                    type="number"
                    step="0.1"
                    value={baselineGsrStd ?? ""}
                    onChange={(e) =>
                      setBaselineGsrStd?.(Number(e.target.value))
                    }
                    className="bg-white border border-stone-300 text-stone-600 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full text-center"
                  />
                </div>
              </div>
              <p className="text-[9px] text-stone-600 mt-1 text-justify">
                スマートウォッチ等で測った直近1ヶ月の平均・標準偏差を入れると、体調の異常検知があなた基準になります。無くても動きます。
              </p>
            </div>
          )}

          {/* Timing Optimizer Engine Configuration（詳細設定） */}
          {showAdvanced && (
            <div className="mt-4 pt-4 border-t border-stone-200">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[9px] text-purple-600 tracking-wider font-bold">
                  日取りの判定に使う要素
                </span>
              </div>

              <div className="flex flex-col gap-3 mt-3">
                {/* 心理学スコアラー */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-stone-500 font-bold">
                      行動心理（月初・月曜・誕生日）
                    </span>
                    <span className="text-[9px] text-stone-600">
                      月初や月曜、誕生日などのモチベーションブーストを加味します
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={usePsychologyScorer ?? true}
                      onChange={(e) =>
                        setUsePsychologyScorer?.(e.target.checked)
                      }
                    />
                    <div className="w-7 h-4 bg-stone-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {/* 気学スコアラー */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-stone-500 font-bold">
                      九星気学（五行と本命星）
                    </span>
                    <span className="text-[9px] text-stone-600">
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
                    <span className="text-[10px] text-stone-500 font-bold">
                      西洋占星術（月星座・ボイドタイム）
                    </span>
                    <span className="text-[9px] text-stone-600">
                      月星座やボイドタイムによる警告と適性を判定します
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={useAstrologyScorer ?? true}
                      onChange={(e) =>
                        setUseAstrologyScorer?.(e.target.checked)
                      }
                    />
                    <div className="w-7 h-4 bg-stone-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-400 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 詳細設定の開閉。専門項目（天中殺の上書き・判定に使う要素・
            体調の基準値・API キー）はここを開いたときだけ出す */}
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
            className="w-full px-4 py-2 rounded-sm font-mono text-[10px] border border-stone-300 text-stone-500 hover:bg-stone-100 transition-colors cursor-pointer text-left"
          >
            {showAdvanced
              ? "▲ 詳細設定を閉じる"
              : "▼ 詳細設定（天中殺の上書き・判定に使う要素・体調の基準値・API キー）"}
          </button>
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
                  ? "bg-stone-100 text-stone-600 cursor-wait"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] active:scale-95"
              }`}
            >
              {isSaving
                ? "[ 保存中... ]"
                : needsLogin
                  ? "[ この端末に保存 ]"
                  : "[ 設定を保存（クラウド同期） ]"}
              <div className="absolute inset-0 bg-stone-200/70 -translate-x-full group-hover:translate-x-full transition-transform duration-500 skew-x-[-20deg]"></div>
            </button>
            <span className="text-[9px] text-stone-600">
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

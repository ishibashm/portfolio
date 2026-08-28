"use client";

/**
 * ホームの一番上に置く入力欄。生年月日・現在地・生まれたところの 3 つ。
 *
 * このサイトの答えは、この 3 つが決まった時点でほぼ決まる。それなのに
 * これまでは下のダッシュボードの「1. プロフィール」タブの中にあり、
 * **ホームを開いた人は、まず何も入力していない状態の結果を見ていた**。
 * 利用者の指示で、頁を開いて最初に目に入るところへ出す。
 *
 * 詳しい設定（天中殺の上書き・判定に使う要素・体調の基準値・API キー）は
 * ここには出さない。ここは「これだけ入れれば動く」を担い、残りは
 * プロフィールのタブに置いたままにする。
 *
 * **保存先は既存の 1 か所（lib/userSettings）。**別に持たない。
 * 保存したら `metaphysical-config-updated` を投げ、同じ頁の
 * ダッシュボードと物件検索の設定バーが読み直す。この行事名は
 * MetaphysicalConfigBar が既に使っているものをそのまま使う。
 *
 * 本命星や天中殺の表示はここでは出さない。出すには ephemerisEngine を
 * 読むことになり、タブを分割して減らした初期の読み込みが戻ってしまう
 * （#327〜#334）。算出結果は下のプロフィールのタブが出す。
 */

import React, { useEffect, useState } from "react";
import { PROFILE_FIELDS } from "@/lib/profileFields";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import { readLocalSettings, saveSettings } from "@/lib/userSettings";
import {
  loadProfilePresets,
  saveProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";

/** 東京。設定が無いときに下のダッシュボードが使う値と揃える。 */
const FALLBACK_LAT = 35.6895;
const FALLBACK_LON = 139.6917;

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function QuickProfileBar() {
  const [birthDate, setBirthDate] = useState("");
  const [baseLat, setBaseLat] = useState<number | null>(null);
  const [baseLon, setBaseLon] = useState<number | null>(null);
  const [birthLat, setBirthLat] = useState<number | null>(null);
  const [birthLon, setBirthLon] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<"none" | "local" | "cloud">("none");

  /*
    保存済みプロフィール。家族ぶんや、引越し前後の設定を切り替えるために
    使う。**保存先は既存の 1 か所（lib/profilePresetSync）。**プロフィールの
    タブが使っているものと同じで、別に持たない。
  */
  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");

  // 端末に入っている値を読む。クラウドとの突き合わせは下の
  // ダッシュボードが起動時にやるので、ここでは端末の値だけを見る
  // （読み込みを待たずに欄が出るほうが、入力の入口としては速い）。
  useEffect(() => {
    const s = readLocalSettings();
    if (typeof s.birth_date === "string") setBirthDate(s.birth_date);
    setBaseLat(toNumber(s.base_lat));
    setBaseLon(toNumber(s.base_lon));
    setBirthLat(toNumber(s.birth_lat));
    setBirthLon(toNumber(s.birth_lon));
  }, []);

  useEffect(() => {
    let alive = true;
    loadProfilePresets(fetch, localStorage)
      .then((r) => {
        if (alive) setPresets(r.presets);
      })
      .catch(() => {
        /* 読めなくても入力欄は使える。呼び出しの札が出ないだけ。 */
      });
    return () => {
      alive = false;
    };
  }, []);

  /** いま画面に入っている 3 つを設定として書く。 */
  const persist = async () => {
    const patch: Record<string, unknown> = {};
    if (birthDate) patch.birth_date = birthDate;
    if (baseLat !== null) patch.base_lat = baseLat;
    if (baseLon !== null) patch.base_lon = baseLon;
    if (birthLat !== null) patch.birth_lat = birthLat;
    if (birthLon !== null) patch.birth_lon = birthLon;

    const result = await saveSettings(patch);
    setSaved(result.synced ? "cloud" : "local");
    // 同じ頁のダッシュボードと設定バーに読み直させる。
    window.dispatchEvent(new CustomEvent("metaphysical-config-updated"));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await persist();
    } finally {
      setIsSaving(false);
    }
  };

  /** 保存済みを選ぶ。欄に入れて、そのまま設定にも反映する。 */
  const handlePick = async (id: string) => {
    setSelectedId(id);
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;

    setBirthDate(preset.birthDate);
    setBaseLat(preset.baseLat);
    setBaseLon(preset.baseLon);
    setBirthLat(preset.birthLat);
    setBirthLon(preset.birthLon);

    setIsSaving(true);
    try {
      const result = await saveSettings({
        birth_date: preset.birthDate,
        base_lat: preset.baseLat,
        base_lon: preset.baseLon,
        birth_lat: preset.birthLat,
        birth_lon: preset.birthLon,
      });
      setSaved(result.synced ? "cloud" : "local");
      window.dispatchEvent(new CustomEvent("metaphysical-config-updated"));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * いまの内容を保存済みに足す（名前があれば新規、選択中なら上書き）。
   *
   * 上書きのときは**元のプロフィールの他の項目を残す。**天中殺の上書きや
   * 体調の基準値はプロフィールのタブで入れるもので、ここには出していない。
   * 差し替えると、ここから保存するたびに消えてしまう。
   */
  const handleSavePreset = async () => {
    const name = newName.trim();
    const existing = presets.find((p) => p.id === selectedId);
    if (!name && !existing) return;
    if (baseLat === null || baseLon === null) return;

    const values = {
      birthDate,
      birthLat: birthLat ?? FALLBACK_LAT,
      birthLon: birthLon ?? FALLBACK_LON,
      baseLat,
      baseLon,
    };

    const next: ProfilePreset[] = name
      ? [
          ...presets,
          {
            id:
              typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : String(presets.length + 1),
            name,
            ...values,
            createdAt: new Date().toISOString(),
          },
        ]
      : presets.map((p) => (p.id === selectedId ? { ...p, ...values } : p));

    setIsSaving(true);
    try {
      setPresets(next);
      await saveProfilePresets(next, fetch, localStorage);
      await persist();
      setNewName("");
    } finally {
      setIsSaving(false);
    }
  };

  // 生年月日が空のときだけ案内を出す。入っている人に毎回見せない。
  const needsBirthDate = !birthDate;

  return (
    <section className="w-full max-w-[1700px] bg-white/95 backdrop-blur-xl border border-slate-300 rounded-3xl shadow-lg shadow-slate-200/50 p-6 md:p-8">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-lg font-bold text-slate-900 font-serif">
          まずここを入れる
        </h2>
        {saved !== "none" && (
          <span className="text-[11px] text-emerald-600 shrink-0">
            {saved === "cloud"
              ? "保存しました（他の端末でも使えます）"
              : "この端末に保存しました"}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600 mb-6 leading-relaxed max-w-[70ch]">
        方位も日取りも、この 3
        つから決まります。入れておくと、下のダッシュボードと物件検索・地図・カレンダーが同じ設定で動きます。
      </p>

      {needsBirthDate && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-6 leading-relaxed">
          {
            "生年月日がまだ入っていません。入れるまで、下に出ている吉凶は仮の値（2000-01-01・東京）で計算した結果です。"
          }
        </p>
      )}

      {/*
        保存済みプロフィールの呼び出しと保存。家族ぶんや、引越し前後の
        設定を切り替えるために使う。1 つも無いうちは出さない（初めての人に
        空の選択肢を見せない）。名前の欄はいつでも出しておく。
      */}
      <div className="flex flex-wrap items-end gap-3 mb-6 pb-5 border-b border-slate-200">
        {presets.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700">
              保存済みから選ぶ
            </span>
            <select
              value={selectedId}
              onChange={(e) => handlePick(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 transition-colors"
            >
              <option value="">-- 選択 --</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700">
            {selectedId && !newName ? "選んだものに上書き" : "名前を付けて保存"}
          </span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例: 自分 / 家族"
            className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 transition-colors"
          />
        </label>
        <button
          type="button"
          onClick={handleSavePreset}
          disabled={isSaving || (!newName.trim() && !selectedId)}
          className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-sm font-bold text-slate-700 transition-colors"
        >
          プロフィールに保存
        </button>
        <p className="w-full text-xs text-slate-500 leading-relaxed">
          {
            "ログインしていれば他の端末からも呼び出せます。天中殺の上書きや体調の基準値は「1. プロフィール」タブで入れます（ここから保存しても消えません）。"
          }
        </p>
      </div>

      {/*
        3 つ横並び。1700px の器に 1 列で積むと、入力欄が 1 本だけ横に
        伸びて幅が何も買わない（CLAUDE.md 3 節「器を広げるときは、中の
        並べ方も一緒に見る」）。
      */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="quick-birth-date"
            className="text-sm font-bold text-slate-800"
          >
            {PROFILE_FIELDS.birthDate.label}
          </label>
          <input
            id="quick-birth-date"
            type="datetime-local"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-400 transition-colors"
          />
          <p className="text-xs text-slate-500 leading-relaxed">
            {PROFILE_FIELDS.birthDate.help}
          </p>
        </div>

        <PlaceInput
          variant="form"
          label={PROFILE_FIELDS.base.label}
          lat={baseLat}
          lon={baseLon}
          onChange={(lat, lon) => {
            setBaseLat(lat);
            setBaseLon(lon);
          }}
          help={PROFILE_FIELDS.base.help}
          onUseCurrentLocation={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition((pos) => {
              setBaseLat(pos.coords.latitude);
              setBaseLon(pos.coords.longitude);
            });
          }}
        />

        <PlaceInput
          variant="form"
          label={PROFILE_FIELDS.birthPlace.label}
          lat={birthLat}
          lon={birthLon}
          onChange={(lat, lon) => {
            setBirthLat(lat);
            setBirthLon(lon);
          }}
          optional
          help={PROFILE_FIELDS.birthPlace.help}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 mt-6 pt-5 border-t border-slate-200">
        <span className="text-xs text-slate-500">
          未入力の項目は{" "}
          <span className="font-mono">
            {FALLBACK_LAT} / {FALLBACK_LON}
          </span>{" "}
          （東京）で計算します
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-sm transition-all shadow-md active:scale-95"
        >
          {isSaving ? "保存中..." : "この設定で見る"}
        </button>
      </div>
    </section>
  );
}

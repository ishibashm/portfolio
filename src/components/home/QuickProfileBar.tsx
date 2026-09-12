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
import Link from "next/link";
import { PROFILE_FIELDS } from "@/lib/profileFields";
import { normalizeBirthDateTimeLocal } from "@/utils/japanDate";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import {
  readLocalSettings,
  saveSettings,
  type Settings,
} from "@/lib/userSettings";
import { loadProfilePresets } from "@/lib/profilePresetSync";
import {
  DEFAULT_PROFILE_NAME,
  findActiveProfile,
  upsertActiveProfile,
} from "@/lib/activeProfile";
import { ProfilePicker } from "@/components/profile/ProfilePicker";

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
  /* 控えの呼び出し・名前を付けて保存は ProfilePicker と /profile・/account に
     一本化した（lib/activeProfile）。ここは入力欄だけを持つ。 */

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

  /** いま画面に入っている 3 つを設定として書く。 */
  const persist = async () => {
    const patch: Settings = {};
    if (birthDate) patch.birth_date = birthDate;
    if (baseLat !== null) patch.base_lat = baseLat;
    if (baseLon !== null) patch.base_lon = baseLon;
    if (birthLat !== null) patch.birth_lat = birthLat;
    if (birthLon !== null) patch.birth_lon = birthLon;

    const result = await saveSettings(patch);
    setSaved(result.synced ? "cloud" : "local");
    /* 使用中のプロフィールにも同じ値を入れる（/profile と同じ経路）。
       ここで直した値が一覧の「使用中」と食い違わないように */
    if (birthDate && baseLat !== null && baseLon !== null) {
      const { presets } = await loadProfilePresets(fetch, localStorage);
      const active = findActiveProfile(presets, patch);
      const hasBirthPlace = birthLat !== null && birthLon !== null;
      await upsertActiveProfile(
        {
          id: active?.id,
          name: active?.name ?? DEFAULT_PROFILE_NAME,
          values: {
            birthDate,
            ...(hasBirthPlace ? { birthLat, birthLon } : {}),
            baseLat,
            baseLon,
          },
        },
        fetch,
        localStorage,
      );
    }
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
        {/* 落ち着いて入れたい人の行き先。/profile は同じ値を書くので、
            どちらから入れても結果は同じ（利用者の依頼、2026-09-04） */}
        <Link
          href="/profile"
          className="ml-1 font-semibold text-indigo-600 underline"
        >
          引越し先の候補も含めてまとめて登録する
        </Link>
      </p>

      {needsBirthDate && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-6 leading-relaxed">
          {
            "生年月日がまだ入っていません。入れるまで、下に出ている吉凶は仮の値（2000-01-01・東京）で計算した結果です。"
          }
        </p>
      )}

      {/* 使用中のプロフィールの切り替え。作る・直す・消すは /profile と
          /account（利用者の指摘、2026-09-12。独自の保存 UI をやめた） */}
      <ProfilePicker
        className="mb-6 pb-5 border-b border-slate-200"
        onApplied={(p) => {
          setBirthDate(p.birthDate);
          setBaseLat(p.baseLat);
          setBaseLon(p.baseLon);
          setBirthLat(p.birthLat ?? null);
          setBirthLon(p.birthLon ?? null);
        }}
      />

      {/*
        3 つ横並び。1700px の器に 1 列で積むと、入力欄が 1 本だけ横に
        伸びて幅が何も買わない（CLAUDE.md 3 節「器を広げるときは、中の
        並べ方も一緒に見る」）。
      */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="quick-birth-date"
            className="text-sm font-bold text-slate-800"
          >
            {PROFILE_FIELDS.birthDate.label}
          </label>
          {/*
            保存されている値は**日付だけのことがある。**
            /profile の欄は
            `type="date"` なので "1990-01-02" が入る。`datetime-local` に
            その文字列を渡すと、ブラウザは形の合わない値を**空欄として
            描く**ので、登録済みなのに未入力に見えていた（逆向きの
            食い違いが /profile 側にもあった）。

            欄に出すときだけ正午を補う（`normalizeBirthDateTimeLocal`。
            物件検索の同行者欄と同じ扱い）。**持っている値は書き換えない**
            ので、触らずに保存しても日付だけのまま残る。ここで勝手に
            正午へ寄せると時柱が変わる（判定が動く）。
          */}
          <input
            id="quick-birth-date"
            type="datetime-local"
            value={normalizeBirthDateTimeLocal(birthDate)}
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
          {
            "出生地が未入力のあいだは、天体ライン（太陽・金星・木星）の加点を付けずに判定します"
          }
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

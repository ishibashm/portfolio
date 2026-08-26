"use client";

import { useSyncExternalStore } from "react";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";
import {
  FENG_SHUI_SERVER_SNAPSHOT,
  fengShuiActive,
  fengShuiSnapshot,
  parseSnapshot,
  subscribeFengShui,
  writeFengShuiSettings,
} from "@/lib/fengShuiSettings";
import {
  directionFromBearing,
  type CompassDirection,
} from "@/utils/directionGeo";
import { fengShuiFor, type Sex } from "@/utils/fengShuiEngine";
import { honmeiYearFor } from "@/utils/honmeiYear";

/**
 * その移動の方位を、風水（八宅）でも見る。**併記であって合算ではない。**
 *
 * 九星気学の段階は今までどおり出る。この札はその横に、同じ方位が八宅では
 * どう出るかを足すだけ。点を合わせない理由は `fengShuiEngine` の冒頭に
 * 書いてある——流派が違うものを足すと、どちらの答えでもない数字になる。
 *
 * ## 既定では出さない
 *
 * このサイトは長く「風水は使っていない」と案内してきた。黙って出すと、
 * 前と同じ入力の人に違う画面が出る。利用者が押して開いたときだけ出す。
 * 切り替えと性別は端末にだけ残る（クラウドへ送らない）。
 *
 * ## 方位の切り方が気学と違う
 *
 * 八宅は八卦に 45 度ずつを割り当てる。気学の伝統的な区切りは四隅 60 度・
 * 四正 30 度なので、**同じ方位角でも方位名が変わることがある**（方位角
 * 100 度は気学で南東、八宅では東）。これは食い違いではなく流派の違いなので、
 * 隠さずその場に書く。
 *
 * 落とし込みは `directionFromBearing` を使う。方位角を八方位にする実装は
 * リポジトリ全体でこれ 1 つと決まっている（CLAUDE.md 3 節）。
 */

const SEX_LABELS: Record<Sex, string> = {
  male: "男性",
  female: "女性",
};

export function FengShuiNote({
  bearing,
  birthDate,
  kigakuDirection,
}: {
  /** 出発地から行き先への方位角（度）。 */
  bearing: number;
  /** 生年月日。ISO の文字列。読めなければ何も出さない。 */
  birthDate: string;
  /**
   * 気学側が同じ移動に付けている方位。八宅と食い違ったときに
   * その場で断るために受け取る。渡さなければ断りを出さない。
   */
  kigakuDirection?: string;
}) {
  const stored = parseSnapshot(
    useSyncExternalStore(
      subscribeFengShui,
      fengShuiSnapshot,
      () => FENG_SHUI_SERVER_SNAPSHOT,
    ),
  );

  const birth = new Date(birthDate);
  if (!birthDate || Number.isNaN(birth.getTime())) return null;
  if (!Number.isFinite(bearing)) return null;

  if (!stored.enabled) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-600">
            風水（八宅）でも見る
            <span className="ml-2 text-[10px] text-stone-500">
              既定では判定に使っていません
            </span>
          </p>
          <button
            type="button"
            onClick={() => writeFengShuiSettings({ enabled: true })}
            className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
          >
            併記する
          </button>
        </div>
      </div>
    );
  }

  if (!fengShuiActive(stored)) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white/60 p-3">
        <p className="text-xs text-stone-600">
          八宅は<b>生まれ年と性別</b>
          で本命卦が決まります。性別を選んでください。
          <span className="ml-1 text-[10px] text-stone-500">
            この端末にだけ残り、送信しません。
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => writeFengShuiSettings({ sex: s })}
              className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
            >
              {SEX_LABELS[s]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => writeFengShuiSettings({ enabled: false })}
            className="px-2 py-1.5 text-[11px] text-stone-500 underline"
          >
            やめる
          </button>
        </div>
      </div>
    );
  }

  /* 八宅は八卦に 45 度ずつ。気学の伝統区分とは切り方が違う。 */
  const direction = directionFromBearing(bearing, "physical");
  const reading = fengShuiFor(honmeiYearFor(birth), stored.sex, direction);
  /*
    気学側が付けた方位名。CENTER（中宮）など八方位以外が来ることがあるので、
    表に載っているものだけを断りに使う。載っていなければ黙って出さない。
  */
  const kigakuLabel =
    kigakuDirection && kigakuDirection in DIRECTION_LABELS
      ? DIRECTION_LABELS[kigakuDirection as CompassDirection]
      : null;
  const differs = !!kigakuLabel && kigakuDirection !== direction;

  return (
    <div
      className={`rounded-2xl border p-3 ${
        reading.auspicious
          ? "border-emerald-300 bg-emerald-50/60"
          : "border-rose-300 bg-rose-50/60"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[10px] font-bold text-stone-500">
            風水（八宅）
          </span>
          <span className="text-sm font-bold">
            {DIRECTION_LABELS[direction]}は{reading.youxing}
          </span>
          {/* 色だけで吉凶を出さない。字を必ず添える */}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${
              reading.auspicious ? "bg-emerald-700" : "bg-rose-700"
            }`}
          >
            {reading.auspicious ? "吉" : "凶"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => writeFengShuiSettings({ enabled: false })}
          className="text-[10px] text-stone-500 underline"
        >
          併記をやめる
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-stone-700">
        {reading.meaning}
      </p>

      {differs && (
        <p className="mt-2 text-[10px] leading-relaxed text-stone-600">
          気学ではこの移動を
          <b>{kigakuLabel}</b>
          として扱っています。八宅は八卦に45度ずつ、気学の伝統的な区切りは四隅60度・四正30度と
          <b>切り方が違う</b>
          ため、同じ方位角でも名前が変わります。食い違いではありません。
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-stone-600">
        <b>気学の判定とは足し合わせていません。</b>
        別の流派の見立てを並べているだけです。どちらを重く見るかは決めていません。
      </p>
    </div>
  );
}

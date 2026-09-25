"use client";

/**
 * 「いま、どのプロフィールで判定しているか」を道具の頁に出す札。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-12）
 *
 * 引越し時期の分析や物件検索を開いても、登録したプロフィールが適用されて
 * いるのか画面のどこにも出ていなかった。「このプロフィールでこの時期」
 * 「このプロフィールでこの方位」と分かるように、判定の前提を頁の頭に
 * 1 行で出す。
 *
 * 出すのは名前・生年月日・出発地だけ。判定そのものには触らない。
 * 読む先は全ての道具と同じ設定（`loadSettings`）なので、ここに出ている
 * 値がそのまま判定に使われている。
 *
 * 未設定なら「登録」への導線を出す。空の札を出さない。
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { loadSettings, settingString, settingNumber } from "@/lib/userSettings";
import { loadProfilePresets } from "@/lib/profilePresetSync";
import {
  DEFAULT_PROFILE_NAME,
  applyProfile,
  describeProfile,
  findActiveProfile,
} from "@/lib/activeProfile";
import type { ProfilePreset } from "@/lib/profilePresetSync";
import { isProfileReady } from "@/lib/profileCompletion";
import { describePlace, resolvePlaceName } from "@/lib/placeLabel";

type State =
  | { kind: "loading" }
  | { kind: "none" }
  | {
      kind: "ready";
      line: string;
      inList: boolean;
      /**
       * 使用中のプロフィールと、いま道具が使っている出発地が違うとき。
       * 登録した出発地の地名と、戻すための控え。
       */
      drift: { preset: ProfilePreset; place: string } | null;
    };

/** 出発地の座標が同じか。保存の往復で末尾が動くので幅を持つ。 */
function sameBase(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) < 1e-4;
}

export function ActiveProfileBadge({
  /** 「この設定で〜を出しています」の〜。頁ごとに変える。 */
  purpose,
  className = "",
}: {
  purpose: string;
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      const [{ settings }, { presets }] = await Promise.all([
        loadSettings(),
        loadProfilePresets(fetch, window.localStorage),
      ]);
      if (!alive) return;
      if (!isProfileReady(settings)) {
        setState({ kind: "none" });
        return;
      }
      const active = findActiveProfile(presets, settings);
      const baseLat = settingNumber(settings, "base_lat");
      const baseLon = settingNumber(settings, "base_lon");
      /*
        使用中のプロフィールと、道具が実際に使う出発地（設定）が食い違う
        ことがある（シミュレータの地図が座標だけを書き換えていた。
        利用者の指摘、2026-09-25）。そのときに控えの地名や前の地名を
        出すと、札は京都・判定は名古屋のように**札が嘘をつく。**
        食い違いを見つけたら、地名は座標から引き直して本当の出発地を出し、
        登録した出発地へ戻す口を添える
      */
      const drifted =
        active !== null &&
        active.baseLat !== undefined &&
        active.baseLon !== undefined &&
        !(
          sameBase(active.baseLat, baseLat) && sameBase(active.baseLon, baseLon)
        );
      /* 出発地は地名で出す（利用者の指摘、2026-09-12）。端末の地名 →
         控えの地名 → 最寄りの市区町村「付近」→ 座標 の順 */
      const label = drifted
        ? null
        : settingString(settings, "base_label") || active?.baseLabel || null;
      const municipality =
        label || baseLat === undefined || baseLon === undefined
          ? null
          : await resolvePlaceName(baseLat, baseLon);
      if (!alive) return;
      const line = describeProfile(
        active ?? {
          name: DEFAULT_PROFILE_NAME,
          birthDate: settingString(settings, "birth_date") ?? "",
          baseLat,
          baseLon,
        },
        describePlace(baseLat, baseLon, label, municipality),
      );
      let drift: { preset: ProfilePreset; place: string } | null = null;
      if (drifted && active) {
        const registered =
          active.baseLabel ??
          (await resolvePlaceName(active.baseLat, active.baseLon));
        if (!alive) return;
        drift = {
          preset: active,
          place: describePlace(
            active.baseLat,
            active.baseLon,
            registered,
            null,
          ),
        };
      }
      setState({ kind: "ready", line, inList: active !== null, drift });
    };
    read().catch(() => {
      if (alive) setState({ kind: "none" });
    });
    /* 同じ頁で設定バーやホームの入力欄が保存したら読み直す */
    const onChange = () => void read().catch(() => {});
    window.addEventListener("metaphysical-config-updated", onChange);
    return () => {
      alive = false;
      window.removeEventListener("metaphysical-config-updated", onChange);
    };
  }, []);

  if (state.kind === "loading") return null;

  const revert = async (preset: ProfilePreset) => {
    setReverting(true);
    try {
      /* 設定に控えの値を書き、使用中の印も付け直す。同じ頁の部品は
         metaphysical-config-updated で読み直す（札自身も） */
      await applyProfile(preset, fetch, window.localStorage);
    } finally {
      setReverting(false);
    }
  };

  if (state.kind === "none") {
    return (
      <p
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 ${className}`}
      >
        <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          プロフィールが未設定です。生年月日と出発地を登録すると、{purpose}
          をその人として出します。
        </span>
        <Link
          href="/profile"
          /* 押し所は 24px 角より小さくしない（WCAG 2.2 の Target Size
             (Minimum)）。実測 45 × 18px。文中ではなく帯の右端に立っている
             ので、文の行送りは崩れない */
          className="inline-flex min-h-[24px] items-center font-bold underline hover:text-amber-950"
        >
          登録する
        </Link>
      </p>
    );
  }

  const drift = state.drift;
  return (
    <div className={className}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-xs leading-relaxed text-stone-700">
        <UserRound className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
        <span>
          <b className="text-stone-800">使用中のプロフィール:</b> {state.line}
          {" — この設定で"}
          {purpose}
          {"を出しています"}
        </span>
        <Link
          href="/account"
          /* 上と同じ（この帯のもう一方の押し所） */
          className="inline-flex min-h-[24px] items-center font-semibold text-indigo-600 underline hover:text-indigo-800"
        >
          変更
        </Link>
      </p>
      {drift && (
        <p
          role="status"
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
        >
          <span>
            {`いまの出発地は、プロフィール「${drift.preset.name}」に登録した出発地（${drift.place}）と違います。`}
          </span>
          <button
            type="button"
            disabled={reverting}
            onClick={() => void revert(drift.preset)}
            className="inline-flex min-h-[24px] items-center rounded-lg border border-amber-300 bg-white px-2 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {reverting ? "戻しています…" : "登録した出発地に戻す"}
          </button>
        </p>
      )}
    </div>
  );
}

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
  describeProfile,
  findActiveProfile,
} from "@/lib/activeProfile";
import { isProfileReady } from "@/lib/profileCompletion";
import { describePlace, resolvePlaceName } from "@/lib/placeLabel";

type State =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "ready"; line: string; inList: boolean };

export function ActiveProfileBadge({
  /** 「この設定で〜を出しています」の〜。頁ごとに変える。 */
  purpose,
  className = "",
}: {
  purpose: string;
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

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
      /* 出発地は地名で出す（利用者の指摘、2026-09-12）。端末の地名 →
         控えの地名 → 最寄りの市区町村「付近」→ 座標 の順 */
      const label =
        settingString(settings, "base_label") || active?.baseLabel || null;
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
      setState({ kind: "ready", line, inList: active !== null });
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
          className="font-bold underline hover:text-amber-950"
        >
          登録する
        </Link>
      </p>
    );
  }

  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-stone-700 ${className}`}
    >
      <UserRound className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
      <span>
        <b className="text-stone-800">使用中のプロフィール:</b> {state.line}
        {" — この設定で"}
        {purpose}
        {"を出しています"}
      </span>
      <Link
        href="/account"
        className="font-semibold text-indigo-600 underline hover:text-indigo-800"
      >
        変更
      </Link>
    </p>
  );
}

"use client";

/**
 * 「使用中のプロフィール」を切り替える 1 つの部品。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-12）
 *
 * 控えを呼び出す・名前を付けて保存する UI が 4 画面（ホームの入力欄・
 * 設定バー・時計の個人設定・移住先比較）にそれぞれ独自の形であり、
 * どれも「登録内容」とは別の概念で動いていた。「ベストプラクティスを
 * 取り入れて独自性を排除してほしい」。
 *
 * 決め事: 切り替えはここ、作る・直す・消すは /profile と /account。
 * この部品は**選ぶだけ**で、名前の入力欄や保存ボタンを持たない。
 * 選ぶと lib/activeProfile の applyProfile が設定に書いて使用中にし、
 * 同じ頁の他の部品には metaphysical-config-updated で伝わる。
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { loadSettings } from "@/lib/userSettings";
import {
  loadProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { applyProfile, findActiveProfile } from "@/lib/activeProfile";

export function ProfilePicker({
  /** 設定バーなど字の小さい場所では "compact"。 */
  variant = "form",
  /** 切り替えたあとに呼ぶ（頁が自分の state を読み直すため）。 */
  onApplied,
  className = "",
}: {
  variant?: "form" | "compact";
  onApplied?: (preset: ProfilePreset) => void;
  className?: string;
}) {
  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      const [{ settings }, { presets: list }] = await Promise.all([
        loadSettings(),
        loadProfilePresets(fetch, window.localStorage),
      ]);
      if (!alive) return;
      setPresets(list);
      setActiveId(findActiveProfile(list, settings)?.id ?? "");
    };
    read().catch(() => {});
    const onChange = () => void read().catch(() => {});
    window.addEventListener("metaphysical-config-updated", onChange);
    return () => {
      alive = false;
      window.removeEventListener("metaphysical-config-updated", onChange);
    };
  }, []);

  const pick = async (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setBusy(true);
    try {
      const r = await applyProfile(preset, fetch, window.localStorage);
      setPresets(r.presets);
      setActiveId(preset.id);
      setNote(
        `「${preset.name}」を使用中にしました。すべての道具がこのプロフィールで判定します。`,
      );
      onApplied?.(preset);
    } finally {
      setBusy(false);
    }
  };

  const small = variant === "compact";
  const selectClass = small
    ? "px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-[10px] text-stone-700 outline-none focus:border-indigo-200"
    : "bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400";
  const linkClass = small
    ? "text-[10px] font-semibold text-indigo-600 underline"
    : "text-xs font-semibold text-indigo-600 underline";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <label className="flex items-center gap-1.5">
        <UserCheck
          className={`${small ? "h-3 w-3" : "h-4 w-4"} text-emerald-600`}
          aria-hidden
        />
        <span
          className={
            small
              ? "text-[10px] font-bold text-stone-600"
              : "text-xs font-bold text-slate-700"
          }
        >
          使用中のプロフィール
        </span>
        <select
          aria-label="使用中のプロフィール"
          value={activeId}
          disabled={busy || presets.length === 0}
          onChange={(e) => void pick(e.target.value)}
          className={selectClass}
        >
          {presets.length === 0 ? (
            <option value="">まだありません</option>
          ) : (
            <>
              {!activeId && <option value="">-- 選ぶ --</option>}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
      <Link href="/account" className={linkClass}>
        プロフィールを管理
      </Link>
      <Link href="/profile?new=1" className={linkClass}>
        新しく追加
      </Link>
      {note && (
        <p
          role="status"
          className={`w-full ${small ? "text-[10px]" : "text-xs"} text-emerald-700`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

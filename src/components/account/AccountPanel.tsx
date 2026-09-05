"use client";

import React from "react";
import Link from "next/link";
import { LogOut, Loader2, UserRound } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { loadSettings } from "@/lib/userSettings";
import { profileCompletion } from "@/lib/profileCompletion";
import { ProfileProgress } from "@/components/profile/ProfileProgress";
import {
  loadProfilePresets,
  type ProfilePreset,
} from "@/lib/profilePresetSync";

/**
 * マイページ。**いま何が登録されていて、どこで変えられるか**を 1 枚にする。
 *
 * これまでは散っていた。
 *
 *   ログイン中かどうか … /login を開くか、サイドバーを見る
 *   何を登録したか     … /profile の入力欄を開いて確かめる
 *   保存済みプロフィール … 呼び出す口は 4 画面にあるが、一覧は無い
 *   ログアウト         … /login とサイドバー
 *
 * 入力は `/profile` の仕事なので、ここでは**入力欄を作らない**。同じ値を
 * 2 か所で書けるようにすると必ず食い違う。ここは見るところ。
 */

type Status = "loading" | "ready";

export function AccountPanel() {
  const [status, setStatus] = React.useState<Status>("loading");
  const [email, setEmail] = React.useState<string | null>(null);
  const [completion, setCompletion] = React.useState(profileCompletion({}));
  const [presets, setPresets] = React.useState<ProfilePreset[]>([]);
  const [cloudSynced, setCloudSynced] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const [{ data }, settings, presetResult] = await Promise.all([
        supabase.auth.getUser(),
        loadSettings(),
        loadProfilePresets(fetch, window.localStorage),
      ]);
      if (!alive) return;
      setEmail(data.user?.email ?? null);
      setCompletion(profileCompletion(settings.settings));
      setPresets(presetResult.presets);
      setCloudSynced(presetResult.cloudSynced);
      setStatus("ready");
    })().catch(() => {
      if (alive) setStatus("ready");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (status === "loading") {
    return (
      <p className="flex items-center gap-2 text-xs text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        登録の内容を読んでいます。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. だれとしてログインしているか ------------------------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-stone-800">
          <UserRound className="h-4 w-4 text-rose-500" aria-hidden />
          アカウント
        </h2>
        {email ? (
          <>
            <p className="mt-3 break-all text-sm font-semibold text-stone-800">
              {email}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
              {
                "登録した内容はこのアカウントに保存されます。別の端末で同じアカウントにログインすると、同じ設定で使えます。"
              }
            </p>
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                const supabase = createClient();
                await supabase.auth.signOut();
                /* 画面ごと描き直す。サイドバーのログイン状態も
                   /login への遷移で読み直される作りになっている */
                window.location.assign("/login");
              }}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 px-5 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <LogOut className="h-3.5 w-3.5" aria-hidden />
              )}
              ログアウト
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-xs leading-relaxed text-stone-600">
              {
                "ログインしていません。入力した内容はこの端末にだけ残ります。ログインすると、ほかの端末でも同じ設定が使えます。"
              }
            </p>
            <Link
              href="/login?next=/account"
              className="mt-4 inline-flex items-center rounded-full bg-indigo-600 px-6 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-700"
            >
              ログインする
            </Link>
          </>
        )}
      </section>

      {/* 2. 何が登録されているか --------------------------------- */}
      <ProfileProgress completion={completion} />

      <p className="text-[11px] leading-relaxed text-stone-500">
        {"内容を変えるには "}
        <Link
          href="/profile"
          className="font-semibold text-indigo-600 underline"
        >
          生年月日と場所を登録
        </Link>
        {
          " を開いてください。ここでは入力できません（同じ値を 2 か所で書けるようにすると食い違うため）。"
        }
      </p>

      {/* 3. 保存済みプロフィール --------------------------------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-800">
            保存済みプロフィール
          </h2>
          <p className="text-[11px] text-stone-500">{presets.length} 件</p>
        </div>
        <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "家族ぶんなど、複数の生年月日を切り替えて使うための控えです。呼び出しと保存は設定バー（画面の上）と各ツールから行えます。"
          }
        </p>

        {presets.length === 0 ? (
          <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600">
            {
              "まだありません。設定バーで名前を付けて保存すると、ここに並びます。"
            }
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-100">
            {presets.map((preset) => (
              <li
                key={preset.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <span className="text-xs font-semibold text-stone-800">
                  {preset.name}
                </span>
                <span className="text-[11px] text-stone-500">
                  生年月日 {preset.birthDate || "未設定"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-stone-500">
          {cloudSynced
            ? "アカウントに保存されています（ほかの端末でも同じ一覧になります）。"
            : "この端末にだけ保存されています。ログインすると、ほかの端末でも同じ一覧になります。"}
        </p>
      </section>
    </div>
  );
}

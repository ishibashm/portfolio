"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  LogOut,
  Loader2,
  Pencil,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { loadSettings } from "@/lib/userSettings";
import { profileCompletion } from "@/lib/profileCompletion";
import { ProfileProgress } from "@/components/profile/ProfileProgress";
import {
  deleteProfilePreset,
  loadProfilePresets,
  renameProfilePreset,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { deleteAccountData } from "@/lib/accountData";

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
 * 生年月日と場所の入力は `/profile` の仕事なので、ここでは**その入力欄を
 * 作らない**。同じ値を 2 か所で書けるようにすると必ず食い違う。
 *
 * ただし**保存済みプロフィールの名前と削除はここでやる**。名前は一覧に
 * しか出てこないもので、直せるのがホームの時計の中（PersonalProfileConfig）
 * だけだった。一覧を出しておいて直せないほうが食い違う。中身（生年月日・
 * 場所）の編集は /profile に持たせる。
 */

type Status = "loading" | "ready";

export function AccountPanel() {
  const [status, setStatus] = React.useState<Status>("loading");
  const [email, setEmail] = React.useState<string | null>(null);
  const [completion, setCompletion] = React.useState(profileCompletion({}));
  const [presets, setPresets] = React.useState<ProfilePreset[]>([]);
  const [cloudSynced, setCloudSynced] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  /* 消す操作は 2 段。誤って押しただけでは消えないようにする */
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteMessage, setDeleteMessage] = React.useState<string | null>(null);
  /* 名前を直している 1 件。null なら誰も直していない */
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  /* 進行中の 1 件（名前の保存・削除）。二重に押させない */
  const [busyId, setBusyId] = React.useState<string | null>(null);

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
            "家族ぶんなど、複数の生年月日を切り替えて使うための控えです。ここで名前を直したり、要らなくなったものを消したりできます。呼び出しと新規保存は設定バー（画面の上）と各ツールから行えます。"
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
              <li key={preset.id} className="py-2.5">
                {editingId === preset.id ? (
                  /* 名前を直しているあいだ。Enter でも保存できるよう form
                     にする（小さな入力で「押す場所を探す」を作らない） */
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = editingName.trim();
                      if (!name) return;
                      setBusyId(preset.id);
                      const result = await renameProfilePreset(
                        preset.id,
                        name,
                        fetch,
                        window.localStorage,
                      );
                      setPresets(result.presets);
                      setCloudSynced(result.cloudSynced);
                      setBusyId(null);
                      setEditingId(null);
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      maxLength={100}
                      aria-label="プロフィールの名前"
                      className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-800 focus:border-indigo-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busyId === preset.id || !editingName.trim()}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-indigo-600 px-4 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      {busyId === preset.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <Check className="h-3 w-3" aria-hidden />
                      )}
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-700"
                    >
                      <X className="h-3 w-3" aria-hidden />
                      やめる
                    </button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-800">
                        {preset.name}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        生年月日 {preset.birthDate || "未設定"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(preset.id);
                          setEditingName(preset.name);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-[11px] font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                        名前
                      </button>
                      <button
                        type="button"
                        disabled={busyId === preset.id}
                        onClick={async () => {
                          /* 消す前に必ず名前を出して確かめる。一覧から
                             1 件だけ消えるので、取り違えると気付きにくい */
                          if (
                            !window.confirm(
                              `「${preset.name}」を消します。よろしいですか。`,
                            )
                          )
                            return;
                          setBusyId(preset.id);
                          const result = await deleteProfilePreset(
                            preset.id,
                            fetch,
                            window.localStorage,
                          );
                          setPresets(result.presets);
                          setCloudSynced(result.cloudSynced);
                          setBusyId(null);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === preset.id ? (
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Trash2 className="h-3 w-3" aria-hidden />
                        )}
                        削除
                      </button>
                    </div>
                  </div>
                )}
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

      {/* 4. 登録した内容を消す ----------------------------------- */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-rose-800">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          登録した内容を消す
        </h2>
        <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
          {
            "生年月日・出生地・いま住んでいる場所・目的地・保存済みプロフィール・設定バーの好みを、アカウントからもこの端末からも消します。元に戻せません。"
          }
        </p>
        <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-stone-600">
          {
            "Google のアカウントそのものは消えません。消したあとも同じアカウントでログインでき、何も登録していない状態から使い直せます。"
          }
        </p>

        {deleteMessage ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-800"
          >
            {deleteMessage}
          </p>
        ) : confirmingDelete ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                const result = await deleteAccountData(
                  fetch,
                  window.localStorage,
                );
                /* 消えた後の見え方に合わせる。読み直しはしない
                   （消した直後にクラウドを引くと 404 待ちになる） */
                setCompletion(profileCompletion({}));
                setPresets([]);
                setDeleting(false);
                setConfirmingDelete(false);
                setDeleteMessage(
                  result.cloudCleared
                    ? "消しました。アカウントとこの端末の両方から消えています。"
                    : result.unauthenticated
                      ? "この端末から消しました。ログインしていないので、アカウント側には元から何もありません。"
                      : "この端末から消しました。アカウント側は消せていません（通信の状態を確かめて、もう一度お試しください）。",
                );
              }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-rose-600 px-6 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {deleting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              本当に消す
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
              className="cursor-pointer text-xs font-semibold text-stone-600 underline disabled:opacity-50"
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mt-4 inline-flex cursor-pointer items-center rounded-full border border-rose-300 px-6 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
          >
            登録した内容を消す
          </button>
        )}
      </section>
    </div>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  LogOut,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { loadSettings } from "@/lib/userSettings";
import { profileCompletion } from "@/lib/profileCompletion";
import { describeDestination, readDestination } from "@/lib/destinationSetting";
import { ProfileProgress } from "@/components/profile/ProfileProgress";
import {
  deleteProfilePreset,
  loadProfilePresets,
  renameProfilePreset,
  type ProfilePreset,
} from "@/lib/profilePresetSync";
import { applyProfile, findActiveProfile } from "@/lib/activeProfile";
import { usePlaceName } from "@/lib/placeLabel";
import { deleteAccountData } from "@/lib/accountData";
import { Plus, UserCheck } from "lucide-react";

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
 * **端末にだけ残るものも出す。**目的地は `SYNCED_FIELDS` に入れていない
 * ので、アカウントには送らず localStorage にだけ残る。それでも「登録した
 * 内容を消す」は目的地も消すと書いてあるので、**消すと言っているものが
 * 一覧に出ていない**のは食い違い。保存先が違うことを添えて並べる。
 *
 * ただし**保存済みプロフィールの名前と削除はここでやる**。名前は一覧に
 * しか出てこないもので、直せるのがホームの時計の中（PersonalProfileConfig）
 * だけだった。一覧を出しておいて直せないほうが食い違う。中身（生年月日・
 * 場所）の編集は /profile に持たせる。
 */

type Status = "loading" | "ready";

/**
 * 一覧の 1 件の場所。座標ではなく地名で出す（利用者の指摘、2026-09-12）。
 * 控えに地名があればそれ、無ければ最寄りの市区町村「付近」。hook を
 * 使うので map の中に直接書けず、部品に切り出してある。
 */
function PresetPlaces({ preset }: { preset: ProfilePreset }) {
  const base = usePlaceName(preset.baseLat, preset.baseLon, preset.baseLabel);
  const birth = usePlaceName(
    preset.birthLat,
    preset.birthLon,
    preset.birthLabel,
  );
  return (
    <p className="text-[11px] text-stone-500">
      出発地 {base}
      {" ／ 出生地 "}
      {birth}
    </p>
  );
}

export function AccountPanel() {
  const [status, setStatus] = React.useState<Status>("loading");
  const [email, setEmail] = React.useState<string | null>(null);
  const [completion, setCompletion] = React.useState(profileCompletion({}));
  const [presets, setPresets] = React.useState<ProfilePreset[]>([]);
  /* 目的地。端末にだけ残るので、読むのもクラウドを見ない */
  const [destination, setDestination] = React.useState<string | null>(null);
  const [cloudSynced, setCloudSynced] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  /* 消す操作は 2 段。誤って押しただけでは消えないようにする */
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteMessage, setDeleteMessage] = React.useState<string | null>(null);
  /* 名前を直している 1 件。null なら誰も直していない */
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  /* 進行中の 1 件（名前の保存・削除・使う）。二重に押させない */
  const [busyId, setBusyId] = React.useState<string | null>(null);
  /*
    使用中のプロフィールの id。一覧の中で 1 件だけ（lib/activeProfile）。
    「登録内容」と「保存済みプロフィール」を別の概念にしていたのをやめ、
    **使用中のプロフィールの値が登録内容**とする（利用者の指摘、
    2026-09-12）。旗の無い古い控えでも、登録内容と同じ値なら使用中。
  */
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [switchMessage, setSwitchMessage] = React.useState<string | null>(null);

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
      setActiveId(
        findActiveProfile(presetResult.presets, settings.settings)?.id ?? null,
      );
      setDestination(describeDestination(readDestination()));
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

      {/* 2. 使用中のプロフィールの登録内容 ------------------------ */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-stone-800">
          <UserCheck className="h-4 w-4 text-emerald-600" aria-hidden />
          使用中のプロフィール
          {activeId && (
            <span className="text-xs font-semibold text-stone-600">
              「{presets.find((p) => p.id === activeId)?.name}」
            </span>
          )}
        </h2>
        <p className="max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "方位の判定・引越しの試算・物件検索は、すべてこのプロフィールで出しています。"
          }
        </p>
        <ProfileProgress completion={completion} />
      </div>

      {/* 2-b. 端末にだけ残るもの ------------------------------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-800">
            引越し先の候補（目的地）
          </h2>
          <p className="text-[11px] text-stone-500">この端末にだけ</p>
        </div>
        {destination ? (
          <p className="mt-3 font-mono text-xs break-all text-stone-700">
            {destination}
          </p>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-stone-600">
            {
              "まだ入れていません。入れておくと、シミュレータ・物件検索・時期の分析で同じ場所を打ち直さずに済みます。"
            }
          </p>
        )}
        <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "「どこへ引越すつもりか」はアカウントに送っていません。ログインしていても、この端末の中だけに残ります。"
          }
        </p>
      </section>

      <p className="text-[11px] leading-relaxed text-stone-500">
        {"使用中のプロフィールを直すには "}
        <Link
          href="/profile"
          className="font-semibold text-indigo-600 underline"
        >
          プロフィールを編集
        </Link>
        {
          " を開いてください。ここでは入力できません（同じ値を 2 か所で書けるようにすると食い違うため）。"
        }
      </p>

      {/* 3. プロフィールの一覧 ------------------------------------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-800">
            プロフィールの一覧
            <span className="ml-2 text-[11px] font-normal text-stone-500">
              {presets.length} 件
            </span>
          </h2>
          <Link
            href="/profile?new=1"
            className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-3 w-3" aria-hidden />
            新しいプロフィールを追加
          </Link>
        </div>
        <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "家族ぶんなど、複数のプロフィールを持てます。使用中は 1 件で、「使う」で切り替えると、すべての道具がそのプロフィールで判定します。"
          }
        </p>

        {switchMessage && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-800"
          >
            {switchMessage}
          </p>
        )}

        {presets.length === 0 ? (
          <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600">
            {"まだありません。"}
            <Link href="/profile" className="font-semibold underline">
              プロフィールを登録
            </Link>
            {" すると、ここに並びます。"}
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
                      <p className="flex items-center gap-2 text-xs font-semibold text-stone-800">
                        {preset.name}
                        {preset.id === activeId && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            使用中
                          </span>
                        )}
                      </p>
                      {/* 中身を出す。名前だけだと、家族ぶんの控えが
                          並んだときにどれがどれだか分からない */}
                      <p className="text-[11px] text-stone-500">
                        生年月日 {preset.birthDate || "未設定"}
                      </p>
                      <PresetPlaces preset={preset} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {preset.id !== activeId && (
                        <button
                          type="button"
                          disabled={busyId === preset.id}
                          onClick={async () => {
                            setBusyId(preset.id);
                            const r = await applyProfile(
                              preset,
                              fetch,
                              window.localStorage,
                            );
                            setPresets(r.presets);
                            setCloudSynced(r.cloudSynced);
                            setActiveId(preset.id);
                            const { settings } = await loadSettings();
                            setCompletion(profileCompletion(settings));
                            setBusyId(null);
                            setSwitchMessage(
                              `「${preset.name}」を使用中にしました。方位の判定・引越しの試算・物件検索は、このプロフィールで出します。`,
                            );
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                        >
                          {busyId === preset.id ? (
                            <Loader2
                              className="h-3 w-3 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <UserCheck className="h-3 w-3" aria-hidden />
                          )}
                          使う
                        </button>
                      )}
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
                      {/* 中身は /profile の入力欄で直す。ここに同じ欄を
                          作ると、同じ値を 2 か所で書けることになる */}
                      <Link
                        href={
                          preset.id === activeId
                            ? "/profile"
                            : `/profile?preset=${encodeURIComponent(preset.id)}`
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1 text-[11px] font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                      >
                        <SlidersHorizontal className="h-3 w-3" aria-hidden />
                        編集
                      </Link>
                      <button
                        type="button"
                        disabled={
                          busyId === preset.id || preset.id === activeId
                        }
                        title={
                          preset.id === activeId
                            ? "使用中のプロフィールは消せません。先に別のプロフィールを「使う」にしてください"
                            : undefined
                        }
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
            "生年月日・出生地・いま住んでいる場所・目的地・プロフィールの一覧・設定バーの好みを、アカウントからもこの端末からも消します。元に戻せません。"
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

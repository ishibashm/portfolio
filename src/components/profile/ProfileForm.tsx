"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PlaceInput } from "@/components/relocation/PlaceInput";
import {
  loadSettings,
  saveSettings,
  settingNumber,
  settingString,
} from "@/lib/userSettings";
import { readDestination, writeDestination } from "@/lib/destinationSetting";
import { profileCompletion } from "@/lib/profileCompletion";
import { ProfileProgress } from "@/components/profile/ProfileProgress";

/**
 * 生年月日・出生地・出発地・目的地をまとめて入れる頁の中身。
 *
 * ## なぜ作ったか（利用者の指摘、2026-09-04）
 *
 * 「出生地や目的地を簡単に設定できるようにしたい。よくある個人情報登録
 * ページ、申し込みとかで入力する入力フォームみたいにしたい」。
 *
 * これまでの入口はホームの `PersonalProfileConfig`（等幅フォントの
 * 計器盤ふう）だけで、**申し込みフォームの見た目ではなかった**。
 * 項目も画面の中に散っていて、どこまで入れれば道具が動くのか分から
 * ない。ここは順に埋めるだけの 1 枚にする。
 *
 * 既存の入口は**消していない**。同じ値を書くので、どちらから入れても
 * 同じ結果になる。
 *
 * ## 保存先
 *
 * - 生年月日・出生地・出発地 … `userSettings`。ログイン中はクラウドにも
 *   同期する（既存の `SYNCED_FIELDS`。**項目は増やしていない**）
 * - 目的地 … `destinationSetting`。**端末にだけ置く**（同期しない）
 *
 * ## 入力欄は作り直さない
 *
 * 場所の入力は `PlaceInput` が地名・郵便番号・緯度経度の 3 通りを
 * すでに持っている。ここで似たものを新しく書かない。
 */

/** 生年月日として受け付ける範囲。外れると本命星が引けない。 */
const MIN_BIRTH = "1900-01-01";

type Status = "idle" | "loading" | "saving" | "saved" | "error";

export function ProfileForm() {
  const [status, setStatus] = React.useState<Status>("loading");
  const [message, setMessage] = React.useState<string>("");
  const [synced, setSynced] = React.useState(false);

  const [birthDate, setBirthDate] = React.useState("");
  const [birthLat, setBirthLat] = React.useState<number | null>(null);
  const [birthLon, setBirthLon] = React.useState<number | null>(null);
  const [baseLat, setBaseLat] = React.useState<number | null>(null);
  const [baseLon, setBaseLon] = React.useState<number | null>(null);
  const [destLat, setDestLat] = React.useState<number | null>(null);
  const [destLon, setDestLon] = React.useState<number | null>(null);
  /* ログイン直後にここへ回された人。/login が ?welcome=1 を付ける */
  const [welcome, setWelcome] = React.useState(false);

  /* 開いたときに 1 度だけ読む。ログイン中はクラウドの値も取り込む */
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { settings, synced: didSync } = await loadSettings();
        if (!alive) return;
        setBirthDate(settingString(settings, "birth_date") ?? "");
        setBirthLat(settingNumber(settings, "birth_lat") ?? null);
        setBirthLon(settingNumber(settings, "birth_lon") ?? null);
        setBaseLat(settingNumber(settings, "base_lat") ?? null);
        setBaseLon(settingNumber(settings, "base_lon") ?? null);
        const dest = readDestination();
        setDestLat(dest.lat);
        setDestLon(dest.lon);
        setSynced(didSync);
        /* 待ってから読む。効果の本体で setState すると
           set-state-in-effect に当たる（CLAUDE.md 4 節） */
        setWelcome(
          new URLSearchParams(window.location.search).get("welcome") === "1",
        );
        setStatus("idle");
      } catch {
        if (alive) setStatus("idle");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");

    /* 目的地は端末だけ。先に書いておく（保存が失敗しても残る） */
    writeDestination({
      lat: destLat ?? undefined,
      lon: destLon ?? undefined,
    });

    try {
      const result = await saveSettings({
        birth_date: birthDate || undefined,
        birth_lat: birthLat ?? undefined,
        birth_lon: birthLon ?? undefined,
        base_lat: baseLat ?? undefined,
        base_lon: baseLon ?? undefined,
      });
      setSynced(result.synced);
      setStatus("saved");
      setMessage(
        result.synced
          ? "保存しました。ログイン中なので、ほかの端末でも同じ設定になります。"
          : "この端末に保存しました。ログインすると、ほかの端末でも同じ設定が使えます。",
      );
    } catch {
      setStatus("error");
      setMessage(
        "保存できませんでした。通信の状態を確かめて、もう一度お試しください。",
      );
    }
  }

  /* 進み具合は入力中の値から出す。保存を待たない（埋めた手応えが
     その場で返らないと、確かめるために保存を押すことになる）。
     線引きは lib/profileCompletion 1 か所。ここで書き直さない */
  const completion = profileCompletion({
    birth_date: birthDate || undefined,
    birth_lat: birthLat ?? undefined,
    birth_lon: birthLon ?? undefined,
    base_lat: baseLat ?? undefined,
    base_lon: baseLon ?? undefined,
  });
  const canUseTools = completion.ready;

  if (status === "loading") {
    return (
      <p className="flex items-center gap-2 text-xs text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        保存されている内容を読んでいます。
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ログイン直後の人にだけ、ここへ回した理由を出す。何も言わずに
          入力欄を見せると「なぜ飛ばされたのか」が分からない */}
      {welcome && (
        <p className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-xs leading-relaxed text-indigo-900">
          <b className="text-sm">ログインできました。</b>
          <br />
          {
            "あとは生年月日といま住んでいる場所を入れると、方位の判定が動きます。入れた内容はアカウントに保存されるので、ほかの端末でも同じ設定で使えます。"
          }
        </p>
      )}

      <ProfileProgress completion={completion} />

      {/* 1. 生まれたとき ------------------------------------------- */}
      <fieldset className="rounded-2xl border border-stone-200 bg-white p-5">
        <legend className="px-2 text-sm font-bold text-stone-800">
          1. 生まれたとき
        </legend>
        <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "本命星と天中殺がここから決まります。生年月日だけでも道具は動きます。"
          }
        </p>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-stone-700">
              生年月日
              <span className="ml-2 text-[10px] font-normal text-rose-600">
                必須
              </span>
            </span>
            <input
              type="date"
              required
              min={MIN_BIRTH}
              max={today}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-800 focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-[10px] leading-relaxed text-stone-500">
              {
                "立春より前に生まれた方は、九星気学では前年の生まれとして数えます。ここには戸籍どおりの日付を入れてください。読み替えは計算側で行います。"
              }
            </span>
          </label>

          <PlaceInput
            label="出生地"
            variant="form"
            optional
            lat={birthLat}
            lon={birthLon}
            onChange={(lat, lon) => {
              setBirthLat(lat);
              setBirthLon(lon);
            }}
            help="太陽時の計算に使います。分からなければ空のままで構いません。"
          />
        </div>
      </fieldset>

      {/* 2. いま住んでいるところ ----------------------------------- */}
      <fieldset className="rounded-2xl border border-stone-200 bg-white p-5">
        <legend className="px-2 text-sm font-bold text-stone-800">
          2. いま住んでいるところ
        </legend>
        <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "方位はここを起点に測ります。引越しの方位を見るなら、ここが入っていないと何も出ません。"
          }
        </p>
        <div className="mt-4 max-w-xl">
          <PlaceInput
            label="出発地"
            variant="form"
            lat={baseLat}
            lon={baseLon}
            onChange={(lat, lon) => {
              setBaseLat(lat);
              setBaseLon(lon);
            }}
            help="いま住んでいる場所です。ここから見た方位で吉凶が決まります。"
          />
        </div>
      </fieldset>

      {/* 3. 引越し先の候補 ----------------------------------------- */}
      <fieldset className="rounded-2xl border border-stone-200 bg-white p-5">
        <legend className="px-2 text-sm font-bold text-stone-800">
          3. 引越し先の候補
          <span className="ml-2 text-[10px] font-normal text-stone-400">
            任意
          </span>
        </legend>
        <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-stone-500">
          {
            "決まっていれば入れておくと、試算や時期の分析で入れ直さずに済みます。"
          }
          <b>この項目はこの端末にだけ残り、送信されません。</b>
        </p>
        <div className="mt-4 max-w-xl">
          <PlaceInput
            label="目的地"
            variant="form"
            optional
            lat={destLat}
            lon={destLon}
            onChange={(lat, lon) => {
              setDestLat(lat);
              setDestLon(lon);
            }}
            help="引越し先の候補です。決まっていなければ空のままで構いません。"
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {status === "saving" && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          保存する
        </button>
        <span className="text-[11px] text-stone-500">
          {synced
            ? "ログイン中です。生年月日と場所はクラウドにも保存されます。"
            : "未ログインです。入力はこの端末にだけ残ります。"}
        </span>
      </div>

      {message && (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-xl border p-4 text-xs leading-relaxed ${
            status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {status === "saved" && (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{message}</span>
        </p>
      )}

      {/* 保存できたら、次にどこへ行けばよいかを出す。入れて終わりに
          しない（入力だけして何も起きない画面を作らない） */}
      {status === "saved" && canUseTools && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <h2 className="text-sm font-bold text-stone-800">次にできること</h2>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link
                href="/houi"
                className="font-semibold text-indigo-600 underline"
              >
                本命星と今年の吉方位を見る
              </Link>
            </li>
            <li>
              <Link
                href="/relocation/simulator"
                className="font-semibold text-indigo-600 underline"
              >
                引越し先を試算する
              </Link>
            </li>
            <li>
              <Link
                href="/relocation/arbitrage"
                className="font-semibold text-indigo-600 underline"
              >
                物件を方位で探す
              </Link>
            </li>
            <li>
              <Link
                href="/calendar"
                className="font-semibold text-indigo-600 underline"
              >
                引越しの日取りを選ぶ
              </Link>
            </li>
          </ul>
        </div>
      )}
    </form>
  );
}

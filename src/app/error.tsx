"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  clearChunkReloadFlag,
  isChunkLoadError,
  reloadOnceForChunkError,
} from "@/lib/chunkLoadError";

/**
 * 頁の中で例外が出たときに出す画面。
 *
 * ## なぜ足したか
 *
 * **これまで error.tsx も global-error.tsx も 1 つも無かった。**そのため
 * 画面のどこかで例外が出ると、Next.js の既定の画面
 *
 *   Application error: a client-side exception has occurred
 *   while loading cloud-palette.com (see the browser console for more
 *   information).
 *
 * だけが出ていた。英語の 1 行で、利用者にできることが書かれていない。
 * 実際に利用者から報告があった（2026-08-20 07:48 JST、「引越しの日取りを
 * 選ぶ」を開いたところ。直前 07:33 に #440 のデプロイが完了している）。
 *
 * ## デプロイ直後に起きやすい
 *
 * master へマージするたびにサイトが出る。出るたびに JavaScript の塊の
 * ファイル名が変わり、前の版のファイルは消える。すでに開いている人の
 * 画面は前の名前を覚えているので、そのまま別の頁へ進むと 404 になる。
 *
 * これは壊れているのではなく**古い名前を見ているだけ**なので、
 * lib/chunkLoadError が 1 回だけ自動で読み込み直す。直らなければ
 * この画面を出して、人が決められるようにする。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 塊の読み込み失敗なら 1 回だけ読み込み直す。戻ってきたら
    // この useEffect は動かない（画面が作り直されるため）。
    if (reloadOnceForChunkError(error)) return;

    // 自動で直せない種類。原因を追えるように残す。
    console.error("画面で例外が出た:", error);
  }, [error]);

  const stale = isChunkLoadError(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50 via-stone-50 to-amber-50 px-4 py-16 text-stone-800">
      <section className="w-full max-w-xl rounded-3xl border border-white/80 bg-white/80 p-8 text-center shadow-xl shadow-rose-100/50 backdrop-blur-xl sm:p-12">
        <p className="font-mono text-sm font-bold tracking-[0.35em] text-rose-500">
          ERROR
        </p>
        <h1 className="mt-4 font-serif text-3xl font-bold text-stone-900">
          {stale
            ? "新しい版が出たため、読み込み直しが必要です"
            : "この画面を表示できませんでした"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-stone-600">
          {stale
            ? "サイトが更新された直後に開くと、古い版の部品を読みに行って表示できないことがあります。読み込み直すと直ります。入力した内容は保存されていれば残ります。"
            : "一時的な不具合の可能性があります。読み込み直しても直らないときは、しばらく経ってからお試しください。"}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              clearChunkReloadFlag();
              window.location.reload();
            }}
            className="cursor-pointer rounded-full bg-stone-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-stone-700"
          >
            読み込み直す
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="cursor-pointer rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
          >
            もう一度開く
          </button>
          <Link
            href="/"
            className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
          >
            ホームへ戻る
          </Link>
        </div>

        {/*
            digest は Next.js がサーバ側のログと突き合わせるために付ける
            短い識別子。問い合わせをもらったときに、どの例外かを探せる。
          */}
        {error.digest && (
          <p className="mt-6 font-mono text-[10px] text-stone-500">
            識別子: {error.digest}
          </p>
        )}
      </section>
    </main>
  );
}

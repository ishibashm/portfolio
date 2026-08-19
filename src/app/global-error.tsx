"use client";

import { useEffect } from "react";
import { reloadOnceForChunkError } from "@/lib/chunkLoadError";

/**
 * **一番外側**で例外が出たときに出す画面。
 *
 * error.tsx は頁の中の例外しか受け止められない。レイアウト自身が
 * 落ちた場合はここが出る。Next.js の決まりで、この部品だけは
 * `<html>` と `<body>` を自分で書く（レイアウトごと差し替わるため）。
 *
 * そのぶん、ここでは共通の部品も CSS 変数も当てにできない。文字と
 * 色は直接書く。**ここが落ちると本当に何も出せない**ので、依存を
 * 最小限にしてある（読み込むのは chunkLoadError の 1 つだけ）。
 *
 * 経緯は error.tsx の冒頭に書いた。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (reloadOnceForChunkError(error)) return;
    console.error("一番外側で例外が出た:", error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          background: "#faf7f5",
          color: "#292524",
          fontFamily:
            "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            画面を表示できませんでした
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              lineHeight: 1.8,
              color: "#57534e",
            }}
          >
            サイトが更新された直後に開くと、古い版の部品を読みに行って表示できないことがあります。読み込み直すと直ることがほとんどです。
          </p>

          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                cursor: "pointer",
                border: "none",
                borderRadius: "9999px",
                background: "#1c1917",
                color: "#ffffff",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 700,
              }}
            >
              読み込み直す
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                borderRadius: "9999px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#44403c",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 700,
              }}
            >
              もう一度開く
            </button>
            {/*
                ここは next/link を使わない。**router ごと落ちている
                かもしれない場所**なので、router に依存する部品は
                当てにできない。素の <a> なら頁ごと読み込み直すので、
                古い塊を見ている状態もそこで解ける（それがこの画面の
                目的でもある）。
              */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: "9999px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#44403c",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              ホームへ戻る
            </a>
          </div>

          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.625rem",
                fontFamily: "ui-monospace, monospace",
                color: "#78716c",
              }}
            >
              識別子: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

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
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>画面を表示できませんでした</title>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html:
              "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem 1rem;background:#FAF7F2;color:#171C2B;font-family:system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif}html.dark body{background:#151722;color:#F3EFE8}h1{font-size:1.5rem;font-weight:700;margin:0}p.lead{margin-top:.75rem;font-size:.875rem;line-height:1.8;color:#4D5568}html.dark p.lead{color:#B2B8CA}.actions{margin-top:2rem;display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap}button,a.btn{cursor:pointer;border-radius:9999px;padding:.75rem 1.5rem;font-size:.875rem;font-weight:700;text-decoration:none;display:inline-block}button.primary{border:none;background:#1E3A6E;color:#fff}html.dark button.primary{background:#8CB4FF;color:#151722}button.secondary,a.btn{border:1px solid #DDD6CA;background:#fff;color:#171C2B}html.dark button.secondary,html.dark a.btn{border-color:#383E56;background:#1E2130;color:#F3EFE8}p.digest{margin-top:1.5rem;font-size:.625rem;font-family:ui-monospace,monospace;color:#4D5568}html.dark p.digest{color:#B2B8CA}",
          }}
        />
      </head>
      <body>
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1>画面を表示できませんでした</h1>
          <p className="lead">
            サイトが更新された直後に開くと、古い版の部品を読みに行って表示できないことがあります。読み込み直すと直ることがほとんどです。
          </p>

          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => window.location.reload()}
            >
              読み込み直す
            </button>
            <button type="button" className="secondary" onClick={() => reset()}>
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
            <a href="/" className="btn">
              ホームへ戻る
            </a>
          </div>

          {error.digest && <p className="digest">識別子: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}

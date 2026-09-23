"use client";

import { useState } from "react";

/**
 * 外部サイトの URL をクリップボードへ写すだけのボタン。
 *
 * 利用者の依頼（2026-09-24）「広島なら広島のリンクができて、貼り付け
 * られるようにしたい」。リンクを開くだけでなく、LINE やメモへ**貼れる形で
 * 持ち出せる**ようにする。URL は台帳（`portalLinksForCity`）が組んだもの
 * をそのまま写す。こちらで組み直さない。
 *
 * **開きに行かない。**写すのは文字列だけ。
 *
 * `PortalLinkList` はサーバでも描く（市区町村ページ）ので、状態を持つ
 * ここだけを client に切り出す。
 */
export function CopyLinkButton({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      /* 古い端末・http では clipboard が無い。無ければ失敗と言う */
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(href);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="ml-2 inline-flex min-h-[24px] items-center rounded-md border border-slate-300 px-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
    >
      {state === "copied"
        ? "コピーしました"
        : state === "failed"
          ? "コピーできませんでした（長押しでコピーしてください）"
          : "URL をコピー"}
    </button>
  );
}

export default CopyLinkButton;

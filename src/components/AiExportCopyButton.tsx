"use client";

/**
 * 読み取り専用の textarea に足すコピーボタン。
 * JS が無いときは出ないが、文書そのものは textarea で読める。
 */
import { useState } from "react";

export function AiExportCopyButton({ text }: { text: string }) {
  const [message, setMessage] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("コピーしました。お使いの AI の入力欄に貼り付けてください。");
    } catch {
      setMessage(
        "コピーできませんでした。上の文書を選択してコピーしてください。",
      );
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void copy()}
        className="min-h-[32px] rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:brightness-110"
      >
        コピー
      </button>
      {message ? (
        <p role="status" className="text-sm text-ink">
          {message}
        </p>
      ) : null}
    </div>
  );
}

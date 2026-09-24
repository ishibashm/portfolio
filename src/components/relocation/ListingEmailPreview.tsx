"use client";

import { useEffect, useRef, useState } from "react";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";
import { GmailConnectionPanel } from "./GmailConnectionPanel";
import { EmailUrlChoices } from "./EmailUrlChoices";

export function ListingEmailPreview({
  onSelect,
}: {
  onSelect: (url: string) => void;
}) {
  const [source, setSource] = useState("");
  const [format, setFormat] = useState("text");
  const [urls, setUrls] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const clear = () => {
    request.current?.abort();
    request.current = null;
    setSource("");
    setUrls([]);
    setMessage("");
    setBusy(false);
  };
  const preview = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setUrls([]);
    setMessage("");
    try {
      const response = await fetch("/api/relocation/email-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ source, format }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setMessage(
          response.status === 401
            ? "プレビューにはログインが必要です。"
            : "解析できませんでした。形式・サイズを確認するか、通常URLを直接貼り付けてください。",
        );
        return;
      }
      const result = await response.json();
      if (controller.signal.aborted) return;
      const safeUrls = Array.isArray(result.urls)
        ? result.urls
            .filter(
              (url: unknown): url is string =>
                typeof url === "string" &&
                classifyCandidateInput(url).kind === "url",
            )
            .slice(0, 20)
        : [];
      setUrls(safeUrls);
      setSource("");
      setMessage(
        result.truncated
          ? "先頭20件を表示しています。"
          : safeUrls.length
            ? "URLを1件選び、既存入力の「調べる」へ進んでください。"
            : "利用できるURLがありません。通常URLを直接貼り付けてください。",
      );
    } catch {
      if (!controller.signal.aborted)
        setMessage("解析できませんでした。通常URLを直接貼り付けてください。");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <>
      <GmailConnectionPanel onSelect={onSelect} />
      <details
        className="rounded-xl border border-stone-200 p-3 text-xs space-y-2"
        onToggle={(e) => {
          if (!e.currentTarget.open) clear();
        }}
      >
        <summary>自分の通知メールからURLを選ぶ（試験版）</summary>
        <p>
          ログインが必要です。貼り付けた内容をこのサイトで解析します。本文は保存せず、解析成功・クリア・閉じる操作で入力を消します。氏名などを除いたテスト用の内容を使ってください。
        </p>
        <label className="block">
          メールの形式
          <select
            aria-label="メールの形式"
            value={format}
            disabled={busy}
            onChange={(e) => {
              setFormat(e.target.value);
              setUrls([]);
              setMessage("");
            }}
          >
            <option value="text">テキスト</option>
            <option value="html">HTML（hrefのみ）</option>
            <option value="mime">生MIME</option>
          </select>
        </label>
        <label className="block">
          テスト用メール
          <textarea
            aria-label="テスト用メール"
            value={source}
            disabled={busy}
            maxLength={12000}
            autoComplete="off"
            spellCheck={false}
            className="block w-full border rounded p-2"
            onChange={(e) => {
              setSource(e.target.value);
              setUrls([]);
              setMessage("");
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !source.trim()}
          onClick={() => void preview()}
        >
          {busy ? "解析中…" : "URLをプレビュー"}
        </button>{" "}
        <button type="button" onClick={clear}>
          メール入力をクリア
        </button>
        {message && <p role="status">{message}</p>}
        <EmailUrlChoices
          urls={urls}
          onSelect={(url) => {
            onSelect(url);
            clear();
          }}
        />
        <p>
          リンク先・画像は取得しません。メール内の住所は確定情報ではありません。URL選択後も住所入力・地図確認が必要です。
        </p>
      </details>
    </>
  );
}

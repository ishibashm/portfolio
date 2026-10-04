"use client";

import { useEffect, useRef, useState } from "react";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";
import type { ListingDetails } from "@/lib/listingDetails";
import { useGmailEnabled } from "./GmailFeature";
import { GmailConnectionPanel } from "./GmailConnectionPanel";
import { EmailUrlChoices } from "./EmailUrlChoices";

export function ListingEmailPreview({
  onSelect,
}: {
  onSelect: (url: string, details?: ListingDetails) => void;
}) {
  const gmailEnabled = useGmailEnabled();
  const [showGmail, setShowGmail] = useState(false);
  useEffect(() => {
    if (new URL(window.location.href).searchParams.has("emailConnection"))
      setShowGmail(true);
  }, []);
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
      let result;
      if (format === "text") {
        // Load the bounded parser only on demand; plain text needs no mailbox or API.
        const { extractEmailUrls } = await import("@/lib/listingEmailIngest");
        if (controller.signal.aborted) return;
        result = extractEmailUrls(source, "text");
      } else {
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
              ? "この形式のプレビューにはログインが必要です。メール本文をコピーし、テキスト形式で貼り付ければログインなしで使えます。"
              : "解析できませんでした。形式・サイズを確認するか、物件URLを直接貼り付けてください。",
          );
          return;
        }
        result = await response.json();
      }
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
            ? "物件URLを1件選び、上の「調べる」へ進んでください。"
            : "利用できるURLがありません。メール内の物件URLをコピーして上の入力欄に貼るか、住所を入力してください。",
      );
    } catch {
      if (!controller.signal.aborted)
        setMessage(
          "解析できませんでした。物件1件分の短い本文で試してください。メール内の物件URLをコピーして上の入力欄に貼るか、住所を入力してください。",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <>
      <details
        className="rounded-xl border border-stone-200 p-3 text-xs space-y-2"
        onToggle={(e) => {
          if (!e.currentTarget.open) clear();
        }}
      >
        <summary>自分の通知メールからURLを選ぶ（接続不要）</summary>
        <p>
          メール本文のテキストはログイン・メール接続なしで使えます。Gmail以外のメールも、物件の部分をコピーして貼り付けてください。氏名や連絡先は除いてください。
        </p>
        <p>
          {format === "text"
            ? "テキストはこの端末内だけで解析し、送信・保存しません。"
            : "HTML・生MIMEはログインが必要です。貼り付けた内容をこのサイトへ送信して解析します。本文は保存しません。"}
          解析成功・クリア・閉じる操作で入力を消します。
        </p>
        <details>
          <summary>貼り付け形式を変更（通常は不要）</summary>
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
        </details>
        <label className="block">
          メール本文
          <textarea
            aria-label="メール本文"
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
      {gmailEnabled && (
        <div className="rounded-xl border border-stone-200 p-3 text-xs space-y-2">
          <button
            type="button"
            aria-expanded={showGmail}
            onClick={() => setShowGmail((shown) => !shown)}
            className="min-h-[32px] font-semibold text-stone-600 underline"
          >
            Gmailの物件通知をまとめて取り込む（任意）
          </button>
          {showGmail && <GmailConnectionPanel onSelect={onSelect} />}
        </div>
      )}
    </>
  );
}

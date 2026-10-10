"use client";

import { useEffect, useRef, useState } from "react";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";
import type { EmailListing, ListingDetails } from "@/lib/listingDetails";
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
  const [listings, setListings] = useState<EmailListing[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const clear = () => {
    request.current?.abort();
    request.current = null;
    setSource("");
    setUrls([]);
    setListings([]);
    setMessage("");
    setBusy(false);
  };
  const preview = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setUrls([]);
    setListings([]);
    setMessage("");
    try {
      let result;
      if (format === "text") {
        // Load the bounded parser only on demand; plain text needs no mailbox or API.
        const { extractEmailListings } =
          await import("@/lib/listingEmailDetails");
        if (controller.signal.aborted) return;
        result = extractEmailListings(source, "text");
        setListings(result.listings);
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
      setMessage(
        result.truncated
          ? "先頭20件を表示しています。"
          : safeUrls.length
            ? "物件を1件選んでください。住所が読み取れた場合は住所検索へ進みます。住所がなければ上の入力欄に住所を入力してください。"
            : "利用できるURLがありません。本文は残してあります。メール内の物件URLか住所をコピーして、上の入力欄に貼り付けてください。",
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
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          自分の通知メールからURLを選ぶ（接続不要）
        </summary>
        <p>
          メール本文のテキストはログイン・メール接続なしで使えます。Gmail以外のメールも、物件の部分をコピーして貼り付けてください。氏名や連絡先は除いてください。
        </p>
        <p>
          {format === "text"
            ? "テキストはこの端末内だけで解析し、送信・保存しません。"
            : "HTML・生MIMEはログインが必要です。貼り付けた内容をこのサイトへ送信して解析します。本文は保存しません。"}
          住所付きの候補を選んだとき・クリア・閉じる操作で入力を消します。住所を読み取れない場合は、転記できるよう本文を残します。
        </p>
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            貼り付け形式を変更（通常は不要）
          </summary>
          <label className="block">
            メールの形式
            <select
              aria-label="メールの形式"
              className="ml-2 min-h-11 max-w-full rounded-lg border border-stone-300 bg-white px-2 text-base sm:text-sm"
              value={format}
              disabled={busy}
              onChange={(e) => {
                setFormat(e.target.value);
                setUrls([]);
                setListings([]);
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
            className="block min-h-32 w-full border border-stone-300 rounded-lg p-2 text-base sm:text-sm"
            onChange={(e) => {
              setSource(e.target.value);
              setUrls([]);
              setListings([]);
              setMessage("");
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !source.trim()}
            onClick={() => void preview()}
            className="min-h-11 rounded-lg bg-stone-800 px-3 py-2 text-sm font-bold text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "解析中…" : "URLをプレビュー"}
          </button>
          <button
            type="button"
            onClick={clear}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            メール入力をクリア
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        <EmailUrlChoices
          urls={urls}
          listings={listings}
          onSelect={(url) => {
            const listing = listings.find((item) => item.url === url);
            if (listing) {
              const { url: selectedUrl, ...details } = listing;
              onSelect(selectedUrl, details);
            } else onSelect(url);
            if (listing?.address) clear();
            else {
              setUrls([]);
              setListings([]);
              setMessage(
                "URLを選びました。住所は読み取れなかったため本文を残しています。物件の住所をコピーし、上の入力欄に貼り付けてください。転記が済んだら「メール入力をクリア」で本文を消せます。",
              );
            }
          }}
        />
        <p>
          リンク先・画像は取得しません。物件名・賃料・住所は読み取れた場合だけ表示します。住所付きの候補を選ぶと、国土地理院などの検索サービスに住所を送って検索します。メール内の住所は確定情報ではないため、地図で所在地を確認してください。
        </p>
      </details>
      {gmailEnabled && (
        <div className="rounded-xl border border-stone-200 p-3 text-xs space-y-2">
          <button
            type="button"
            aria-expanded={showGmail}
            onClick={() => setShowGmail((shown) => !shown)}
            className="min-h-11 text-left font-semibold text-stone-600 underline"
          >
            Gmailの物件通知をまとめて取り込む（任意）
          </button>
          {showGmail && <GmailConnectionPanel onSelect={onSelect} />}
        </div>
      )}
    </>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listingDetailsSchema,
  type EmailListing,
  type ListingDetails,
} from "@/lib/listingDetails";
import { z } from "zod";
import { classifyCandidateInput } from "@/lib/listingCandidateInput";
import { useGmailEnabled } from "./GmailFeature";
import { EmailUrlChoices } from "./EmailUrlChoices";
const connectionSchema = z.object({
  id: z.uuid(),
  labelId: z.string().nullable(),
  startedAt: z.iso.datetime(),
});
type Connection = z.infer<typeof connectionSchema>;
class RequestError extends Error {}
async function api(path: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(`/api/relocation/email/gmail/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json();
  if (signal.aborted) throw new RequestError("ABORTED");
  if (!response.ok)
    throw new RequestError(
      typeof result.code === "string" ? result.code : "UNAVAILABLE",
    );
  return result;
}
/**
 * 失敗の理由ごとの文言。以前は下の 3 つ以外をすべて「処理できませんでした。
 * 接続状態を確認して…」に丸めていて、**サイト側の設定が済んでいない**
 * （GMAIL_CONFIG）場合も利用者には「接続状態を確認して」と読めた。本人が
 * 何度押し直しても直らない失敗を、本人の操作の問題に見せていた。
 *
 * コードはサーバーが返す固定の文字列（秘密も入力も含まない）なので、知らない
 * ものは末尾にそのまま添える。問い合わせのときに何が起きたかが分かる。
 */
function failureMessage(code: string): string {
  switch (code) {
    case "GMAIL_RECONNECT":
      return "Gmailの認証が失効しました。再接続してください。";
    case "LOGIN_REQUIRED":
      return "Gmail接続にはログインが必要です。";
    case "INVALID_CURSOR":
      return "取り込みの続きが期限切れです。ラベルを確認し、最初から取り込んでください。";
    case "GMAIL_CONFIG":
      return "サイト側のGmail接続の設定が済んでいないため、接続できません。押し直しても直りません（運営側で設定します）。（コード: GMAIL_CONFIG）";
    case "ORIGIN":
      return "このサイトのアドレス（cloud-palette.com）で開いた頁からだけ接続できます。頁を開き直してください。";
    case "RATE_LIMIT":
      return "操作が続きすぎています。1分ほど待ってからお試しください。";
    case "GMAIL_UNAVAILABLE":
      return "Gmailに接続できませんでした。時間をおいてお試しください。";
    default:
      return `処理できませんでした。時間をおいてもう一度お試しください。（コード: ${code}）`;
  }
}
export function GmailConnectionPanel({
  onSelect,
}: {
  onSelect: (url: string, details?: ListingDetails) => void;
}) {
  const enabled = useGmailEnabled();
  return enabled ? <EnabledGmailPanel onSelect={onSelect} /> : null;
}
function EnabledGmailPanel({
  onSelect,
}: {
  onSelect: (url: string, details?: ListingDetails) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [labelAttempt, setLabelAttempt] = useState(0);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const [labelId, setLabelId] = useState("");
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [reconnect, setReconnect] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [listings, setListings] = useState<EmailListing[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const action = useRef<AbortController | null>(null);
  const disconnectButton = useRef<HTMLButtonElement | null>(null);
  const selected = connections.find((c) => c.id === id);
  const fail = useCallback((error: unknown) => {
    const code = error instanceof RequestError ? error.message : "UNAVAILABLE";
    if (code === "GMAIL_DISABLED") {
      setHidden(true);
      setUrls([]);
      setListings([]);
    }
    if (code === "LOGIN_REQUIRED") {
      setLoginRequired(true);
      setConnections([]);
      setId("");
      setLabels([]);
      setChoosing(false);
      setConfirmDisconnect(false);
      setAuthorizationUrl("");
      setUrls([]);
      setListings([]);
    }
    if (code === "GMAIL_RECONNECT") {
      setReconnect(true);
      setUrls([]);
      setListings([]);
      setCursor(null);
    }
    if (code === "INVALID_CURSOR") {
      setCursor(null);
      setDone(true);
    }
    setMessage(failureMessage(code));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void api("status", controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        const rows = z
          .object({ connections: z.array(connectionSchema) })
          .parse(result).connections;
        const url = new URL(window.location.href);
        const callbackId = url.searchParams.get("emailConnection");
        const chosen = rows.find((c) => c.id === callbackId) ?? rows[0];
        setConnections(rows);
        setId(chosen?.id ?? "");
        setChoosing(!!chosen && chosen.labelId === null);
        if (callbackId) {
          url.searchParams.delete("emailConnection");
          window.history.replaceState(
            window.history.state,
            "",
            url.pathname + url.search + url.hash,
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      action.current?.abort();
    };
  }, [fail]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLabelsLoading(true);
    setLabels([]);
    setLabelId("");
    void api(`labels?connectionId=${encodeURIComponent(id)}`, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        const rows = z
          .object({
            labels: z.array(z.object({ id: z.string(), name: z.string() })),
          })
          .parse(result).labels;
        setLabels(rows);
        setLabelId(rows.find((l) => l.name === "物件通知")?.id ?? "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLabelsLoading(false);
      });
    return () => controller.abort();
  }, [id, fail, labelAttempt]);
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (action.current) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true);
    setMessage("");
    try {
      await operation(controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) fail(e);
    } finally {
      if (action.current === controller) {
        action.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  };
  const resetPreview = () => {
    setUrls([]);
    setListings([]);
    setCursor(null);
    setDone(false);
  };
  if (hidden) return null;
  const disabled =
    busy ||
    loading ||
    (choosing && labelsLoading) ||
    loginRequired ||
    confirmDisconnect;
  return (
    <section
      aria-label="Gmail接続"
      className="rounded-xl border border-stone-200 p-3 space-y-2 text-xs"
    >
      <h3 className="font-bold">Gmailから物件通知を取り込む</h3>
      <p>
        接続状態:{" "}
        {loading
          ? "確認中"
          : reconnect
            ? "再接続が必要"
            : selected
              ? selected.labelId
                ? "接続済み"
                : "接続済み・ラベル未確定"
              : "未接続"}
      </p>
      <p>OAuth同意画面がTestingモードの場合、7日ごとに再接続が必要です。</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          void run(async (signal) => {
            const result = await api("connect", signal, {});
            const url = new URL(
              z.object({ authorizationUrl: z.string() }).parse(result)
                .authorizationUrl,
            );
            if (
              url.origin !== "https://accounts.google.com" ||
              url.pathname !== "/o/oauth2/v2/auth" ||
              url.username ||
              url.password
            )
              throw new RequestError("INVALID_URL");
            setAuthorizationUrl(url.toString());
          })
        }
      >
        {reconnect ? "Gmailに再接続" : "Gmailと接続"}
      </button>
      {authorizationUrl && !confirmDisconnect && (
        <a
          href={authorizationUrl}
          rel="noreferrer"
          referrerPolicy="no-referrer"
          className="block underline"
        >
          Googleの認可画面へ進む
        </a>
      )}
      {connections.length > 1 && (
        <label className="block">
          接続を選択
          <select
            aria-label="接続を選択"
            value={id}
            disabled={disabled}
            onChange={(e) => {
              const c = connections.find((item) => item.id === e.target.value);
              setId(e.target.value);
              setChoosing(c?.labelId === null);
              setReconnect(false);
              setMessage("");
              resetPreview();
            }}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.startedAt} /{" "}
                {(c.id === id
                  ? labels.find((l) => l.id === c.labelId)?.name
                  : null) ??
                  c.labelId ??
                  "ラベル未確定"}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <>
          {!choosing && (
            <p>
              対象ラベル:{" "}
              {labels.find((l) => l.id === selected.labelId)?.name ??
                selected.labelId}{" "}
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setChoosing(true);
                  resetPreview();
                }}
              >
                ラベルを確認・変更
              </button>
            </p>
          )}
          {choosing && (
            <div>
              <p>
                Gmailで本人専用ラベル「物件通知」を作成してください。選択候補が表示されても、確定するまで取り込みません。
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setLabelAttempt((n) => n + 1)}
              >
                ラベルを再読み込み
              </button>
              <label>
                通知ラベル
                <select
                  aria-label="通知ラベル"
                  value={labelId}
                  disabled={disabled}
                  onChange={(e) => setLabelId(e.target.value)}
                >
                  <option value="">ラベルを選択してください</option>
                  {labels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={disabled || !labelId || reconnect}
                onClick={() =>
                  void run(async (signal) => {
                    const result = await api("select-label", signal, {
                      connectionId: id,
                      labelId,
                    });
                    const value = z
                      .object({
                        selected: z.object({
                          connectionId: z.literal(id),
                          labelId: z.string(),
                          startedAt: z.iso.datetime(),
                        }),
                      })
                      .parse(result).selected;
                    setConnections((rows) =>
                      rows.map((c) =>
                        c.id === id
                          ? {
                              ...c,
                              labelId: value.labelId,
                              startedAt: value.startedAt,
                            }
                          : c,
                      ),
                    );
                    setChoosing(false);
                    resetPreview();
                    setMessage(
                      "ラベルを確定しました。この時刻以降の通知が対象です。",
                    );
                  })
                }
              >
                このラベルで確定
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={disabled || reconnect || choosing || !selected.labelId}
            onClick={() =>
              void run(async (signal) => {
                const result = await api("read", signal, {
                  connectionId: id,
                  labelId: selected.labelId,
                  startedAt: selected.startedAt,
                  maxMessages: 20,
                  cursor: done ? null : cursor,
                });
                const data = z
                  .object({
                    urls: z.array(z.string()).max(20),
                    listings: z
                      .array(listingDetailsSchema.extend({ url: z.string() }))
                      .max(20)
                      .optional(),
                    nextCursor: z.uuid().nullable(),
                    truncated: z.boolean(),
                  })
                  .parse(result);
                const next = data.urls.flatMap((url) => {
                  const value = classifyCandidateInput(url);
                  return value.kind === "url" ? [value.url] : [];
                });
                setUrls((previous) =>
                  [...new Set([...(done ? [] : previous), ...next])].slice(
                    -200,
                  ),
                );
                setListings((previous) => {
                  const merged = new Map(
                    (done ? [] : previous).map((l) => [l.url, l]),
                  );
                  for (const item of data.listings ?? [])
                    if (next.includes(item.url)) merged.set(item.url, item);
                  return [...merged.values()].slice(-200);
                });
                setCursor(data.nextCursor);
                setDone(data.nextCursor === null);
                setMessage(
                  data.truncated
                    ? "URL表示に上限があります。表示されたURLから選んでください。"
                    : next.length
                      ? "URLを1件選び、既存入力の「調べる」へ進んでください。"
                      : "このページには利用できるURLがありません。",
                );
              })
            }
          >
            {cursor ? "続きを取り込む" : done ? "最初から取り込む" : "取り込み"}
          </button>
          <button
            type="button"
            disabled={disabled}
            ref={disconnectButton}
            onClick={() => setConfirmDisconnect(true)}
          >
            Gmailを切断
          </button>
        </>
      )}
      {confirmDisconnect && (
        <div
          role="alertdialog"
          aria-labelledby="gmail-disconnect-title"
          className="border rounded p-3"
        >
          <p id="gmail-disconnect-title">Gmail接続を切断しますか？</p>
          <p>
            接続情報と取り込みの続きは削除されます。保存済みの候補は残ります。
          </p>
          <button
            type="button"
            disabled={busy}
            autoFocus
            onClick={() => {
              setConfirmDisconnect(false);
              disconnectButton.current?.focus();
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async (signal) => {
                let revokeFailed = false;
                try {
                  await api("disconnect", signal, { connectionId: id });
                } catch (e) {
                  if (
                    !(e instanceof RequestError) ||
                    e.message !== "GMAIL_REVOKE_FAILED_LOCAL_DELETED"
                  )
                    throw e;
                  revokeFailed = true;
                }
                if (signal.aborted) return;
                const remaining = connections.filter((c) => c.id !== id);
                setConnections(remaining);
                setId(remaining[0]?.id ?? "");
                setAuthorizationUrl("");
                setChoosing(remaining[0]?.labelId === null);
                setReconnect(false);
                setConfirmDisconnect(false);
                resetPreview();
                setMessage(
                  revokeFailed
                    ? "このサイトの接続情報は削除しました。Google側の失効を確認できないため、Googleアカウントでもアクセスを取り消してください。"
                    : "Gmailを切断しました。",
                );
              })
            }
          >
            切断を確定
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <EmailUrlChoices
        urls={urls}
        listings={listings}
        onSelect={(url) => {
          const item = listings.find((l) => l.url === url);
          const details = item
            ? listingDetailsSchema.parse(
                Object.fromEntries(
                  Object.entries(item).filter(([key]) => key !== "url"),
                ),
              )
            : undefined;
          onSelect(url, details);
          setUrls([]);
          setListings([]);
        }}
      />
      <p>
        メール本文は保存しません。物件情報はメールからの推測です。選択した1件の住所を検索し、地図での位置確認後に保存します。
      </p>
    </section>
  );
}

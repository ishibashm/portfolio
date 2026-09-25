"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listingDetailsSchema,
  type ListingDetails,
  type EmailListing,
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
/*
  ボタンに見た目が無く、「取り込みGmailを切断」のように地の文と続けて
  読めていた（利用者の指摘、2026-09-25）。役割ごとに 3 種に分ける。
*/
const BTN =
  "min-h-[32px] px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed";
const PRIMARY = `${BTN} bg-stone-800 text-white hover:bg-stone-700`;
const SECONDARY = `${BTN} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`;
const DANGER = `${BTN} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`;
const SELECT =
  "min-h-[32px] px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs";

/** 取り込みの起点（ラベルを確定した時刻の 7 日前）を日本時間で。 */
function startedLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
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
  const prevChoosingRef = useRef(choosing);
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
    }
    if (code === "GMAIL_RECONNECT") {
      setReconnect(true);
      setUrls([]);
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
    const wasChoosingBefore = prevChoosingRef.current;
    prevChoosingRef.current = choosing;
    if (!id) return;
    const needsFetch = labels.length === 0;
    if (!needsFetch && !choosing) return;
    if (!choosing && wasChoosingBefore) return;
    const controller = new AbortController();
    if (choosing && needsFetch) {
      setLabelsLoading(true);
    }
    if (needsFetch) {
      void api(
        `labels?connectionId=${encodeURIComponent(id)}`,
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          const rows = z
            .object({
              labels: z.array(z.object({ id: z.string(), name: z.string() })),
            })
            .parse(result).labels;
          setLabels(rows);
          if (choosing) {
            setLabelId(rows.find((l) => l.name === "物件通知")?.id ?? "");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) fail(e);
        })
        .finally(() => {
          if (!controller.signal.aborted && choosing) setLabelsLoading(false);
        });
    } else if (choosing && !labelId) {
      setLabelId(labels.find((l) => l.name === "物件通知")?.id ?? "");
    }
    return () => controller.abort();
  }, [id, choosing, fail, labelAttempt, labels, labelId]);
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
    busy || loading || labelsLoading || loginRequired || confirmDisconnect;
  return (
    <section
      aria-label="Gmail接続"
      className="rounded-xl border border-stone-200 p-3 space-y-3 text-xs"
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
        className={selected && !reconnect ? SECONDARY : PRIMARY}
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
          className={`${PRIMARY} inline-block`}
        >
          Googleの認可画面へ進む
        </a>
      )}
      {connections.length > 1 && (
        <label className="flex flex-col gap-1">
          接続を選択
          <select
            aria-label="接続を選択"
            className={SELECT}
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
                {c.startedAt} / {c.labelId ?? "ラベル未確定"}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <>
          {!choosing && selected.labelId && (
            <div className="space-y-1">
              <p>
                対象ラベル:{" "}
                <span className="font-bold">
                  {labels.find((l) => l.id === selected.labelId)?.name ??
                    selected.labelId}
                </span>{" "}
                <button
                  type="button"
                  disabled={disabled}
                  className={`${SECONDARY} ml-1`}
                  onClick={() => {
                    setChoosing(true);
                    resetPreview();
                  }}
                >
                  ラベルを確認・変更
                </button>
              </p>
              {/*
                取り込めるのは startedAt（ラベルを確定した時刻の 7 日前）より
                **後に届いた**メールだけ（reader が after: と internalDate で
                切る）。画面のどこにも書いておらず、「取り込み」を押しても
                0 件の理由が分からなかった（利用者の指摘、2026-09-25）
              */}
              <p className="text-stone-600">
                読むのは、{startedLabel(selected.startedAt)}
                以降に届き、このラベルが付いたメールだけです。それより前のメールは読みません。
              </p>
            </div>
          )}
          {choosing && (
            <div>
              <p>
                Gmailで本人専用ラベル「物件通知」を作成してください。選択候補が表示されても、確定するまで取り込みません。
              </p>
              <p className="text-stone-600">
                確定した時点の7日前から後に届いた、このラベルのメールを読みます。先にGmailで既存の通知にラベルを付けてから確定してください。「フィルタを作成」で物件サイトからの通知に自動でラベルが付くようにしておくと、以後の通知もそのまま対象になります。
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  className={SECONDARY}
                  onClick={() => setLabelAttempt((n) => n + 1)}
                >
                  ラベルを再読み込み
                </button>
                <label className="flex flex-col gap-1">
                  通知ラベル
                  <select
                    aria-label="通知ラベル"
                    className={SELECT}
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
                  className={PRIMARY}
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
                        "ラベルを確定しました。7日前から後に届いた通知が対象です。",
                      );
                    })
                  }
                >
                  このラベルで確定
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || reconnect || choosing || !selected.labelId}
              className={PRIMARY}
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
                        : `${startedLabel(selected.startedAt)} 以降に届いた、このラベルのメールからは URL が見つかりませんでした。それより前のメールは読みません。`,
                  );
                })
              }
            >
              {cursor
                ? "続きを取り込む"
                : done
                  ? "最初から取り込む"
                  : "取り込み"}
            </button>
            <button
              type="button"
              disabled={disabled}
              ref={disconnectButton}
              className={DANGER}
              onClick={() => setConfirmDisconnect(true)}
            >
              Gmailを切断
            </button>
          </div>
        </>
      )}
      {confirmDisconnect && (
        <div
          role="alertdialog"
          aria-labelledby="gmail-disconnect-title"
          className="border border-rose-200 rounded-lg p-3 space-y-2"
        >
          <p id="gmail-disconnect-title">Gmail接続を切断しますか？</p>
          <p>
            接続情報と取り込みの続きは削除されます。保存済みの候補は残ります。
          </p>
          <button
            type="button"
            disabled={busy}
            className={`${SECONDARY} mr-2`}
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
            className={DANGER}
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
      {message && (
        <p role="status" className="font-bold text-stone-800">
          {message}
        </p>
      )}
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
      <p className="text-stone-500">
        メール本文は保存しません。物件情報はメールからの推測です。選択した1件の住所を検索し、地図での位置確認後に保存します。
      </p>
    </section>
  );
}

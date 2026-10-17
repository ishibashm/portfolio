"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { McpConnectionsView } from "@/lib/mcpConnectionViews";

const profileId = z.string().min(1).max(512);
const date = z.iso.datetime();
const pageSchema: z.ZodType<McpConnectionsView> = z.object({
  connections: z
    .array(
      z.object({
        id: z.uuid(),
        clientId: z.string().min(1).max(512),
        clientName: z.string().min(1).max(200),
        allowedProfileIds: z.array(profileId).min(1).max(100),
        profiles: z
          .array(
            z.object({
              id: profileId,
              name: z.string().min(1).max(100).nullable(),
            }),
          )
          .max(100),
        scope: z.literal("read:profiles"),
        memoryScopes: z
          .array(z.enum(["read:memory", "write:memory"]))
          .max(2)
          .optional(),
        createdAt: date,
        expiresAt: date,
        lastUsedAt: date.nullable(),
        revokedAt: date.nullable(),
        status: z.enum(["active", "expired", "revoked"]),
      }),
    )
    .max(100),
  nextCursor: z.uuid().nullable(),
});
type Mutation =
  | { action: "revokeAll" }
  | { action: "revoke"; connectionId: string }
  | { action: "reduceProfiles"; connectionId: string; profileIds: string[] };
const endpoint = "/api/mcp/connections";
const failure =
  "接続情報を確認できませんでした。操作が一部完了している場合があります。再読み込みして状態を確認してください。";
const button =
  "rounded border border-stone-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";

function Connection({
  connection,
  busy,
  mutate,
}: {
  connection: McpConnectionsView["connections"][number];
  busy: boolean;
  mutate: (input: Mutation) => void;
}) {
  const [selected, setSelected] = useState(connection.allowedProfileIds);
  const [confirm, setConfirm] = useState(false);
  const active = connection.status === "active";
  return (
    <section
      aria-label={`${connection.clientName} (${connection.id})`}
      className="space-y-3 rounded border border-stone-300 p-4"
    >
      <h2 className="font-bold">{connection.clientName}</h2>
      <p className="break-all">接続ID: {connection.id}</p>
      <p>
        記憶の権限:{" "}
        {connection.memoryScopes?.length
          ? connection.memoryScopes.join(" / ")
          : "なし"}
        （変更する場合は接続を解除して再同意してください）
      </p>
      <p className="break-all">クライアントID: {connection.clientId}</p>
      <p>
        状態:{" "}
        {
          { active: "有効", expired: "期限切れ", revoked: "解除済み" }[
            connection.status
          ]
        }
      </p>
      <dl>
        <dt>接続日</dt>
        <dd>
          <time dateTime={connection.createdAt}>{connection.createdAt}</time>
        </dd>
        <dt>有効期限</dt>
        <dd>
          <time dateTime={connection.expiresAt}>{connection.expiresAt}</time>
        </dd>
        <dt>最終利用</dt>
        <dd>{connection.lastUsedAt ?? "記録なし"}</dd>
      </dl>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (selected.length === 0) {
            setConfirm(true);
            return;
          }
          mutate({
            action: "reduceProfiles",
            connectionId: connection.id,
            profileIds: selected,
          });
        }}
      >
        <fieldset disabled={busy || !active} className="space-y-2">
          <legend>読み取りを許可しているプロフィール</legend>
          {connection.profiles.map((p) => (
            <label key={p.id} className="flex items-start gap-2 break-all">
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, p.id]
                      : selected.filter((id) => id !== p.id),
                  )
                }
              />
              <span>
                {p.name ?? "削除済み・名称を確認できないプロフィール"}（ID:{" "}
                {p.id}）
              </span>
            </label>
          ))}
          {!connection.profiles.length && (
            <p>許可中のプロフィールはありません。</p>
          )}
          <button
            className={button}
            type="submit"
            disabled={selected.length === connection.allowedProfileIds.length}
          >
            {selected.length === 0
              ? "すべて外して接続を解除する"
              : "選択した範囲に縮小する"}
          </button>
        </fieldset>
      </form>
      <p>
        取り除いたプロフィールを再び許可するには、AIから接続をやり直してください。すべて外す場合は、確認後に接続自体を解除します。
      </p>
      {confirm ? (
        <div role="group" aria-label="この接続の解除確認">
          <p>この接続の読み取り許可を解除します。</p>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              mutate({ action: "revoke", connectionId: connection.id })
            }
          >
            解除を実行する
          </button>{" "}
          <button
            className={button}
            disabled={busy}
            onClick={() => {
              setConfirm(false);
              setSelected(connection.allowedProfileIds);
            }}
          >
            キャンセル
          </button>
        </div>
      ) : (
        <button
          className={button}
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          {connection.status === "revoked"
            ? "解除の後処理を再試行する"
            : "この接続を解除する"}
        </button>
      )}
    </section>
  );
}

/** Dormant UI: no app page imports this until the release gates are complete.
 * Same-origin Cookie requests go to the canonical Node management adapter.
 * No token, profile inputs, local storage, analytics, or client-side login bypass. */
export function McpConnectionsPanel() {
  const [page, setPage] = useState<McpConnectionsView | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);

  async function perform(after?: string, mutation?: Mutation) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const options: RequestInit = {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      };
      if (mutation) {
        const response = await fetch(endpoint, {
          ...options,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-MCP-Management": "1",
          },
          body: JSON.stringify(mutation),
        });
        if (!response.ok) throw new Error();
        const schema =
          mutation.action === "reduceProfiles"
            ? z.object({ updated: z.literal(true) })
            : z.object({ revoked: z.literal(true) });
        schema.parse(await response.json());
      }
      // Start again after every mutation; stale scopes/confirmations never survive.
      const response = await fetch(
        `${endpoint}${after ? `?after=${encodeURIComponent(after)}` : ""}`,
        options,
      );
      if (!response.ok) throw new Error();
      const value = pageSchema.parse(await response.json());
      if (
        value.connections.some(
          (c) =>
            new Set(c.allowedProfileIds).size !== c.allowedProfileIds.length ||
            c.profiles.length !== c.allowedProfileIds.length ||
            c.profiles.some((p, i) => p.id !== c.allowedProfileIds[i]),
        )
      )
        throw new Error();
      if (request.current !== controller) return;
      setPage(value);
      setRevision((v) => v + 1);
      setConfirmAll(false);
      setMessage(
        mutation
          ? "操作後の状態を読み込みました。"
          : "接続情報を読み込みました。",
      );
    } catch {
      if (request.current !== controller) return;
      setPage(null);
      setConfirmAll(false);
      setError(failure);
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    void perform();
    return () => {
      const current = request.current;
      request.current = null;
      current?.abort();
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-5 text-stone-900">
      <h1 className="text-xl font-bold">AIとの接続を管理する</h1>
      <p>
        権限 read:profiles
        は、選択したクラウド保存プロフィールの名前・設定・計算結果を接続先のAIへ送ります。AIが入力値の返却を明示的に要求すると、生年月日と出発地の座標も渡ります。AIの会話に情報が残る場合があります。
      </p>
      <p>
        新しいプロフィールは自動で共有されません。端末内だけのプロフィールや未同期の設定は使えません。
      </p>
      <p>
        通常のログアウトでは接続は解除されません。解除しても、既にAIへ渡った情報は回収できません。
      </p>
      <p>日時はUTC（末尾のZ）で表示します。接続の有効期間は最大30日です。</p>
      <p role="status" aria-live="polite">
        {busy ? "読み込み・処理中…" : message}
      </p>
      {error && (
        <p role="alert">
          {error} ログインが切れている場合は、
          <a className="underline" href="/login">
            ログイン
          </a>
          してください。
        </p>
      )}
      <button className={button} disabled={busy} onClick={() => void perform()}>
        最初から再読み込み
      </button>
      {page && (
        <div aria-busy={busy} className="space-y-4">
          {!page.connections.length && <p>このページに接続はありません。</p>}
          {page.connections.map((connection) => (
            <Connection
              key={`${revision}:${connection.id}`}
              connection={connection}
              busy={busy}
              mutate={(input) => void perform(undefined, input)}
            />
          ))}
          {page.nextCursor && (
            <button
              className={button}
              disabled={busy}
              onClick={() => void perform(page.nextCursor!)}
            >
              次の100件を表示する
            </button>
          )}
          {confirmAll ? (
            <div role="group" aria-label="すべての接続の解除確認">
              <p>別ページを含むすべての接続を解除します。続けますか？</p>
              <button
                className={button}
                disabled={busy}
                onClick={() => void perform(undefined, { action: "revokeAll" })}
              >
                すべての解除を実行する
              </button>{" "}
              <button
                className={button}
                disabled={busy}
                onClick={() => setConfirmAll(false)}
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              className={button}
              disabled={busy}
              onClick={() => setConfirmAll(true)}
            >
              すべての接続を解除する
            </button>
          )}
        </div>
      )}
    </main>
  );
}

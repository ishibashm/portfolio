"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Note = {
  id: string;
  revision: number;
  title: string;
  text: string;
  category: string;
};
type Tool = {
  name: string;
  description?: string;
  inputSchema: unknown;
  annotations?: { readOnlyHint?: boolean };
};
type History = {
  requestId: string;
  grantId: string;
  event: string;
  result: string;
  occurredAt: string;
  durationMs: number;
};
async function request(body: unknown) {
  const response = await fetch("/api/mcp/workspace", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Mcp-Management": "1" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "ログインしてください。"
        : response.status === 429
          ? "呼び出しが多いため、少し待ってください。"
          : "処理できませんでした。再読込して確認してください。",
    );
  return value;
}
export function WorkspacePanel({
  consoleEnabled,
  memoryEnabled,
  initialTab = "console",
}: {
  consoleEnabled: boolean;
  memoryEnabled: boolean;
  initialTab?: "console" | "memory";
}) {
  const [tab, setTab] = useState<string>(initialTab);
  const [personal, setPersonal] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const [name, setName] = useState("");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [raw, setRaw] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("other");
  const [history, setHistory] = useState<History[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Private data stays in component memory; hide clears it, including bfcache navigation.
  useEffect(() => {
    const clear = () => {
      setResult(null);
      setNotes([]);
      setHistory([]);
      setSelected(null);
      setTitle("");
      setText("");
      setArgs("{}");
    };
    const hidden = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", clear);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", clear);
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setResult(null);
      setMessage(
        error instanceof Error ? error.message : "処理できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setNotes((await request({ action: "memory", operation: "list" })).memories);
  }
  function edit(note: Note | null) {
    setSelected(note);
    setTitle(note?.title ?? "");
    setText(note?.text ?? "");
    setCategory(note?.category ?? "other");
  }
  const tool = tools.find((item) => item.name === name);
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">MCPと個人の記憶</h1>
      <p>
        ログインした本人だけが利用できます。実行結果は保存しません。
        <Link href="/login">ログイン</Link> ·{" "}
        <Link href="/profile/connections">AI接続の確認・解除</Link>
      </p>
      <nav className="flex gap-4">
        {consoleEnabled && (
          <>
            <button onClick={() => setTab("console")}>ツール実行</button>
            <button onClick={() => setTab("history")}>AI利用履歴</button>
          </>
        )}
        {memoryEnabled && (
          <button onClick={() => setTab("memory")}>記憶</button>
        )}
      </nav>
      <p role="status">{busy ? "処理中…" : message}</p>
      <fieldset disabled={busy} className="space-y-4">
        {tab === "console" && consoleEnabled && (
          <>
            <label>
              <input
                type="checkbox"
                checked={personal}
                onChange={(e) => {
                  setPersonal(e.target.checked);
                  setTools([]);
                  setName("");
                  setResult(null);
                }}
              />{" "}
              本人のプロフィール・記憶を使う
            </label>
            <button
              onClick={() =>
                run(async () => {
                  const value = await request({ action: "tools", personal });
                  setTools(value.tools);
                  setName(value.tools[0]?.name ?? "");
                })
              }
            >
              ツール一覧を取得
            </button>
            <label className="block">
              ツール{" "}
              <select
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setResult(null);
                }}
              >
                {tools.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <p>{tool?.description}</p>
            <details>
              <summary>入力形式</summary>
              <pre className="overflow-auto">
                {JSON.stringify(tool?.inputSchema, null, 2)}
              </pre>
            </details>
            <label className="block">
              入力JSON
              <textarea
                className="block w-full border p-2"
                rows={7}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </label>
            <button
              disabled={!name}
              onClick={() =>
                run(async () => {
                  let input;
                  try {
                    input = JSON.parse(args);
                  } catch {
                    throw new Error("入力JSONを確認してください。");
                  }
                  if (
                    tool?.annotations?.readOnlyHint === false &&
                    !window.confirm(
                      "この操作は記憶を作成・変更・削除します。実行しますか？",
                    )
                  )
                    return;
                  setResult(null);
                  setResult(
                    await request({
                      action: "call",
                      personal,
                      name,
                      arguments: input,
                    }),
                  );
                })
              }
            >
              実行して応答を見る
            </button>
            {result !== null && (
              <section>
                <label>
                  <input
                    type="checkbox"
                    checked={raw}
                    onChange={(e) => setRaw(e.target.checked)}
                  />{" "}
                  生JSON
                </label>
                <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-all rounded border p-3">
                  {JSON.stringify(result, null, raw ? undefined : 2)}
                </pre>
              </section>
            )}
          </>
        )}
        {tab === "history" && consoleEnabled && (
          <>
            <p>
              過去30日の個人用MCP監査です。入力・応答本文は残りません。接続IDは接続管理で照合できます。安定したID順で50件ずつ表示します。
            </p>
            <button
              onClick={() =>
                run(async () => {
                  const value = await request({ action: "history" });
                  setHistory(value.history);
                  setCursor(value.nextCursor);
                })
              }
            >
              履歴を取得
            </button>
            <ul>
              {history.map((row) => (
                <li key={row.requestId} className="border-b py-2">
                  {new Date(row.occurredAt).toLocaleString("ja-JP")} —{" "}
                  {row.event} / {row.result} / {row.durationMs}ms
                  <br />
                  接続: {row.grantId}
                </li>
              ))}
            </ul>
            {cursor && (
              <button
                onClick={() =>
                  run(async () => {
                    const value = await request({
                      action: "history",
                      after: cursor,
                    });
                    setHistory((rows) => [...rows, ...value.history]);
                    setCursor(value.nextCursor);
                  })
                }
              >
                次の50件
              </button>
            )}
          </>
        )}
        {tab === "memory" && memoryEnabled && (
          <>
            <p>
              本人だけの記憶。最大100件、1件8KiB。保存時は暗号化されます。AIへの読み書きは接続ごとに別の同意が必要です。自動保存はしません。
            </p>
            <button onClick={() => run(reload)}>記憶を読み込む</button>{" "}
            <button onClick={() => edit(null)}>新しい記憶</button>
            <ul>
              {notes.map((note) => (
                <li key={note.id}>
                  <button onClick={() => edit(note)}>{note.title}</button>
                </li>
              ))}
            </ul>
            <label className="block">
              タイトル
              <input
                className="block w-full border p-2"
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              分類
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  ["move", "引越し"],
                  ["family", "家族"],
                  ["direction", "方位"],
                  ["result", "判定メモ"],
                  ["other", "その他"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              本文
              <textarea
                className="block w-full border p-2"
                rows={8}
                maxLength={8000}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button
              disabled={!title.trim()}
              onClick={() =>
                run(async () => {
                  const value = { title, text, category };
                  await request({
                    action: "memory",
                    operation: selected ? "update" : "create",
                    value: selected
                      ? { id: selected.id, revision: selected.revision, value }
                      : value,
                  });
                  edit(null);
                  await reload();
                  setMessage("保存しました。");
                })
              }
            >
              保存
            </button>
            {selected && (
              <button
                onClick={() =>
                  run(async () => {
                    if (!window.confirm("この記憶を削除しますか？")) return;
                    await request({
                      action: "memory",
                      operation: "delete",
                      value: { id: selected.id, revision: selected.revision },
                    });
                    edit(null);
                    await reload();
                  })
                }
              >
                この記憶を削除
              </button>
            )}
            <div className="flex gap-4">
              <button
                onClick={() =>
                  run(async () => {
                    const value = await request({
                      action: "memory",
                      operation: "list",
                    });
                    const url = URL.createObjectURL(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              version: 1,
                              exportedAt: new Date().toISOString(),
                              ...value,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "cloud-palette-memory.json";
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                平文JSONをエクスポート
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    if (
                      !window.confirm(
                        "記憶をすべて削除します。元に戻せません。続けますか？",
                      )
                    )
                      return;
                    await request({ action: "memory", operation: "clear" });
                    edit(null);
                    setNotes([]);
                  })
                }
              >
                全記憶を削除
              </button>
            </div>
            <p>
              エクスポートは暗号化されていないファイルです。削除しても既にAIへ渡した内容や保持期間内のバックアップは回収できません。
            </p>
          </>
        )}
      </fieldset>
    </main>
  );
}

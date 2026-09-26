"use client";

/**
 * 分析を「この端末に残す」「AI に渡す」パネル（利用者の依頼、2026-09-26）。
 *
 * 文書の中身は lib/timingReport が作る（生年月日と座標は入れない）。
 * このパネルは、呼ぶ側が渡す `buildMarkdown` を、押したときにだけ呼ぶ。
 *
 * - この端末に保存 … localStorage（saved_analyses_v1）。「すべて消す」で消える
 * - アカウントに保存 … ログイン中だけ出す。/api/saved-analyses（表は
 *   saved_analyses）。ほかの端末でも読める。「すべて消す」で消える
 *   （利用者の判断、2026-09-26「DB で保存してもいいかな」）
 * - AI に渡す用にコピー … Markdown をクリップボードへ
 * - Markdown で書き出す … .md をダウンロード
 *
 * AI に続きを計算させる口は、サイトの MCP（/api/mcp）。**こちらから AI へは
 * 何も送らない。**AI 側に URL を登録するかどうか、何を伝えるかは本人が決める。
 */

import React, { useEffect, useState, useSyncExternalStore } from "react";
import {
  MCP_URL,
  SAVED_ANALYSES_KEY,
  deleteAnalysis,
  readSavedAnalyses,
  saveAnalysis,
  type SavedAnalysis,
} from "@/lib/timingReport";

/* 保存の一覧は React の外（localStorage）にあるので購読する。
   同じタブで書いたときは自前のイベントで知らせる */
const EVENT = "saved-analyses-updated";
function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SAVED_ANALYSES_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, cb);
  };
}
function snapshot(): string {
  try {
    return window.localStorage.getItem(SAVED_ANALYSES_KEY) ?? "";
  } catch {
    return "";
  }
}

const BTN =
  "min-h-[32px] rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40";
const PRIMARY = `${BTN} bg-stone-800 text-white hover:bg-stone-700`;
const SECONDARY = `${BTN} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`;

function download(name: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * アカウント側の一覧。signedOut は 401（ログインしていない）。
 * それ以外の失敗は error にして、端末の保存はそのまま使えるようにする。
 */
type Cloud =
  | { state: "loading" }
  | { state: "signedOut" }
  | { state: "error" }
  | { state: "ready"; items: SavedAnalysis[] };

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    )
      return body.error;
  } catch {
    /* 本文が JSON でない */
  }
  return fallback;
}

function AnalysisList({
  title,
  items,
  onCopy,
  onDelete,
}: {
  title: string;
  items: SavedAnalysis[];
  onCopy: (a: SavedAnalysis) => void;
  onDelete: (a: SavedAnalysis) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="font-bold text-stone-700">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-stone-200 bg-white p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-stone-800">{a.name}</span>
              <span className="text-stone-500">
                {new Date(a.savedAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </span>
              <button
                type="button"
                onClick={() => onCopy(a)}
                className={SECONDARY}
              >
                コピー
              </button>
              <button
                type="button"
                onClick={() => download(a.name, a.markdown)}
                className={SECONDARY}
              >
                書き出す
              </button>
              <button
                type="button"
                onClick={() => onDelete(a)}
                className={`${BTN} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`}
              >
                削除
              </button>
            </div>
            <details className="mt-1">
              <summary className="cursor-pointer text-stone-600">
                中身を見る
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-[12px] text-stone-800">
                {a.markdown}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SavedAnalysisPanel({
  kind,
  defaultName,
  buildMarkdown,
}: {
  kind: SavedAnalysis["kind"];
  /** 名前の欄の初期値 */
  defaultName: string;
  /** 押したときに文書を作る。まだ作れない（走査前）なら null */
  buildMarkdown: () => string | null;
}) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const saved = raw
    ? readSavedAnalyses(window.localStorage).filter((a) => a.kind === kind)
    : [];
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const ready = buildMarkdown() !== null;
  const [cloud, setCloud] = useState<Cloud>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/saved-analyses?kind=${kind}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 401) return setCloud({ state: "signedOut" });
        if (!res.ok) return setCloud({ state: "error" });
        const body = (await res.json()) as { analyses?: SavedAnalysis[] };
        if (alive) setCloud({ state: "ready", items: body.analyses ?? [] });
      })
      .catch(() => {
        if (alive) setCloud({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch {
      setMessage("コピーできませんでした。書き出し（.md）をお使いください。");
    }
  };

  const onSave = () => {
    const md = buildMarkdown();
    if (!md) return;
    const entry = saveAnalysis(window.localStorage, {
      kind,
      name: name.trim() || defaultName,
      markdown: md,
    });
    window.dispatchEvent(new Event(EVENT));
    setMessage(
      entry
        ? "この端末に保存しました。「すべて消す」で消えます。"
        : "保存できませんでした（端末の容量かプライベートモード）。書き出し（.md）をお使いください。",
    );
  };

  const onSaveCloud = async () => {
    const md = buildMarkdown();
    if (!md) return;
    try {
      const res = await fetch("/api/saved-analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim() || defaultName,
          markdown: md,
        }),
      });
      if (!res.ok) {
        setMessage(await errorText(res, "アカウントに保存できませんでした。"));
        return;
      }
      const body = (await res.json()) as { analysis: SavedAnalysis };
      setCloud((c) =>
        c.state === "ready"
          ? { state: "ready", items: [body.analysis, ...c.items] }
          : c,
      );
      setMessage(
        "アカウントに保存しました。ほかの端末でも見られます。「すべて消す」で消えます。",
      );
    } catch {
      setMessage(
        "アカウントに保存できませんでした。通信の状態をお確かめください。",
      );
    }
  };

  const onDeleteCloud = async (a: SavedAnalysis) => {
    try {
      const res = await fetch(
        `/api/saved-analyses?id=${encodeURIComponent(a.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setMessage(await errorText(res, "削除できませんでした。"));
        return;
      }
      setCloud((c) =>
        c.state === "ready"
          ? { state: "ready", items: c.items.filter((x) => x.id !== a.id) }
          : c,
      );
    } catch {
      setMessage("削除できませんでした。通信の状態をお確かめください。");
    }
  };

  const copyAnalysis = (a: SavedAnalysis) =>
    void copy(a.markdown, "コピーしました。AI の入力欄に貼り付けてください。");

  return (
    <section
      aria-label="分析を残す・AI に渡す"
      className="space-y-3 rounded-2xl border border-stone-200 bg-white/80 p-4 text-xs"
    >
      <h3 className="text-sm font-bold text-stone-800">
        この分析を残す・AI に渡す
      </h3>
      <p className="leading-relaxed text-stone-600">
        方位ごとの最良の段階と次に動ける日を、文書（Markdown）にします。生年月日と住所は入りません（本命星と空亡までです）。
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          名前
          <input
            type="text"
            value={name}
            placeholder={defaultName}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[32px] w-56 rounded-lg border border-stone-300 bg-white px-2 text-xs"
          />
        </label>
        <button
          type="button"
          disabled={!ready}
          onClick={onSave}
          className={PRIMARY}
        >
          この端末に保存
        </button>
        {cloud.state === "ready" && (
          <button
            type="button"
            disabled={!ready}
            onClick={() => void onSaveCloud()}
            className={PRIMARY}
          >
            アカウントに保存
          </button>
        )}
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            const md = buildMarkdown();
            if (md)
              void copy(
                md,
                "コピーしました。AI の入力欄に貼り付けてください。",
              );
          }}
          className={SECONDARY}
        >
          AI に渡す用にコピー
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            const md = buildMarkdown();
            if (md) download(name.trim() || defaultName, md);
          }}
          className={SECONDARY}
        >
          Markdown で書き出す
        </button>
      </div>
      {!ready && <p className="text-stone-500">走査したあとに使えます。</p>}
      {cloud.state === "signedOut" && (
        <p className="text-stone-500">
          ログインすると、アカウントにも保存できます（ほかの端末でも見られます）。
        </p>
      )}
      {cloud.state === "error" && (
        <p className="text-stone-500">
          アカウントに保存した分析を読み込めませんでした。この端末への保存は使えます。
        </p>
      )}
      {message && (
        <p role="status" className="font-bold text-stone-800">
          {message}
        </p>
      )}

      <details className="rounded-lg border border-stone-200 bg-stone-50 p-3">
        <summary className="cursor-pointer font-bold text-stone-700">
          AI に続きを計算させる（MCP）
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed text-stone-600">
          <p>
            Claude・ChatGPT・Codex など MCP に対応した AI に、次の URL
            を登録すると、AI
            がこのサイトと同じ計算（本命星・日取り・八方位の吉凶・市区町村の一覧）を呼べます。登録は
            AI 側の設定（カスタムコネクタ・MCP サーバー）から行います。
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-stone-800">
              {MCP_URL}
            </code>
            <button
              type="button"
              onClick={() => void copy(MCP_URL, "URL をコピーしました。")}
              className={SECONDARY}
            >
              URL をコピー
            </button>
          </p>
          <p>
            このサイトから AI へは何も送りません。生年月日や出発地を AI
            に伝えるかどうかは、ご自身で決めてください。
          </p>
        </div>
      </details>

      {cloud.state === "ready" && (
        <AnalysisList
          title="アカウントに保存した分析"
          items={cloud.items}
          onCopy={copyAnalysis}
          onDelete={(a) => void onDeleteCloud(a)}
        />
      )}
      <AnalysisList
        title="この端末に保存した分析"
        items={saved}
        onCopy={copyAnalysis}
        onDelete={(a) => {
          deleteAnalysis(window.localStorage, a.id);
          window.dispatchEvent(new Event(EVENT));
        }}
      />
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import { directionUnstableNote } from "@/lib/directionDistance";
import { normalizeCandidateUrl } from "@/lib/listingCandidateInput";
type Candidate = {
  id: string;
  url: string | null;
  title: string | null;
  memo: string | null;
  lat: number;
  lon: number;
  direction: string;
  bearingDeg: number;
  createdAt: string;
  updatedAt: string;
  judgment: {
    tier: string;
    blocked: boolean;
    doyouSatsu: boolean;
    approximate: boolean;
    source: string;
    distanceKm: number;
    context: {
      baseLat: string;
      baseLon: string;
      targetDate: string;
      useClassical: boolean;
      directionFilterMode: string;
      tenchusatsuMode: string;
      involuntaryMove: boolean;
    };
  };
};
function CandidateRow({
  candidate: c,
  onUpdate,
  onDelete,
}: {
  candidate: Candidate;
  onUpdate: (c: Candidate) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(c.title ?? "");
  const [memo, setMemo] = useState(c.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const url = c.url && normalizeCandidateUrl(c.url);
  async function mutate(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/relocation/candidates/${c.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PATCH"
          ? { body: JSON.stringify({ title, memo, updatedAt: c.updatedAt }) }
          : {}),
      });
      if (res.status === 204) {
        onDelete(c.id);
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onUpdate(body.candidate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded-xl border p-4">
      <h2 className="font-bold">
        {c.title || `候補 ${new Date(c.createdAt).toLocaleDateString("ja-JP")}`}
      </h2>
      <p>
        保存時: {c.judgment.context.targetDate} ／ {c.direction}（真北{" "}
        {c.bearingDeg.toFixed(1)}°）／{" "}
        {TIER_LABELS[c.judgment.tier as DayTier] ?? c.judgment.tier} ／ 約
        {c.judgment.distanceKm.toFixed(1)}km
      </p>
      {c.judgment.blocked && <p>天中殺により移動を避ける扱いです。</p>}
      {c.judgment.doyouSatsu && <p>土用殺の方位です。</p>}
      {c.judgment.approximate && (
        <p className="text-amber-700">概略位置として確認・保存した候補です。</p>
      )}
      {directionUnstableNote(c.judgment.distanceKm) && (
        <p className="text-amber-700">
          {directionUnstableNote(c.judgment.distanceKm)}
        </p>
      )}
      <details>
        <summary>保存時の位置・条件</summary>
        <p>
          出発地: {c.judgment.context.baseLat}, {c.judgment.context.baseLon} ／
          候補: {c.lat}, {c.lon}
        </p>
        <p>
          {c.judgment.context.useClassical ? "伝統方位" : "均等方位"} ／{" "}
          {c.judgment.context.directionFilterMode} ／ 天中殺:{" "}
          {c.judgment.context.tenchusatsuMode} ／ やむを得ない移動:{" "}
          {c.judgment.context.involuntaryMove ? "はい" : "いいえ"}
        </p>
      </details>
      {url && (
        <a
          className="block underline"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          本人が保存した参照リンクを開く
        </a>
      )}
      <label className="block">
        タイトル
        <input
          className="block w-full rounded border p-2"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block">
        メモ
        <textarea
          className="block w-full rounded border p-2"
          maxLength={1000}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <button
          disabled={busy}
          onClick={() => void mutate("PATCH")}
          className="underline"
        >
          タイトル・メモを更新
        </button>
        <Link
          href={`/relocation/arbitrage?candidate=${c.id}`}
          prefetch={false}
          className="underline"
        >
          現在の条件で再判定・新規保存
        </Link>
        <button
          disabled={busy}
          onClick={() => setDeleting(true)}
          className="text-red-700"
        >
          削除
        </button>
      </div>
      {deleting && (
        <p>
          この候補を削除します。
          <button
            disabled={busy}
            className="mx-3 underline"
            onClick={() => void mutate("DELETE")}
          >
            削除する
          </button>
          <button onClick={() => setDeleting(false)}>戻る</button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
export default function CandidateHistory() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  async function load(next: string | null = null) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/relocation/candidates${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
        { cache: "no-store" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setRows((old) => (next ? [...old, ...body.candidates] : body.candidates));
      setCursor(body.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-4">
      <button onClick={() => void load()} disabled={busy} className="underline">
        一覧を読み直す
      </button>
      {error && <p role="alert">{error}</p>}
      {!busy && !error && !rows.length && <p>保存した候補はありません。</p>}
      {rows.map((c) => (
        <CandidateRow
          key={`${c.id}:${c.updatedAt}`}
          candidate={c}
          onUpdate={(updated) =>
            setRows((old) =>
              old.map((r) => (r.id === updated.id ? updated : r)),
            )
          }
          onDelete={(id) => setRows((old) => old.filter((r) => r.id !== id))}
        />
      ))}
      {busy && <p role="status">読み込み中…</p>}
      {cursor && (
        <button disabled={busy} onClick={() => void load(cursor)}>
          続きを見る
        </button>
      )}
    </div>
  );
}

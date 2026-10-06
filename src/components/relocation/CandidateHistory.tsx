"use client";

/**
 * 保存した候補（/relocation/candidates）の一覧。
 *
 * ## 作り直した理由（利用者の指摘、2026-09-30）
 *
 * 「履歴ページが履歴というにはよくわからない」「ページが陳腐」。中身は
 * 「候補に保存」した物件・地点と、保存したときの方位の判定なのに、
 * 頁は「本人の候補履歴」と名乗り、1 件ずつ文字と下線のリンクを縦に
 * 並べただけだった。方位も判定の内部の鍵（NE など）のまま出ていた。
 *
 * - 1 件を札にする。左の帯と段階の札は地図と同じ段階の色（tierDisplay）
 * - 方位は方位針（真北からの角度）と日本語の方位名で出す
 * - 物件の情報（賃料・間取り…）は小さな札に、注意（天中殺・土用殺・
 *   概略位置・近すぎて方位が定まらない）は色の付いた札に分ける
 * - タイトルとメモの書き換えは「編集」を押したときだけ開く
 * - 上に件数と段階ごとの数、並べ替え（新しい順・段階の良い順・近い順）
 *
 * 取得・更新・削除の API と、保存したときの判定をそのまま出すという
 * 約束は変えていない（再判定は物件検索の頁でする）。
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  MapPin,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { TIER_LABELS, TIER_ORDER, type DayTier } from "@/utils/dayTier";
import { TIER_BADGE_CLASS, TIER_FILL, TIER_JP } from "@/utils/tierDisplay";
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";
import { directionUnstableNote } from "@/lib/directionDistance";
import {
  listingDetailLabels,
  numericListingFields,
  type ListingDetails,
} from "@/lib/listingDetails";
import { normalizeCandidateUrl } from "@/lib/listingCandidateInput";
/* 条件の名前は設定バーと同じ表から（どちらも暦エンジンを引かない葉） */
import {
  DIRECTION_FILTER_MODE_LABELS,
  type DirectionFilterMode,
} from "@/utils/directionFilterMode";
import {
  getTenchusatsuMode,
  isTenchusatsuMode,
} from "@/utils/tenchusatsuPolicy";

export type Candidate = ListingDetails & {
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

export type SortKey = "new" | "tier" | "near";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "new", label: "新しい順" },
  { key: "tier", label: "段階の良い順" },
  { key: "near", label: "近い順" },
];

function isTier(t: string): t is DayTier {
  return (TIER_ORDER as readonly string[]).includes(t);
}

/** 判定の鍵（N / NE …）を日本語の方位名に。知らない値はそのまま */
export function directionLabel(direction: string): string {
  return DIRECTION_LABELS[direction as CompassDirection] ?? direction;
}

/** 並べ替え。段階は S が先、同じ段階なら新しい順。知らない段階は最後 */
export function sortCandidates(rows: Candidate[], key: SortKey): Candidate[] {
  const rank = (c: Candidate) =>
    isTier(c.judgment.tier) ? TIER_ORDER.indexOf(c.judgment.tier) : 99;
  const byNew = (a: Candidate, b: Candidate) =>
    b.createdAt.localeCompare(a.createdAt);
  return [...rows].sort((a, b) => {
    if (key === "tier") return rank(a) - rank(b) || byNew(a, b);
    if (key === "near")
      return a.judgment.distanceKm - b.judgment.distanceKm || byNew(a, b);
    return byNew(a, b);
  });
}

/** 物件の情報の値。数値は桁区切り（118000 → 118,000） */
export function detailValue(
  key: keyof ListingDetails,
  value: ListingDetails[keyof ListingDetails],
): string {
  if (numericListingFields.has(key) && typeof value === "number")
    return value.toLocaleString("ja-JP");
  return String(value);
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });

/** 真北からの角度を指す小さな方位針 */
function Compass({ bearing }: { bearing: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="h-10 w-10 shrink-0"
      role="img"
      aria-label={`真北から ${bearing.toFixed(0)} 度`}
    >
      <circle cx="20" cy="20" r="18" fill="#fff" stroke="#e7e5e4" />
      <text
        x="20"
        y="8.5"
        textAnchor="middle"
        fontSize="6"
        fill="#a8a29e"
        fontWeight="700"
      >
        北
      </text>
      <g transform={`rotate(${bearing} 20 20)`}>
        <path d="M20 9 L24 22 L20 19.5 L16 22 Z" fill="#e11d48" />
        <circle cx="20" cy="20" r="2" fill="#57534e" />
      </g>
    </svg>
  );
}

function CandidateCard({
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
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const url = c.url && normalizeCandidateUrl(c.url);
  const tier = isTier(c.judgment.tier) ? c.judgment.tier : null;
  const unstable = directionUnstableNote(c.judgment.distanceKm);

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
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  const details = (
    Object.entries(listingDetailLabels) as [keyof ListingDetails, string][]
  ).filter(([key]) => c[key] != null);

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
      aria-label={c.title || "候補"}
    >
      <div
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: tier ? TIER_FILL[tier] : "#d6d3d1" }}
        aria-hidden
      />
      <div className="flex flex-1 flex-col gap-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-stone-800">
              {c.title || `候補（${dateOf(c.createdAt)} 保存）`}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {dateOf(c.createdAt)} に保存 ・ 判定の日{" "}
              {c.judgment.context.targetDate}
            </p>
          </div>
          {tier ? (
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${TIER_BADGE_CLASS[tier]}`}
              title={TIER_LABELS[tier]}
            >
              {tier} {TIER_JP[tier]}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-600">
              {c.judgment.tier}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2">
          <Compass bearing={c.bearingDeg} />
          <div className="text-sm">
            <p className="font-bold text-stone-800">
              {directionLabel(c.direction)}
              <span className="ml-1.5 text-xs font-normal text-stone-500">
                真北から {c.bearingDeg.toFixed(1)}°
              </span>
            </p>
            <p className="text-xs text-stone-600">
              出発地から約 {c.judgment.distanceKm.toFixed(1)} km
            </p>
          </div>
        </div>

        {(c.judgment.blocked ||
          c.judgment.doyouSatsu ||
          c.judgment.approximate ||
          unstable) && (
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {c.judgment.blocked && (
              <li className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                天中殺により移動を避ける扱い
              </li>
            )}
            {c.judgment.doyouSatsu && (
              <li className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 font-semibold text-orange-700">
                土用殺の方位
              </li>
            )}
            {c.judgment.approximate && (
              <li className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                概略位置で保存
              </li>
            )}
            {unstable && (
              <li className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                {unstable}
              </li>
            )}
          </ul>
        )}

        {details.length > 0 && (
          <dl className="flex flex-wrap gap-1.5 text-xs">
            {details.map(([key, label]) => (
              <div
                key={key}
                className="rounded-lg border border-stone-200 px-2 py-1"
              >
                <dt className="inline text-stone-500">{label} </dt>
                <dd className="inline font-semibold text-stone-800">
                  {detailValue(key, c[key])}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {c.memo && !editing && (
          <p className="whitespace-pre-wrap rounded-lg bg-amber-50/60 px-3 py-2 text-sm text-stone-700">
            {c.memo}
          </p>
        )}

        {editing && (
          <div className="space-y-2 rounded-xl border border-stone-200 p-3">
            <label className="block text-xs font-semibold text-stone-600">
              タイトル
              <input
                className="mt-1 block w-full rounded-lg border border-stone-300 p-2 text-sm font-normal"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold text-stone-600">
              メモ
              <textarea
                className="mt-1 block w-full rounded-lg border border-stone-300 p-2 text-sm font-normal"
                maxLength={1000}
                rows={3}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate("PATCH")}
                className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                タイトル・メモを更新
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
              >
                やめる
              </button>
            </div>
          </div>
        )}

        <details className="text-xs text-stone-600">
          <summary className="cursor-pointer font-semibold text-stone-500">
            保存したときの位置と条件
          </summary>
          <div className="mt-1 space-y-0.5">
            <p>
              出発地 {c.judgment.context.baseLat}, {c.judgment.context.baseLon}{" "}
              ／ 候補 {c.lat}, {c.lon}
            </p>
            {/* 見方と天中殺の扱いは、保存したときの設定の鍵（composite /
                strict …）がそのまま出ていた。設定バーと同じ日本語に。
                知らない鍵はそのまま出す（古い保存を壊さない）。1 本の
                文字列に組む（JSX の改行は日本語の間に半角空白を入れる） */}
            <p>
              {[
                c.judgment.context.useClassical ? "伝統方位" : "均等方位",
                `見方 ${
                  DIRECTION_FILTER_MODE_LABELS[
                    c.judgment.context
                      .directionFilterMode as DirectionFilterMode
                  ] ?? c.judgment.context.directionFilterMode
                }`,
                `天中殺 ${
                  isTenchusatsuMode(c.judgment.context.tenchusatsuMode)
                    ? getTenchusatsuMode(c.judgment.context.tenchusatsuMode)
                        .label
                    : c.judgment.context.tenchusatsuMode
                }`,
                `やむを得ない移動 ${c.judgment.context.involuntaryMove ? "はい" : "いいえ"}`,
              ].join(" ／ ")}
            </p>
          </div>
        </details>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <Link
            href={`/relocation/arbitrage?candidate=${c.id}`}
            prefetch={false}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            現在の条件で再判定
          </Link>
          {url && (
            <a
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-stone-500"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              保存した物件ページ
            </a>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:border-stone-500"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              編集
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeleting(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            削除
          </button>
        </div>

        {deleting && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            この候補を削除します。元に戻せません。
            <button
              type="button"
              disabled={busy}
              className="mx-2 font-bold underline"
              onClick={() => void mutate("DELETE")}
            >
              削除する
            </button>
            <button type="button" onClick={() => setDeleting(false)}>
              戻る
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-rose-700">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

/** 候補が 1 件も無いとき。何をすればここに並ぶかを 3 手で見せる */
function EmptyState() {
  const steps = [
    ["地点を選ぶ", "地図を押す・住所を入れる・物件ページの URL を貼る"],
    ["方位と段階を見る", "出発地からの方位と、S〜X の段階が出ます"],
    ["「候補に保存」", "保存したときの判定ごと、ここに並びます"],
  ] as const;
  return (
    <section className="rounded-3xl border border-dashed border-rose-200 bg-white/80 p-6 text-center">
      <MapPin className="mx-auto h-8 w-8 text-rose-400" aria-hidden />
      <h2 className="mt-2 text-lg font-bold text-stone-800">
        まだ保存した候補はありません
      </h2>
      <ol className="mx-auto mt-4 grid max-w-3xl gap-3 text-left md:grid-cols-3">
        {steps.map(([head, body], i) => (
          <li
            key={head}
            className="rounded-2xl border border-stone-200 bg-stone-50 p-3"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
              {i + 1}
            </span>
            <p className="mt-2 text-sm font-bold text-stone-800">{head}</p>
            <p className="mt-0.5 text-xs text-stone-600">{body}</p>
          </li>
        ))}
      </ol>
      <Link
        href="/relocation/arbitrage"
        prefetch={false}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
      >
        <MapPin className="h-4 w-4" aria-hidden />
        候補を探しに行く
      </Link>
    </section>
  );
}

export default function CandidateHistory() {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("new");

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

  const sorted = useMemo(() => sortCandidates(rows, sort), [rows, sort]);
  const counts = useMemo(() => {
    const m = new Map<DayTier, number>();
    for (const r of rows)
      if (isTier(r.judgment.tier))
        m.set(r.judgment.tier, (m.get(r.judgment.tier) ?? 0) + 1);
    return TIER_ORDER.filter((t) => m.has(t)).map(
      (t) => [t, m.get(t)!] as const,
    );
  }, [rows]);

  return (
    <section className="space-y-4" aria-label="保存した候補の一覧">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/90 px-4 py-3">
          <p className="text-sm font-bold text-stone-800">
            {rows.length}
            {cursor ? "+" : ""} 件
          </p>
          <ul className="flex flex-wrap gap-1" aria-label="段階ごとの件数">
            {counts.map(([t, n]) => (
              <li
                key={t}
                className={`rounded-full border px-2 py-0.5 text-xs font-bold ${TIER_BADGE_CLASS[t]}`}
              >
                {t} {TIER_JP[t]} {n}
              </li>
            ))}
          </ul>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div role="group" aria-label="並べ替え" className="flex gap-1">
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={sort === o.key}
                  onClick={() => setSort(o.key)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    sort === o.key
                      ? "border-stone-800 bg-stone-800 text-white"
                      : "border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-700 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              読み直す
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {!busy && !error && !rows.length && <EmptyState />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((c) => (
          <CandidateCard
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
      </div>

      {busy && (
        <p role="status" className="text-sm text-stone-500">
          読み込み中…
        </p>
      )}
      {cursor && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(cursor)}
          className="mx-auto block rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
        >
          続きを見る
        </button>
      )}
    </section>
  );
}

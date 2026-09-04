"use client";

import { useSyncExternalStore } from "react";
import { TOPICS, topicMeta, type NewsTopic } from "@/lib/newsTopics";
import { STEP, bump, orderByAffinity, parseAffinity } from "@/lib/newsAffinity";

/**
 * /news の新着を、Discover 風のカードと今までの密な一覧で切り替えて出す。
 *
 * ## なぜカードか
 *
 * 一覧は 3 列の密なリストで、件数は多いが「今日はどの話題が動いたか」が
 * 読めなかった（利用者の要望。Discover のように話題ごとに拾い読みしたい）。
 * カードは 1 件ずつの顔が立つので拾い読みに向く。
 *
 * ## 情報量は落とさない
 *
 * カードにすると 1 画面あたりの件数は減る。だから**一覧を消さずに切り替え**
 * にし、下の発信元ごとの札（UR の入札 10 本など、カードに向かない密度の
 * 情報）はそのまま残す。
 *
 * ## 画像は使わない
 *
 * Discover は画像で読ませるが、RSS に画像は入っていないことが多く、各記事の
 * og:image を取りに行くと**配信元のサーバへ余計な要求が増える**（#767・#770
 * で痛い目に遭った方向）。発信元の色と話題の札でカードの顔を作る。
 *
 * ## 好みはこの端末の中だけ
 *
 * 表示の切り替えと話題の絞り込みは localStorage に覚える。サーバへは
 * 送らない。集めてしまった記録は revert では消えないので、集めない。
 */

export interface NewsCardEntry {
  title: string;
  link: string;
  /** ISO 8601。読めなければ null */
  publishedAt: string | null;
  /** 一覧用の日付ラベル（サーバー側で日本時間に丸めたもの） */
  dateLabel: string | null;
  summary: string | null;
  sourceId: string;
  sourceName: string;
  /** 発信元の色分けの鍵。束があれば束の id、無ければ配信元の id */
  sourceKey: string;
  topic: NewsTopic | null;
}

type View = "cards" | "list";

const STORAGE_VIEW = "news:view";
const STORAGE_TOPIC = "news:topic";
const STORAGE_AFFINITY = "news:affinity";

/**
 * 発信元の色。官公庁・団体は藍、UR は橙、業界紙・メディアは緑。
 * 配信元が増えたときは束か id で足す。無ければ灰。
 */
const SOURCE_TONES: Record<string, string> = {
  "mlit-press": "bg-indigo-500",
  retpc: "bg-indigo-400",
  ur: "bg-amber-500",
  "suumo-journal": "bg-emerald-500",
  kensetsunews: "bg-emerald-600",
  decn: "bg-emerald-600",
  "s-housing": "bg-emerald-500",
  "itmedia-built": "bg-teal-500",
};

function sourceTone(key: string): string {
  return SOURCE_TONES[key] ?? "bg-stone-400";
}

/** 「3 時間前」。日付が読めなければ空。1 週間より前は日付に落とす。 */
export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMin = Math.max(0, Math.round((now - t) / 60000));
  if (diffMin < 60) return `${diffMin} 分前`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} 時間前`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} 日前`;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(t);
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/*
  同じタブ内の書き換えを購読者へ伝える。`storage` イベントは**別のタブ**
  にしか飛ばないので、自分で鳴らす。
*/
const listeners = new Set<() => void>();

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* 私用ウィンドウなどで書けないだけ。表示には影響しない */
  }
  for (const l of listeners) l();
}

function subscribeStorage(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * localStorage の値を購読する。
 *
 * 効果の中で setState する形（読んでから置き直す）は、React の規則で
 * 「連鎖する再描画」として警告される。useSyncExternalStore なら
 * サーバーでは既定値、クライアントでは保存値をそのまま読めて、
 * 水和のずれも React が面倒を見る。
 */
function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );
}

/** 分単位の現在時刻。相対時刻の表示用。サーバーでは null。 */
function useMinuteNow(): number | null {
  return useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, 60_000);
      return () => window.clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

function isTopic(v: string | null): v is NewsTopic {
  return v !== null && TOPICS.some((t) => t.id === v);
}

export function NewsCards({
  entries,
  sourceCount,
}: {
  entries: readonly NewsCardEntry[];
  sourceCount: number;
}) {
  const storedView = useStoredValue(STORAGE_VIEW);
  const view: View = storedView === "list" ? "list" : "cards";
  const storedTopic = useStoredValue(STORAGE_TOPIC);
  const topic: NewsTopic | null = isTopic(storedTopic) ? storedTopic : null;
  /* 相対時刻はクライアントでだけ決める。サーバーの時刻で出すと水和で
     食い違うので、サーバーでは日付のラベルに落とす */
  const now = useMinuteNow();

  const counts = new Map<NewsTopic, number>();
  for (const e of entries) {
    if (e.topic) counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1);
  }
  /*
    よく開く話題を前へ寄せる。記録はこの端末の localStorage だけで、
    サーバーへは送らない。一覧（list）は新着順のまま。並べ替えるのは
    カードだけで、密な一覧まで動かすと「何日に何が出たか」が読めなくなる。
  */
  const affinity = parseAffinity(useStoredValue(STORAGE_AFFINITY));
  const filtered = topic ? entries.filter((e) => e.topic === topic) : entries;
  const shown =
    view === "cards" ? orderByAffinity(filtered, affinity) : filtered;
  const noteInterest = (t: NewsTopic | null, delta: number) => {
    if (!t) return;
    writeStorage(STORAGE_AFFINITY, JSON.stringify(bump(affinity, t, delta)));
  };

  const switchView = (next: View) => writeStorage(STORAGE_VIEW, next);
  const switchTopic = (next: NewsTopic | null) =>
    writeStorage(STORAGE_TOPIC, next);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-stone-800">
            新着（全{sourceCount}媒体）
          </h2>
          <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
            取得できた配信元の見出しを日付順にまとめたものです。媒体ごとに読むなら下の一覧へ。
          </p>
        </div>
        <div
          role="group"
          aria-label="表示の切り替え"
          className="flex overflow-hidden rounded-lg border border-stone-200 text-[11px]"
        >
          {(
            [
              ["cards", "カード"],
              ["list", "一覧"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => switchView(id)}
              aria-pressed={view === id}
              className={`px-3 py-1 font-bold ${
                view === id
                  ? "bg-stone-800 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 話題の絞り込み。0 件の話題は出さない（押せない札を出さない） */}
      {counts.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => switchTopic(null)}
            aria-pressed={topic === null}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
              topic === null
                ? "border-stone-800 bg-stone-800 text-white"
                : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            すべて {entries.length}
          </button>
          {TOPICS.filter((t) => counts.has(t.id)).map((t) => (
            <button
              key={t.id}
              onClick={() => switchTopic(topic === t.id ? null : t.id)}
              aria-pressed={topic === t.id}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                topic === t.id
                  ? "border-stone-800 bg-stone-800 text-white"
                  : `border-transparent ${t.className} hover:opacity-80`
              }`}
            >
              {t.label} {counts.get(t.id)}
            </button>
          ))}
        </div>
      )}

      {view === "cards" ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((e) => (
            <li
              key={`${e.sourceId}:${e.link}`}
              className="flex overflow-hidden rounded-xl border border-stone-200 bg-white transition-colors hover:border-stone-400"
            >
              {/* 発信元の色帯。画像の代わりに顔を作る */}
              <span
                className={`w-1.5 shrink-0 ${sourceTone(e.sourceKey)}`}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center gap-2 text-[10px] text-stone-500">
                  {e.topic && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-bold ${topicMeta(e.topic).className}`}
                    >
                      {topicMeta(e.topic).label}
                    </span>
                  )}
                  <span className="truncate">{e.sourceName}</span>
                </div>
                <a
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => noteInterest(e.topic, STEP)}
                  className="line-clamp-2 text-sm font-bold leading-snug text-stone-800 hover:text-rose-600 hover:underline"
                >
                  {e.title}
                </a>
                {e.summary && (
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-stone-500">
                    {e.summary}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between pt-1 text-[10px] tabular-nums text-stone-400">
                  <span>
                    {now === null
                      ? (e.dateLabel ?? "")
                      : relativeTime(e.publishedAt, now)}
                  </span>
                  {e.topic && (
                    <button
                      onClick={() => noteInterest(e.topic, -STEP)}
                      title={`「${topicMeta(e.topic).label}」を後ろへ回す`}
                      className="rounded px-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                    >
                      減らす
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-stone-100 pt-3 lg:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <li key={`${e.sourceId}:${e.link}`} className="flex gap-2 text-xs">
              <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-stone-400">
                {e.dateLabel ?? ""}
              </span>
              <span className="min-w-0">
                <a
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium leading-snug text-stone-700 hover:text-rose-600 hover:underline"
                >
                  {e.title}
                </a>
                {/* 出典は必ず添える。どこの記事か分からないまま並べない */}
                <span className="ml-1 whitespace-nowrap text-[10px] text-stone-400">
                  {e.sourceName}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {shown.length === 0 && (
        <p className="mt-4 text-xs text-stone-500">
          この話題の見出しはいまありません。
        </p>
      )}
    </section>
  );
}

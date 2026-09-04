import { TOPICS, type NewsTopic } from "@/lib/newsTopics";

/**
 * 「よく開く話題を上に寄せる」ための重み。
 *
 * Discover が読みやすいのは、話題ごとに束ねたうえで**読み手の関心で順番を
 * 変えている**から。ここはその「関心」を、この端末の中だけで数える。
 *
 * ## 集めない
 *
 * 記録は localStorage に置き、サーバーへは送らない。集めてしまった記録は
 * revert では消えないので、集めない。消すのも利用者の手元でできる。
 *
 * ## 順番を大きく変えない
 *
 * 関心の高い話題を**前へ寄せる**だけで、新しさの順を壊さない。同じ重みの
 * 中では元の順（新着順）を保つ。全部が同じ話題に染まると Discover の悪い
 * ところ（見たいものしか出ない）を写すことになるので、重みは上限で止める。
 */

export type Affinity = Partial<Record<NewsTopic, number>>;

/** 1 回の操作で動く量と、上限。上限が無いと 1 つの話題が全部を押し出す。 */
export const STEP = 1;
export const MAX_WEIGHT = 5;
export const MIN_WEIGHT = -5;

export function bump(a: Affinity, topic: NewsTopic, delta: number): Affinity {
  const next = Math.max(
    MIN_WEIGHT,
    Math.min(MAX_WEIGHT, (a[topic] ?? 0) + delta),
  );
  return { ...a, [topic]: next };
}

/**
 * 重みで並べ替える。安定ソートで、同じ重みの中は元の順のまま。
 * 話題の無い見出し（null）は重み 0 として扱い、消さない。
 */
export function orderByAffinity<T extends { topic: NewsTopic | null }>(
  items: readonly T[],
  a: Affinity,
): T[] {
  const weight = (t: NewsTopic | null) => (t ? (a[t] ?? 0) : 0);
  return items
    .map((item, i) => ({ item, i, w: weight(item.topic) }))
    .sort((x, y) => y.w - x.w || x.i - y.i)
    .map((x) => x.item);
}

export function parseAffinity(raw: string | null): Affinity {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const out: Affinity = {};
    /* 知らない鍵は捨てる。話題を減らしたり名前を変えたりした後に、
       古い記録が残っていても壊れないようにする */
    for (const t of TOPICS) {
      const n = (v as Record<string, unknown>)[t.id];
      if (typeof n === "number" && Number.isFinite(n)) {
        out[t.id] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, n));
      }
    }
    return out;
  } catch {
    return {};
  }
}

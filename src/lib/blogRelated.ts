import type { BlogPostSummary } from "@/lib/blog";

/**
 * 「あわせて読む」に出す記事を選ぶ。
 *
 * 記事ページの脇は**自分以外の全記事**を並べていた。記事が 3 本の頃は
 * 2 件だったので気付かなかったが、23 本になった時点で全記事の脇に 22 件が
 * 並ぶようになった。それは関連記事ではなく一覧の複製で、「次に何を読むか」
 * を示す役に立たない。
 *
 * 近さは frontmatter だけで測る。本文の類似度を見ないのは、記事が増える
 * たびに全文を突き合わせる処理が重くなるうえ、日本語の分かち書きを持ち込むと
 * 結果を説明できなくなるため。**なぜこの 5 本が出たのかを人が説明できる**
 * ことを優先する。
 */

/** 何件出すか。上限を増やすときは記事ページの縦の長さも見ること。 */
export const RELATED_LIMIT = 5;

/** 同じカテゴリの重み。 */
const CATEGORY_WEIGHT = 2;

/** 共通タグ 1 つあたりの重み。 */
const TAG_WEIGHT = 1;

/**
 * ありふれたタグは数えない。
 *
 * 実測（2026-08-15、記事 23 本）でタグ `九星気学` は 17 本に付いていた。
 * このサイトの記事はほぼ全部が九星気学の話なので、共有していても
 * 「近い」の根拠にならない。カテゴリのほうは最大でも 10/23（方位の読み方）で、
 * まだ意味がある。
 *
 * **割合で決める。**「九星気学を除く」と名指しで書くと、記事が増えて別の
 * タグが同じ状態になったときに効かない。半分を超えたら信号にならない、
 * という規則にしておけば手を入れずに済む。
 */
const COMMON_TAG_RATIO = 0.5;

function commonTagsOf(all: BlogPostSummary[]): Set<string> {
  const count = new Map<string, number>();
  for (const post of all) {
    for (const tag of new Set(post.tags)) {
      count.set(tag, (count.get(tag) ?? 0) + 1);
    }
  }

  const threshold = all.length * COMMON_TAG_RATIO;
  const common = new Set<string>();
  for (const [tag, n] of count) {
    if (n > threshold) common.add(tag);
  }
  return common;
}

function scoreOf(
  current: BlogPostSummary,
  other: BlogPostSummary,
  ignoredTags: Set<string>,
): number {
  const tags = new Set(current.tags);
  const shared = other.tags.filter(
    (tag) => tags.has(tag) && !ignoredTags.has(tag),
  ).length;
  return (
    (other.category === current.category ? CATEGORY_WEIGHT : 0) +
    shared * TAG_WEIGHT
  );
}

/**
 * 近い順に最大 limit 件。**関連が足りなければ新しい記事で埋める。**
 *
 * 埋めるのは、脇が空だと「記事はこれで終わり」に見えるため。ただし
 * 埋めた分も含めて上限は超えない。
 *
 * 並びは (点数の降順 → 公開日の降順 → slug の昇順)。点数だけだと同点が
 * 大量に出て、順序が渡された配列の並びに依存する。一覧・RSS と同じ理由で
 * slug まで見て決着させる（ISR で組み直すたびに顔ぶれが入れ替わらない）。
 */
export function pickRelatedPosts(
  current: BlogPostSummary,
  all: BlogPostSummary[],
  limit: number = RELATED_LIMIT,
): BlogPostSummary[] {
  if (limit <= 0) return [];

  const ignoredTags = commonTagsOf(all);
  const others = all.filter((post) => post.slug !== current.slug);

  return [...others]
    .sort((a, b) => {
      const diff =
        scoreOf(current, b, ignoredTags) - scoreOf(current, a, ignoredTags);
      if (diff !== 0) return diff;
      return (
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.slug.localeCompare(b.slug)
      );
    })
    .slice(0, limit);
}

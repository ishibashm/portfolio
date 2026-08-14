import type { BlogPostSummary } from "@/lib/blog";
import { headingId } from "@/lib/blogToc";

/**
 * 記事の一覧をカテゴリごとの節に割る。
 *
 * 一覧は 23 枚のカードを日付降順で並べるだけだった。記事の公開日がほぼ
 * 同じなので、実際の並びは slug の字面順に近く、方位の話と家賃の話が
 * 交互に出てくる。**23 枚のほぼ同じ見た目のカードから読むものを選ぶ**
 * 画面になっていた。
 *
 * 絞り込みの操作ではなく**節に割る**のは、この画面が静的に配信されている
 * ため。操作を挟むと、クローラーと JavaScript を切っている利用者には
 * 1 つの塊のままで、検索の入口としての意味が変わらない。節なら見出しが
 * そのまま索引になり、リンクも張れる。
 *
 * 節の順は**記事数の多い順、同数なら名前順**。手で並びを決めると、
 * カテゴリが増えたときに並びの定義を直す必要があり、必ず忘れる。
 */

export interface BlogCategoryGroup {
  category: string;
  /** アンカー id。見出しと索引リンクの両方がこれを使う。 */
  id: string;
  posts: BlogPostSummary[];
}

/**
 * カテゴリごとに割る。節の中は渡された並び（新しい順）を保つ。
 *
 * 名前の比較に `localeCompare` を使わない。引数なしの `localeCompare` は
 * 実行環境の照合順に従うので、日本語のカテゴリ名では並びが動きうる。
 * ここは「同数のときに順序が決まる」ことだけが要件で、辞書順である
 * 必要は無い。コード単位の比較なら、どこで動かしても同じ並びになる。
 */
export function groupPostsByCategory(
  posts: BlogPostSummary[],
): BlogCategoryGroup[] {
  const groups = new Map<string, BlogPostSummary[]>();

  for (const post of posts) {
    const list = groups.get(post.category);
    if (list) list.push(post);
    else groups.set(post.category, [post]);
  }

  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      id: headingId(category),
      posts: list,
    }))
    .sort(
      (a, b) =>
        b.posts.length - a.posts.length ||
        (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
    );
}

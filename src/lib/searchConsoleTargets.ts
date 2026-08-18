import { getBlogPosts } from "@/lib/blog";
import { CORE_ROUTES } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * URL 検査に掛ける代表 URL。
 *
 * 枠は 1 日 2,000 件だが、**全ページを舐めるためのものではない。**
 * 「いま知りたいこと」に答える最小の組み合わせにする。
 *
 *   articles  記事が索引に載っているか（載るべきもの）
 *   core      道具のページが索引に載っているか（載るべきもの）
 *   noindexed **#379 で外した雛形ページが、狙いどおり外れたか**
 *             （外れているべきもの。ここが「載っている」なら効いていない）
 *
 * 3 つ目が肝心。**「載っているべきもの」だけを見ると、外す指示が効いたかは
 * 永久に分からない。**両側を見る。
 */

export interface InspectionTarget {
  url: string;
  /** 索引に載っているのが正しいか。noindexed は false。 */
  shouldBeIndexed: boolean;
  group: "article" | "core" | "noindexed";
}

/** #379 で noindex にした雛形ページの代表。増やしすぎない。 */
const NOINDEXED_SAMPLES = [
  "/houi/area/13101", // 東京都千代田区
  "/houi/area/26100", // 京都市
  "/houi/2026/1/1", // 月別
];

export function inspectionTargets(): InspectionTarget[] {
  const base = SITE_URL.replace(/\/$/, "");
  const out: InspectionTarget[] = [];

  for (const post of getBlogPosts()) {
    out.push({
      url: `${base}/blog/${post.slug}`,
      shouldBeIndexed: true,
      group: "article",
    });
  }

  // 索引の入り口。道具の各ページと、記事・早見表の一覧。
  for (const href of [
    "/",
    "/blog",
    "/houi",
    "/houi/area",
    "/calendar",
    "/guide",
    ...CORE_ROUTES.map((r) => r.href),
  ]) {
    const url = `${base}${href === "/" ? "" : href}` || base;
    if (!out.some((t) => t.url === url)) {
      out.push({ url: url || base, shouldBeIndexed: true, group: "core" });
    }
  }

  for (const href of NOINDEXED_SAMPLES) {
    out.push({
      url: `${base}${href}`,
      shouldBeIndexed: false,
      group: "noindexed",
    });
  }

  return out;
}

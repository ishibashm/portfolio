import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 記事の代表画像。
 *
 * Google Discover は画像で読ませる面なので、画像の無い記事は内容と関係なく
 * 対象外になる。以前は 27 記事すべてが同じ `/ogp.png` を指していたため、
 * どの記事も他と区別が付かなかった。
 *
 * **frontmatter にも DB にも列を足さない。**記事はファイル（content/blog）と
 * DB（BlogPost）の 2 経路で入ってくるので、片方にだけ項目を足すと扱いが割れる。
 * `public/blog/<slug>.png` があるかどうかだけで決めれば、どちらの経路でも
 * 同じように効く。画像は scripts/build_blog_images.mjs が作る。
 */

/** 画像が無い記事の代替。サイト共通の共有カード。 */
export const DEFAULT_SOCIAL_IMAGE = "/ogp.png";

const BLOG_IMAGE_DIR = path.join(process.cwd(), "public", "blog");

/**
 * その記事の画像のパス。無ければ共通の画像。
 *
 * **サーバー側でのみ呼ぶ。**静的生成のときに 1 度だけ読むので、
 * ファイルの有無をその場で見てよい。
 */
export function blogImagePath(slug: string): string {
  // slug は URL の素片なので、区切り文字が混ざると public の外を指しうる
  if (!/^[a-z0-9-]+$/.test(slug)) return DEFAULT_SOCIAL_IMAGE;
  return existsSync(path.join(BLOG_IMAGE_DIR, `${slug}.png`))
    ? `/blog/${slug}.png`
    : DEFAULT_SOCIAL_IMAGE;
}

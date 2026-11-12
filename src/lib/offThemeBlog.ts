import slugs from "./offThemeBlogSlugs.json";

/**
 * 引越しの方位・住まいから外れた記事。
 *
 * 作業ログ（agent-）と同じく、コード側の slug 一覧で公開面から落とす。
 * 違いは頁の扱い。作業ログは 404 にするが、こちらは URL を知っていれば
 * 200 のまま開き、robots だけ noindex にする。DB の行は消さない。
 *
 * 一覧・RSS・サイトマップはここを見る。頁そのもの（loadBlogPost）は見ない。
 */
export const OFF_THEME_BLOG_SLUGS: readonly string[] = slugs;

const OFF_THEME = new Set<string>(slugs);

export function isOffThemeBlogSlug(slug: string): boolean {
  return OFF_THEME.has(slug);
}

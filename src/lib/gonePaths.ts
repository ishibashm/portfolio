/**
 * 認証・本文取得より前に 410 を返すパス。転送は付けない。
 *
 * - 個人情報を理由に #1733 で削除した記事
 * - 削除済みで後継が無い公開頁（Search Console の 404 を 410 にして
 *   索引から落とす。無関係な頁へ送ると soft 404 になる）
 */
export const GONE_PATHS: readonly string[] = [
  "/blog/moved-to-an-unlucky-direction",
  "/blog/one-birthdate-through-all-mcp-tools",
  "/extract",
];

export function isGonePath(pathname: string): boolean {
  return GONE_PATHS.includes(pathname.replace(/\/$/, ""));
}

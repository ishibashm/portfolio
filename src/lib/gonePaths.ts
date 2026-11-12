/** 個人情報を理由に #1733 で削除した記事。転送せず、本文取得前に 410 を返す。 */
export const GONE_PATHS: readonly string[] = [
  "/blog/moved-to-an-unlucky-direction",
  "/blog/one-birthdate-through-all-mcp-tools",
];

export function isGonePath(pathname: string): boolean {
  return GONE_PATHS.includes(pathname.replace(/\/$/, ""));
}

import { NON_CORE_ROUTES } from "@/lib/siteStructure";

/**
 * ログイン必須にするパス。
 *
 * 以前は "/relocation" を丸ごと保護していたため、主力の
 * /relocation/arbitrage と /relocation/wealth がクローラーに 307 を返し、
 * 検索にも AdSense にも中身が一切見えていなかった。サイトマップに載せても
 * 索引されようがなく、収益化の前提が成立していなかった。
 *
 * 中核ページは匿名でも閲覧・操作できるようにする。設定の保存や
 * プリセット同期は API 側で別途認証しているので、ここを開けても
 * 他人のデータが読める状態にはならない。
 *
 * 保護対象は src/lib/siteStructure.ts の非中核ルートに揃える。
 * 2か所で管理すると、ページを増やしたときに必ず食い違う。
 */
export const PROTECTED_ROUTE_PREFIXES = [
  ...NON_CORE_ROUTES,
  "/omni", // ページは無いが API 側の名前空間として残っている
] as const;

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some((route) => pathname.startsWith(route));
}

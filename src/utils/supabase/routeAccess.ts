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

/**
 * 管理者かどうか。**middleware と API の両方がここだけを見る。**
 *
 * 以前は同じ規則が 2 か所に写してあり、どちらも
 *   ADMIN_EMAIL が未設定なら、ログインしていれば通す
 * だった。これは開いたまま失敗する（fail open）。環境変数を入れ忘れる、
 * 消える、名前を打ち間違える — どの場合も**エラーにならず、ログイン
 * さえすれば誰でも管理画面と管理 API が読める**状態になる。気付く
 * きっかけが無い。
 *
 * 未設定は「全員が管理者」ではなく「**誰も管理者ではない**」と読む。
 * 開発（NODE_ENV !== "production"）だけは、.env を置かずに動かせる
 * ように従来どおり通す。
 *
 * 締め出されたときの直し方: Cloud Run の環境変数に ADMIN_EMAIL を
 * 入れる（deploy.yml が読む ENV_FILE シークレット）。コード側の
 * 変更では戻せないので、本番へ出す前に設定を確かめること。
 *
 * ここに置いたのは、middleware が Edge で動くため。adminApi.ts は
 * getAuthUser 経由で Prisma まで引き込むので、そちらから import すると
 * middleware のバンドルに入ってしまう。routeAccess は siteStructure しか
 * 見ておらず、既に middleware が import している。
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return process.env.NODE_ENV !== "production";
  if (!email) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

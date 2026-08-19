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

/**
 * 未ログイン・権限不足のときにどこへ送るか。**この判断はここだけが持つ。**
 *
 * middleware に直接書いていたときに、次の噛み合わせで詰まっていた。
 *
 *   1. ログイン済みだが ADMIN_EMAIL と違う人が管理者専用ページに来ると
 *      /login へ送り返していた（**ログイン済みの人をログイン画面へ**）
 *   2. その /login は「ADMIN_EMAIL と一致する人」しか外へ出さなかった
 *
 * 結果、一般の利用者は Google でログインしてもログイン画面に戻され、
 * そこから抜けられない。画面からは「自分のアカウントは弾かれている」
 * ようにしか見えず、実際に「特定の人しかログインできないのでは」と
 * 報告が来た。**ログインは誰でもできていた。**出口が無かっただけ。
 *
 * 直したあとの規則は 3 行で言い切れる。
 *
 *   - 未ログインで保護ルート → ログイン画面（戻り先を持たせる）
 *   - ログイン済みで権限が足りない → トップ（ログイン画面へは戻さない）
 *   - ログイン済みでログイン画面にいる → トップ（権限は問わない）
 *
 * 権限が足りないときにページの存在を言い立てないのは意図的。
 * 「管理者専用です」と出すと、そこに何かがあることを教えてしまう。
 */
export type AuthRedirect =
  | { kind: "login"; next: string }
  | { kind: "home" }
  | null;

export function resolveAuthRedirect(params: {
  /** 実際に描画されるパス（サブドメインの書き換え後）。 */
  pathname: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  /** ログイン後に戻す先。pathname + search。 */
  nextTarget: string;
}): AuthRedirect {
  const { pathname, isLoggedIn, isAdmin, nextTarget } = params;
  const requiresAuthentication = isProtectedRoute(pathname);

  if (!isLoggedIn && requiresAuthentication) {
    return { kind: "login", next: nextTarget };
  }

  if (isLoggedIn && !isAdmin && requiresAuthentication) {
    return { kind: "home" };
  }

  if (isLoggedIn && pathname === "/login") {
    return { kind: "home" };
  }

  return null;
}

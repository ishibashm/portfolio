/**
 * エージェントの入口で使う「ログインしているか」。
 *
 * Supabase のログイン Cookie が無ければ、認証モジュールも DB も読まずに
 * 未ログインとして返す（匿名の相談に余計な往復を足さない）。Cookie が
 * あるときだけ Supabase に本人確認を頼む。失敗は未ログイン扱い。
 *
 * ここで得た id はレート制限の鍵（HMAC 済み）にだけ使い、モデルへは
 * `signedIn` の真偽しか渡さない。
 */
export type AgentSessionUser = { signedIn: boolean; userId?: string };

const SUPABASE_AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/;

export function hasSupabaseAuthCookie(cookieHeader: string | null): boolean {
  return Boolean(cookieHeader && SUPABASE_AUTH_COOKIE.test(cookieHeader));
}

export async function agentSessionUser(
  request: Request,
): Promise<AgentSessionUser> {
  if (!hasSupabaseAuthCookie(request.headers.get("cookie")))
    return { signedIn: false };
  try {
    const { getAuthUser, toUserId } = await import("@/lib/userConfig");
    const user = await getAuthUser();
    if (!user) return { signedIn: false };
    const userId = toUserId(user);
    return userId ? { signedIn: true, userId } : { signedIn: true };
  } catch {
    return { signedIn: false };
  }
}

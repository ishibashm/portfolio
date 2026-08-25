import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAdminEmail,
  isProtectedRoute,
  resolveAuthRedirect,
} from "./routeAccess";

/**
 * @param effectivePathname the path that will actually be rendered. On the
 * sub-app subdomains this differs from `request.nextUrl.pathname` (which is "/"
 * for the subdomain root), and gating on the raw value bypassed auth entirely.
 */
export async function updateSession(
  request: NextRequest,
  effectivePathname?: string,
) {
  const pathname = effectivePathname ?? request.nextUrl.pathname;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 受け側の request の cookie には options を渡さない。ここは
          // 「この処理の続きが読む値」を差し替えるだけで、ブラウザへ
          // 返すのは下の supabaseResponse のほう。有効期限や SameSite は
          // そちらに付ける。
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const requiresAuthentication = isProtectedRoute(pathname);
  const isLoginPage = pathname === "/login";
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") || c.name === "dev_bypass_user");

  // On public routes without auth cookies, skip remote auth network call
  if (!requiresAuthentication && !isLoginPage && !hasAuthCookie) {
    return supabaseResponse;
  }

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (process.env.NODE_ENV === "development") {
    const bypassEmail = request.cookies.get("dev_bypass_user")?.value;
    if (bypassEmail) {
      // 読んでいるのは email と「user がいるか」だけだが、`User` を
      // 名乗る以上は必須の項目を埋める。`as any` で押し通すと、
      // 将来この user を別の場所へ渡したときに実行時まで気付けない。
      user = {
        id: "dev-bypass-id",
        email: bypassEmail,
        role: "authenticated",
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      } satisfies User;
    }
  }

  // 判定は routeAccess の 1 か所だけ。ADMIN_EMAIL 未設定のときに
  // 「ログインしていれば通す」ではなく「誰も通さない」になっている
  // 理由は、そちらの isAdminEmail のコメントに書いてある。
  const isAuthorized = isAdminEmail(user?.email);

  // 行き先の判断は routeAccess の resolveAuthRedirect が 1 つだけ持つ。
  // ここに書いていたときに「ログイン済みの人をログイン画面へ送り返し、
  // そのログイン画面が管理者しか外へ出さない」噛み合わせで詰まった。
  // 理由と直したあとの規則は、そちらのコメントに書いてある。
  const redirect = resolveAuthRedirect({
    pathname,
    isLoggedIn: Boolean(user),
    isAdmin: isAuthorized,
    nextTarget: request.nextUrl.pathname + request.nextUrl.search,
  });

  if (redirect?.kind === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", redirect.next);
    return NextResponse.redirect(url);
  }

  if (redirect?.kind === "home") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

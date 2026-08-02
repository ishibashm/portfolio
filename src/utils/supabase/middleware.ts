import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedRoute } from "./routeAccess";

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
          cookiesToSet.forEach(({ name, value, options }) =>
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
      user = {
        id: "dev-bypass-id",
        email: bypassEmail,
        role: "authenticated",
      } as any;
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAuthorized =
    !adminEmail ||
    (user?.email && user.email.toLowerCase() === adminEmail.toLowerCase());


  // If the user is unauthenticated and they are trying to access a protected route
  if (!user && requiresAuthentication) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(url);
  }

  // If the user is logged in, but their email does NOT match the owner's ADMIN_EMAIL
  if (user && !isAuthorized && requiresAuthentication) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "Unauthorized access.");
    url.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(url);
  }

  // If authorized user is logged in, and tries to visit login page, redirect to dashboard
  if (user && isAuthorized && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (process.env.NODE_ENV === 'development') {
    const bypassEmail = request.cookies.get('dev_bypass_user')?.value;
    if (bypassEmail) {
      user = {
        id: 'dev-bypass-id',
        email: bypassEmail,
        role: 'authenticated',
      } as any;
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAuthorized = !adminEmail || user?.email === adminEmail;

  const protectedRoutes = ['/research', '/knowledge', '/x-viewer', '/visualizer', '/omni', '/dashboard', '/relocation/history'];
  const isProtectedRoute = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  // If the user is unauthenticated and they are trying to access a protected route
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If the user is logged in, but their email does NOT match the owner's ADMIN_EMAIL
  if (user && !isAuthorized && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'Unauthorized access.');
    return NextResponse.redirect(url);
  }

  // If authorized user is logged in, and tries to visit login page, redirect to dashboard
  if (user && isAuthorized && request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

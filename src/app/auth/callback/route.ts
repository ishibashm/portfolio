import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // if "next" is in param, use it as the redirect URL
  const next = requestUrl.searchParams.get('next') ?? '/rentals';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    // Fix for reverse proxies (Docker/Cloud Run load balancers)
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    } else {
        console.error("Auth callback error:", error);
    }
  }

  // return the user to an error page with instructions
  const errOrigin = request.headers.get('x-forwarded-host') 
      ? `${request.headers.get('x-forwarded-proto') ?? 'https'}://${request.headers.get('x-forwarded-host')}` 
      : requestUrl.origin;
  return NextResponse.redirect(`${errOrigin}/login?error=Could not authenticate user`);
}

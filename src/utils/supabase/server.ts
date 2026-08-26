import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * 開発時の疑似ログインに使う User（client.ts と同じ形）。本物の User の
 * 必須項目を埋めれば `as any` は要らない。開発時専用。
 */
function devBypassUser(email: string): User {
  return {
    id: "dev-bypass-id",
    email,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
}

export async function createClient() {
  const cookieStore = await cookies();

  const client = createServerClient(
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
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );

  if (process.env.NODE_ENV === "development") {
    const originalGetUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = async (token?: string) => {
      const bypassEmail = cookieStore.get("dev_bypass_user")?.value;
      if (bypassEmail) {
        return {
          data: { user: devBypassUser(bypassEmail) },
          error: null,
        };
      }
      return originalGetUser(token);
    };
  }

  return client;
}

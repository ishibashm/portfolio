import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
          data: {
            user: {
              id: "dev-bypass-id",
              email: bypassEmail,
              role: "authenticated",
            } as any,
          },
          error: null,
        };
      }
      return originalGetUser(token);
    };
  }

  return client;
}

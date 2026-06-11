import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  if (process.env.NODE_ENV === "development") {
    const originalGetUser = client.auth.getUser.bind(client.auth);
    client.auth.getUser = async (token?: string) => {
      if (typeof document !== "undefined") {
        const match = document.cookie.match(/(^| )dev_bypass_user=([^;]+)/);
        const bypassEmail = match ? decodeURIComponent(match[2]) : null;
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
      }
      return originalGetUser(token);
    };

    const originalSignOut = client.auth.signOut.bind(client.auth);
    client.auth.signOut = async (options?: any) => {
      if (typeof document !== "undefined") {
        document.cookie =
          "dev_bypass_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
      return originalSignOut(options);
    };
  }

  return client;
}

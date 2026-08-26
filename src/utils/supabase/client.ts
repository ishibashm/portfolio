import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

/**
 * 開発時の疑似ログインに使う User。以前は id / email / role だけ置いて
 * `as any` で通していたが、本物の User の必須項目（aud・metadata・
 * created_at）を埋めれば cast は要らない。開発時（NODE_ENV ===
 * "development"）専用で、本番の経路には乗らない。
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
            data: { user: devBypassUser(bypassEmail) },
            error: null,
          };
        }
      }
      return originalGetUser(token);
    };

    const originalSignOut = client.auth.signOut.bind(client.auth);
    /* 引数の型は包んでいる元の関数から引く。名前で型を探して外すと
       ライブラリの更新でずれる。 */
    client.auth.signOut = async (
      options?: Parameters<typeof originalSignOut>[0],
    ) => {
      if (typeof document !== "undefined") {
        document.cookie =
          "dev_bypass_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }
      return originalSignOut(options);
    };
  }

  return client;
}

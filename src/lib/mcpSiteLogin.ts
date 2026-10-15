import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { z } from "zod";
import { McpConsentError } from "@/lib/mcpConsent";

/** Uses the site's Supabase cookies, but never its development getUser bypass. */
export function createMcpSiteLoginVerifier(config: {
  supabaseUrl: string;
  publicKey: string;
}) {
  const url = new URL(config.supabaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !config.publicKey
  )
    throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<string | null> => {
    try {
      const supabase = createServerClient(
        config.supabaseUrl,
        config.publicKey,
        {
          cookies: {
            getAll: () =>
              parseCookieHeader(req.headers.cookie ?? "").map(
                ({ name, value }) => ({ name, value: value ?? "" }),
              ),
            setAll: (cookies) => {
              const previous = res.getHeader("Set-Cookie");
              const values =
                previous === undefined
                  ? []
                  : Array.isArray(previous)
                    ? previous.map(String)
                    : [String(previous)];
              res.setHeader("Set-Cookie", [
                ...values,
                ...cookies.map(({ name, value, options }) =>
                  serializeCookieHeader(name, value, {
                    ...options,
                    secure: true,
                    sameSite: "lax",
                  }),
                ),
              ]);
            },
          },
        },
      );
      // getSession's locally decoded identity is insufficient for consent.
      const { data, error } = await supabase.auth.getUser();
      if (error || !z.uuid().safeParse(data.user?.id).success) return null;
      return data.user!.id;
    } catch {
      throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
    }
  };
}

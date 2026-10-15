import { z } from "zod";
import type { McpRuntimeConfig } from "@/lib/mcpRuntime";

// Local OAuth, consent, MCP, revocation and deletion integration are verified.
// Deployment requires explicit opt-in and complete runtime configuration.
export function isPersonalMcpEnabled() {
  return process.env.MCP_PERSONAL_ENABLED === "true";
}
const key = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .transform((value) => Buffer.from(value, "base64"));
const redirect = z.url().refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.hash &&
    !value.includes("*") &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
  );
});
const client = z
  .object({
    client_id: z.string().min(1).max(512),
    client_name: z.string().min(1).max(200),
    redirect_uris: z.array(redirect).min(1).max(10),
    token_endpoint_auth_method: z.enum([
      "none",
      "client_secret_basic",
      "client_secret_post",
    ]),
    client_secret: z.string().min(32).optional(),
  })
  .strict()
  .refine((c) =>
    c.token_endpoint_auth_method === "none"
      ? c.client_secret === undefined
      : c.client_secret !== undefined,
  );
const rsa = z
  .object({
    kty: z.literal("RSA"),
    kid: z.string().min(1),
    alg: z.literal("RS256"),
    use: z.literal("sig"),
    n: z.string().min(342),
    e: z.string().min(1),
    d: z.string().min(1),
    p: z.string().min(1),
    q: z.string().min(1),
    dp: z.string().min(1),
    dq: z.string().min(1),
    qi: z.string().min(1),
  })
  .strict();
const config = z
  .object({
    databaseUrl: z.string().min(1),
    lookupKey: key,
    encryptionKey: key,
    encryptionVersion: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    consentKey: key,
    cookieKeys: z.array(z.string().min(43)).min(1).max(3),
    jwks: z.object({ keys: z.array(rsa).min(1).max(3) }).strict(),
    clients: z.array(client).min(1).max(20),
    login: z
      .object({ supabaseUrl: z.url(), publicKey: z.string().min(1) })
      .strict(),
  })
  .strict();

/** Parse the single Secret Manager JSON value. Never return a validation issue,
 * raw JSON, or underlying exception that could contain keys or credentials. */
export function parseMcpRuntimeConfig(
  value: string | undefined,
): McpRuntimeConfig {
  try {
    if (!value || value.length > 65536 || process.env.DEBUG) throw new Error();
    const parsed = config.parse(JSON.parse(value));
    if (
      new Set(parsed.clients.map((c) => c.client_id)).size !==
        parsed.clients.length ||
      parsed.lookupKey.equals(parsed.encryptionKey) ||
      parsed.lookupKey.equals(parsed.consentKey) ||
      parsed.encryptionKey.equals(parsed.consentKey)
    )
      throw new Error();
    return {
      databaseUrl: parsed.databaseUrl,
      state: {
        lookupKey: parsed.lookupKey,
        activeVersion: parsed.encryptionVersion,
        encryptionKeys: new Map([
          [parsed.encryptionVersion, parsed.encryptionKey],
        ]),
      },
      consentKey: parsed.consentKey,
      cookieKeys: parsed.cookieKeys,
      jwks: parsed.jwks,
      clients: parsed.clients.map((c) => ({
        ...c,
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
      })),
      login: parsed.login,
    };
  } catch {
    throw new Error("MCP_RUNTIME_CONFIGURATION_INVALID");
  }
}

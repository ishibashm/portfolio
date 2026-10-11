/** Validate an opaque, resource-bound OAuth token with our own authorization service. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE = "https://cloud-palette.com/api/mcp/profile";
const CLIENT_ID = "cloud-palette-resource-server";

export const PROFILE_RESOURCE = RESOURCE;
export const PROFILE_RESOURCE_METADATA =
  "https://cloud-palette.com/.well-known/oauth-protected-resource/api/mcp/profile";

export function profileOAuthIssuer(): string | null {
  const raw = process.env.MCP_OAUTH_ISSUER;
  if (!raw || !/^https:\/\/[^/?#]+\/?$/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export type OAuthIdentity =
  | { status: "ok"; userId: string }
  | { status: "unauthorized" | "unavailable" };

export async function verifyProfileToken(
  token: string,
): Promise<OAuthIdentity> {
  const issuer = profileOAuthIssuer();
  const secret = process.env.MCP_OAUTH_INTROSPECTION_SECRET;
  const expectedClient = process.env.MCP_OAUTH_CLIENT_ID;
  if (!issuer || !secret || !expectedClient || secret.length < 32)
    return { status: "unavailable" };
  const normalizedIssuer = issuer;
  try {
    const response = await fetch(`${normalizedIssuer}/token/introspection`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token, token_type_hint: "access_token" }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { status: "unavailable" };
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return { status: "unavailable" };
    const value = data as Record<string, unknown>;
    if (value.active !== true) return { status: "unauthorized" };
    const now = Math.floor(Date.now() / 1000);
    if (
      value.iss !== normalizedIssuer ||
      value.aud !== RESOURCE ||
      value.client_id !== expectedClient ||
      value.token_type !== "Bearer" ||
      typeof value.exp !== "number" ||
      !Number.isSafeInteger(value.exp) ||
      value.exp <= now ||
      typeof value.scope !== "string" ||
      !value.scope.split(" ").includes("profiles:read") ||
      typeof value.sub !== "string" ||
      !UUID_RE.test(value.sub)
    )
      return { status: "unauthorized" };
    return { status: "ok", userId: value.sub };
  } catch {
    return { status: "unavailable" };
  }
}

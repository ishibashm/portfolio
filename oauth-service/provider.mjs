import Provider, { errors } from "oidc-provider";
import { prismaOAuthAdapter } from "./adapter.mjs";

const HTTPS = /^https:\/\/[^/?#]+(?:\/[^?#]*)?$/;

export function validateOAuthConfig(env) {
  const issuer = env.MCP_OAUTH_ISSUER;
  const resource = env.MCP_OAUTH_RESOURCE;
  const redirectUri = env.MCP_OAUTH_CLIENT_REDIRECT_URI;
  const clientId = env.MCP_OAUTH_CLIENT_ID;
  const introspectionSecret = env.MCP_OAUTH_INTROSPECTION_SECRET;
  const cookieSecrets = JSON.parse(env.MCP_OAUTH_COOKIE_SECRETS || "[]");
  const jwks = JSON.parse(env.MCP_OAUTH_JWKS || "{}");
  const storageKeyStrings = JSON.parse(env.MCP_OAUTH_STORAGE_KEYS || "[]");
  if (
    !HTTPS.test(issuer || "") ||
    new URL(issuer).pathname !== "/" ||
    new URL(issuer).username ||
    new URL(issuer).password
  )
    throw new Error("MCP_OAUTH_ISSUER must be an HTTPS origin");
  if (resource !== "https://cloud-palette.com/api/mcp/profile")
    throw new Error("MCP_OAUTH_RESOURCE must match the protected endpoint");
  if (
    !HTTPS.test(redirectUri || "") ||
    new URL(redirectUri).hash ||
    new URL(redirectUri).username ||
    new URL(redirectUri).password ||
    !["chatgpt.com", "chat.openai.com"].includes(new URL(redirectUri).hostname)
  )
    throw new Error("MCP_OAUTH_CLIENT_REDIRECT_URI must be exact HTTPS URL");
  if (!/^[A-Za-z0-9._~-]{8,128}$/.test(clientId || ""))
    throw new Error("MCP_OAUTH_CLIENT_ID is invalid");
  if (!introspectionSecret || introspectionSecret.length < 32)
    throw new Error("MCP_OAUTH_INTROSPECTION_SECRET must be at least 32 chars");
  if (
    !Array.isArray(cookieSecrets) ||
    cookieSecrets.length < 1 ||
    cookieSecrets.some((s) => typeof s !== "string" || s.length < 32)
  )
    throw new Error("MCP_OAUTH_COOKIE_SECRETS requires long secrets");
  if (!Array.isArray(jwks.keys) || jwks.keys.length < 1)
    throw new Error("MCP_OAUTH_JWKS requires a private signing key");
  if (
    !Array.isArray(storageKeyStrings) ||
    !storageKeyStrings.length ||
    storageKeyStrings.some(
      (s) =>
        typeof s !== "string" ||
        Buffer.from(s, "base64").length !== 32 ||
        Buffer.from(s, "base64").toString("base64") !== s,
    )
  )
    throw new Error("MCP_OAUTH_STORAGE_KEYS requires 32-byte base64 keys");
  const storageKeys = storageKeyStrings.map((s) => Buffer.from(s, "base64"));
  return {
    issuer: new URL(issuer).origin,
    resource,
    redirectUri,
    clientId,
    introspectionSecret,
    cookieSecrets,
    jwks,
    storageKeys,
  };
}

export function createOAuthProvider(config, prisma) {
  const provider = new Provider(config.issuer, {
    adapter: prismaOAuthAdapter(prisma, config.storageKeys),
    clients: [
      {
        client_id: config.clientId,
        redirect_uris: [config.redirectUri],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      },
      {
        client_id: "cloud-palette-resource-server",
        client_secret: config.introspectionSecret,
        redirect_uris: [],
        response_types: [],
        grant_types: [],
        token_endpoint_auth_method: "client_secret_basic",
      },
    ],
    cookies: { keys: config.cookieSecrets },
    jwks: config.jwks,
    // Advertise the resource scope for OAuth discovery. The grant records it
    // both as a requested scope and for the exact resource audience below.
    scopes: ["openid", "profiles:read", "offline_access"],
    pkce: { required: () => true },
    responseTypes: ["code"],
    grantTypes: ["authorization_code", "refresh_token"],
    // The consent screen explicitly covers a continuing, revocable connection.
    // ChatGPT may not request offline_access; still issue rotating refresh tokens.
    issueRefreshToken: (_ctx, client) => client.clientId === config.clientId,
    expiresWithSession: () => false,
    rotateRefreshToken: () => true,
    ttl: {
      AccessToken: 300,
      IdToken: 300,
      AuthorizationCode: 60,
      RefreshToken: 60 * 60 * 24 * 30,
      Session: 60 * 15,
      Interaction: 60 * 10,
      Grant: 60 * 60 * 24 * 30,
    },
    renderError: async (ctx) => {
      ctx.type = "html";
      ctx.set("Cache-Control", "no-store");
      ctx.set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      );
      ctx.body =
        '<!doctype html><html lang="ja"><meta charset="utf-8"><title>接続エラー</title><body><h1>接続できませんでした</h1><p>Cloud Palette に戻り、接続をやり直してください。</p></body></html>';
    },
    features: {
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      introspection: {
        enabled: true,
        allowedPolicy: (_ctx, client) =>
          client.clientId === "cloud-palette-resource-server",
      },
      revocation: {
        enabled: true,
        allowedPolicy: (_ctx, client, token) =>
          token.clientId === client.clientId,
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => {
          throw new errors.InvalidTarget("resource is required");
        },
        useGrantedResource: () => false,
        getResourceServerInfo: (_ctx, indicator, client) => {
          if (
            indicator !== config.resource ||
            client.clientId !== config.clientId
          )
            throw new errors.InvalidTarget();
          return {
            scope: "profiles:read",
            audience: config.resource,
            accessTokenFormat: "opaque",
            accessTokenTTL: 300,
          };
        },
      },
    },
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    findAccount: async (_ctx, sub) => ({
      accountId: sub,
      async claims() {
        return { sub };
      },
    }),
  });
  return provider;
}

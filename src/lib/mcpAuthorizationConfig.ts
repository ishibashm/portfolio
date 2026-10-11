import type { Configuration } from "oidc-provider";

export const MCP_PERSONAL_RESOURCE =
  "https://cloud-palette.com/api/mcp/personal";
export const MCP_PROFILE_SCOPE = "read:profiles";
const CONNECTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * 未接続のASポリシー。providerを生成せず、HTTPへmountもしない。
 * PR 9〜13で永続adapter・鍵・ログイン・同意を組み合わせるまで利用不可。
 * ライブラリをNode 20の既存サイト入口から読み込まない。
 */
export async function createMcpAuthorizationPolicy(): Promise<Configuration> {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("MCP_AUTH_REQUIRES_NODE_22");
  }
  const { errors } = await import("oidc-provider");
  return {
    clients: [],
    responseTypes: ["code"],
    scopes: [MCP_PROFILE_SCOPE],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      clientIdMetadataDocument: { enabled: false },
      userinfo: { enabled: false },
      revocation: { enabled: true },
      // RS内の検証adapterから照合する。公開introspectionはまだ提供しない。
      introspection: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => {
          throw new errors.InvalidTarget();
        },
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, resource) => {
          if (resource !== MCP_PERSONAL_RESOURCE)
            throw new errors.InvalidTarget();
          return {
            scope: MCP_PROFILE_SCOPE,
            audience: MCP_PERSONAL_RESOURCE,
            accessTokenTTL: 600,
            accessTokenFormat: "opaque",
          };
        },
      },
    },
    ttl: {
      AuthorizationCode: 60,
      AccessToken: 600,
      Grant: CONNECTION_SECONDS,
      RefreshToken: (_ctx, token) => {
        const remaining = CONNECTION_SECONDS - token.totalLifetime();
        if (!Number.isFinite(remaining) || remaining <= 0)
          throw new errors.InvalidGrant();
        return Math.min(CONNECTION_SECONDS, remaining);
      },
    },
    rotateRefreshToken: true,
    revokeGrantPolicy: () => true,
    // offline_accessを権限として追加せず、明示同意済みcode flowで発行する。
    issueRefreshToken: (_ctx, client) =>
      client.grantTypeAllowed("refresh_token"),
    // この段階ではログインも同意も完了させられない。
    findAccount: () => undefined,
    interactions: {
      url: () => {
        throw new errors.AccessDenied();
      },
    },
    // provider標準のエラー頁へ例外本文を差し込まない。
    renderError: (ctx) => {
      ctx.type = "text/plain";
      ctx.body = "Authorization unavailable";
    },
  };
}

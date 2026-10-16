import {
  createMemoryStore,
  memoryCryptoFromEnvironment,
  memoryEnabled,
} from "@/lib/personalMemory";
import { createMcpWorkspaceHandler } from "@/lib/mcpWorkspace";
import { createMcpConsentGrantWriter } from "@/lib/mcpDeletion";
import type { Configuration } from "oidc-provider";
import { createMcpAuthorizationPolicy } from "@/lib/mcpAuthorizationConfig";
import { createMcpStateCrypto } from "@/lib/mcpStateCrypto";
import { createMcpProviderStore } from "@/lib/mcpProviderStore";
import { createMcpProviderAdapter } from "@/lib/mcpProviderAdapter";
import { createMcpAuthenticator } from "@/lib/mcpAuth";
import { createMcpAuditStore } from "@/lib/mcpAuditStore";
import { createMcpRateStore } from "@/lib/mcpRateStore";
import { createMcpUsageStore } from "@/lib/mcpUsageStore";
import { createMcpProfileStore } from "@/lib/mcpProfileStore";
import { createMcpRuntimeDatabase } from "@/lib/mcpRuntimeDatabase";
import { createMcpPrivacyGuard } from "@/lib/mcpPrivacyGuard";
import { createMcpPersonalHttp } from "@/lib/mcpPersonalHttp";
import { createMcpConnectionService } from "@/lib/mcpConnections";
import { createMcpConnectionManagementService } from "@/lib/mcpConnectionViews";
import { createMcpConnectionsHandler } from "@/lib/mcpConnectionsApi";
import { createMcpSiteLoginVerifier } from "@/lib/mcpSiteLogin";
import {
  createMcpInteractionHandler,
  mcpInteractionPolicy,
} from "@/lib/mcpInteraction";
import {
  MCP_AUTHORIZATION_ISSUER,
  createMcpDiscoveryContract,
} from "@/lib/mcpDiscovery";

export type McpRuntimeConfig = {
  databaseUrl: string;
  state: Parameters<typeof createMcpStateCrypto>[0];
  consentKey: Uint8Array;
  cookieKeys: string[];
  jwks: NonNullable<Configuration["jwks"]>;
  clients: NonNullable<Configuration["clients"]>;
  login: Parameters<typeof createMcpSiteLoginVerifier>[0];
};

/** Server-only composition. Still deliberately unmounted: no env, timer, HTTP
 * listener or cleanup starts at import/construction. Callers must wrap EVERY
 * Node handler in database.scope.run with a bounded request deadline. */
export async function createMcpRuntime(config: McpRuntimeConfig) {
  const policy = await createMcpAuthorizationPolicy();
  // Do not silently use provider-generated signing/cookie keys or dynamic clients.
  if (
    !config.jwks.keys.length ||
    !config.cookieKeys.length ||
    config.cookieKeys.some((key) => key.length < 32) ||
    config.consentKey.byteLength !== 32 ||
    !config.clients.length
  )
    throw new Error("MCP_RUNTIME_CONFIGURATION_INVALID");
  const crypto = createMcpStateCrypto(config.state);
  const database = createMcpRuntimeDatabase(config.databaseUrl);
  const profiles = createMcpProfileStore(config.databaseUrl);
  const { db } = database;
  try {
    const store = createMcpProviderStore({
      db,
      grantKeyHash: (id) => crypto.digest("Grant", "id", id),
    });
    const adapter = await createMcpProviderAdapter({ crypto, store });
    const { Provider } = await import("oidc-provider");
    const provider = new Provider(MCP_AUTHORIZATION_ISSUER, {
      ...policy,
      ...mcpInteractionPolicy,
      clientBasedCORS: (_ctx, origin) =>
        origin === new URL(MCP_AUTHORIZATION_ISSUER).origin,
      adapter: adapter.adapter,
      jwks: config.jwks,
      cookies: { keys: config.cookieKeys },
      clients: config.clients,
    });
    provider.proxy = true;
    provider.on("server_error", () => undefined);
    Object.assign(provider, { silent: true });
    const audit = createMcpAuditStore({ db });
    const rate = createMcpRateStore({ db });
    const usage = createMcpUsageStore({ db });
    const discovery = createMcpDiscoveryContract({
      issuer: provider.issuer,
      authorization_endpoint: new URL(
        provider.pathFor("authorization"),
        provider.issuer,
      ).href,
      token_endpoint: new URL(provider.pathFor("token"), provider.issuer).href,
      revocation_endpoint: new URL(
        provider.pathFor("revocation"),
        provider.issuer,
      ).href,
      scopes_supported: policy.scopes,
      response_types_supported: policy.responseTypes,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    });
    // Await audit before Koa serializes a token/revocation response. Never use
    // async EventEmitter listeners (their promises are not awaited).
    provider.use(async (ctx, next) => {
      const started = performance.now();
      await next();
      const event =
        ctx.path === "/token" && ctx.oidc.params?.grant_type === "refresh_token"
          ? "refresh"
          : ctx.path === "/token/revocation"
            ? "revoke"
            : null;
      if (!event) return;
      try {
        await audit.record({
          userId: null,
          grantId: null,
          event,
          result: ctx.status < 400 ? "success" : "denied",
          durationMs: Math.floor(performance.now() - started),
        });
      } catch {
        ctx.status = 503;
        ctx.body = { error: "temporarily_unavailable" };
      }
    });
    const interaction = createMcpInteractionHandler({
      provider,
      db,
      signingKey: config.consentKey,
      verifySiteUser: createMcpSiteLoginVerifier(config.login),
      claimInteraction: adapter.claimInteraction,
      saveConsentGrant: createMcpConsentGrantWriter(db),
      audit,
    });
    const connections = createMcpConnectionService({ db, store, audit });
    const management = createMcpConnectionManagementService({
      connections,
      db,
      clients: new Map(
        config.clients.map((c) => [
          c.client_id,
          c.client_name ?? "名称不明の接続先",
        ]),
      ),
    });
    const connectionsHandler = createMcpConnectionsHandler({
      service: management,
      login: config.login,
    });
    const memory = memoryEnabled()
      ? createMemoryStore(db, memoryCryptoFromEnvironment())
      : undefined;
    const workspace = createMcpWorkspaceHandler({
      db,
      login: config.login,
      memory,
      audit,
      rate,
    });
    const personal = createMcpPersonalHttp({
      memory,
      authenticate: createMcpAuthenticator({
        issuer: provider.issuer,
        provider,
        db,
      }),
      profileReader: profiles.profileReader,
      run: createMcpPrivacyGuard({ audit, rate, usage }),
      audit,
      discovery,
    });
    return {
      provider,
      workspace,
      interaction,
      connections: connectionsHandler,
      discovery,
      scope: database.scope,
      async personal(request: Request) {
        const started = performance.now();
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(5000),
        ]);
        try {
          return await database.scope.run(
            { signal, remainingMs: () => 5000 - (performance.now() - started) },
            () => personal(request),
          );
        } catch {
          return Response.json(
            { error: "TEMPORARILY_UNAVAILABLE" },
            { status: 503, headers: { "Cache-Control": "private, no-store" } },
          );
        }
      },
      /** Invoke from a protected maintenance job, never a public GET or timer.
       * Each batch is bounded and idempotent. Repeat externally until counts=0. */
      async cleanup() {
        const started = performance.now();
        return database.scope.run(
          {
            signal: AbortSignal.timeout(5000),
            remainingMs: () => 5000 - (performance.now() - started),
          },
          async () => ({
            states: await store.purgeExpired(),
            audit: await audit.purgeExpired(),
            rate: await rate.purgeExpired(),
          }),
        );
      },
      async close() {
        await Promise.all([database.close(), profiles.close()]);
      },
    };
  } catch {
    await Promise.allSettled([database.close(), profiles.close()]);
    throw new Error("MCP_RUNTIME_CONFIGURATION_INVALID");
  }
}

export type McpRuntime = Awaited<ReturnType<typeof createMcpRuntime>>;

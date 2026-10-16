import type { PrismaClient } from "@prisma/client";
import type { Provider } from "oidc-provider";
import { z } from "zod";
import {
  MCP_PERSONAL_RESOURCE,
  MCP_PROFILE_SCOPE,
} from "@/lib/mcpAuthorizationConfig";

export class McpAuthError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHORIZED"
      | "INSUFFICIENT_SCOPE"
      | "TEMPORARILY_UNAVAILABLE",
  ) {
    super(code);
    this.name = "McpAuthError";
  }
  get status() {
    return this.code === "TEMPORARILY_UNAVAILABLE"
      ? 503
      : this.code === "INSUFFICIENT_SCOPE"
        ? 403
        : 401;
  }
}

const identifier = z.string().min(1).max(512);
const protocolToken = z.object({
  kind: z.literal("AccessToken"),
  tokenType: z.literal("Bearer"),
  accountId: z.uuid(),
  clientId: identifier,
  grantId: identifier,
  aud: z.literal(MCP_PERSONAL_RESOURCE),
  scope: z.string(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  jkt: z.undefined().optional(),
  "x5t#S256": z.undefined().optional(),
});
const protocolGrant = z.object({
  accountId: z.uuid(),
  clientId: identifier,
  exp: z.number().int().positive(),
});
const applicationGrant = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  clientId: identifier,
  providerGrantId: identifier,
  allowedProfileIds: z.array(identifier).min(1).max(100),
  createdAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.null(),
});

/** Internal, per-request output. Never construct this from tool arguments. */
export type McpAuthContext = Readonly<{
  userId: string;
  grantId: string;
  clientId: string;
  allowedProfileIds: readonly string[];
  memoryScopes?: readonly string[];
}>;

export type McpAuthBudget = Readonly<{
  signal: AbortSignal;
  remainingMs: () => number;
}>;

/**
 * Dormant RS adapter. Pass the locally configured provider with its persistent
 * adapter, not an issuer/token verifier selected by a request or a remote URL.
 * Opaque tokens are resolved by provider.AccessToken.find; no JWT decoding,
 * cookie auth, login bypass, DB/email linking, logging or global auth cache.
 */
export function createMcpAuthenticator(dependencies: {
  issuer: string;
  provider: Pick<Provider, "issuer" | "AccessToken" | "Grant">;
  db: Pick<PrismaClient, "mcpGrant">;
  now?: () => number;
}) {
  const { provider, db } = dependencies;
  let issuer: URL;
  try {
    issuer = new URL(dependencies.issuer);
  } catch {
    throw new McpAuthError("TEMPORARILY_UNAVAILABLE");
  }
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    provider.issuer !== dependencies.issuer
  ) {
    throw new McpAuthError("TEMPORARILY_UNAVAILABLE");
  }

  return async function authenticate(
    headers: Headers,
    budget?: McpAuthBudget,
  ): Promise<McpAuthContext> {
    // Reject multiple credentials, JWTs and non-opaque input before any lookup.
    const authorization = headers.get("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,512})$/i);
    if (!match) throw new McpAuthError("UNAUTHORIZED");
    try {
      // Stop the lookup chain after a late provider/DB completion. The provider's
      // own adapter still needs bounded I/O; this cannot cancel an active query.
      const checkBudget = () => {
        if (!budget) return;
        const remaining = budget.remainingMs();
        if (
          budget.signal.aborted ||
          !Number.isFinite(remaining) ||
          remaining <= 0 ||
          remaining > 5000
        )
          throw new McpAuthError("TEMPORARILY_UNAVAILABLE");
      };
      checkBudget();
      const token = protocolToken.safeParse(
        await provider.AccessToken.find(match[1]),
      );
      checkBudget();
      if (!token.success) throw new McpAuthError("UNAUTHORIZED");
      const now = (dependencies.now ?? Date.now)();
      const seconds = Math.floor(now / 1000);
      const t = token.data;
      if (
        !Number.isFinite(now) ||
        t.iat > seconds ||
        t.exp <= seconds ||
        t.exp <= t.iat ||
        t.exp - t.iat > 600
      )
        throw new McpAuthError("UNAUTHORIZED");
      const scopes = t.scope.split(" ");
      if (!scopes.includes(MCP_PROFILE_SCOPE))
        throw new McpAuthError("INSUFFICIENT_SCOPE");
      // The provider's protocol grant may have been revoked by refresh replay.
      const pg = protocolGrant.safeParse(await provider.Grant.find(t.grantId));
      checkBudget();
      if (
        !pg.success ||
        pg.data.accountId !== t.accountId ||
        pg.data.clientId !== t.clientId ||
        pg.data.exp <= seconds
      )
        throw new McpAuthError("UNAUTHORIZED");
      const row = applicationGrant.safeParse(
        await db.mcpGrant.findUnique({
          where: { providerGrantId: t.grantId },
          select: {
            id: true,
            userId: true,
            clientId: true,
            providerGrantId: true,
            allowedProfileIds: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        }),
      );
      checkBudget();
      if (!row.success) throw new McpAuthError("UNAUTHORIZED");
      const grant = row.data;
      const completedAt = (dependencies.now ?? Date.now)();
      // Lookup latency must not allow a token/grant that expired during I/O.
      const completedSeconds = Math.floor(completedAt / 1000);
      if (
        !Number.isFinite(completedAt) ||
        completedAt < now ||
        t.exp <= completedSeconds ||
        pg.data.exp <= completedSeconds ||
        grant.userId !== t.accountId ||
        grant.clientId !== t.clientId ||
        grant.providerGrantId !== t.grantId ||
        grant.createdAt.getTime() > now ||
        grant.expiresAt.getTime() <= completedAt ||
        grant.expiresAt.getTime() <= grant.createdAt.getTime() ||
        grant.expiresAt.getTime() - grant.createdAt.getTime() >
          30 * 86400_000 ||
        new Set(grant.allowedProfileIds).size !== grant.allowedProfileIds.length
      )
        throw new McpAuthError("UNAUTHORIZED");
      return Object.freeze({
        userId: grant.userId,
        grantId: grant.id,
        clientId: grant.clientId,
        allowedProfileIds: Object.freeze([...grant.allowedProfileIds]),
        ...(process.env.MCP_MEMORY_ENABLED === "true"
          ? {
              memoryScopes: Object.freeze(
                scopes.filter((scope) =>
                  ["read:memory", "write:memory"].includes(scope),
                ),
              ),
            }
          : {}),
      });
    } catch (error) {
      if (error instanceof McpAuthError) throw error;
      // Never attach provider/DB errors, which can contain credentials or data.
      throw new McpAuthError("TEMPORARILY_UNAVAILABLE");
    }
  };
}

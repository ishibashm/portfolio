import { randomUUID } from "node:crypto";
import type { McpAuditStore } from "@/lib/mcpAuditStore";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { McpGrant, PrismaClient } from "@prisma/client";
import type { Configuration, Provider } from "oidc-provider";
import { z } from "zod";
import { createMcpConsentService, McpConsentError } from "@/lib/mcpConsent";
import {
  MCP_CONSENT_HEADERS,
  renderMcpConsentPage,
} from "@/lib/mcpConsentPage";
import { MCP_AUTHORIZATION_ISSUER } from "@/lib/mcpDiscovery";
import {
  MCP_PERSONAL_RESOURCE,
  MCP_PROFILE_SCOPE,
} from "@/lib/mcpAuthorizationConfig";

const ORIGIN = new URL(MCP_AUTHORIZATION_ISSUER).origin;
const HOST = new URL(ORIGIN).host;
const uidPattern = /^[A-Za-z0-9_-]{16,128}$/;

/** Compose only with the locked authorization policy; no provider is started here. */
export const mcpInteractionPolicy: Pick<
  Configuration,
  "interactions" | "findAccount" | "loadExistingGrant"
> = {
  // Every new authorization requires a fresh profile selection. Only a grant
  // returned by this interaction may be loaded on resume; never a session grant.
  loadExistingGrant: async (ctx) => {
    const grantId = ctx.oidc.result?.consent?.grantId;
    return grantId ? ctx.oidc.provider.Grant.find(grantId) : undefined;
  },
  interactions: {
    url: (_ctx, interaction) => {
      if (!uidPattern.test(interaction.uid))
        throw new McpConsentError("INVALID_REQUEST");
      return `${ORIGIN}/oauth/interaction/${interaction.uid}`;
    },
  },
  // The account was verified with Supabase in this browser interaction. No email,
  // user metadata, local bypass, or NextAuth ID is accepted as its subject.
  findAccount: (_ctx, accountId) =>
    z.uuid().safeParse(accountId).success
      ? { accountId, claims: async () => ({ sub: accountId }) }
      : undefined,
};

async function readForm(req: IncomingMessage) {
  if (
    !/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(
      req.headers["content-type"] ?? "",
    )
  )
    throw new McpConsentError("INVALID_REQUEST");
  if (
    req.headers["content-encoding"] ||
    Number(req.headers["content-length"] ?? 0) > 32768
  )
    throw new McpConsentError("INVALID_REQUEST");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 32768) throw new McpConsentError("INVALID_REQUEST");
    chunks.push(bytes);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if (
    [...form.keys()].some(
      (k) => !["ticket", "decision", "profileIds", "memoryScopes"].includes(k),
    ) ||
    form.getAll("ticket").length !== 1 ||
    form.getAll("decision").length !== 1
  )
    throw new McpConsentError("INVALID_REQUEST");
  return {
    ticket: form.get("ticket"),
    decision: form.get("decision"),
    profileIds: form.getAll("profileIds"),
    memoryScopes: form.getAll("memoryScopes"),
  };
}

/**
 * Dormant Node handler. Must not be mounted until the persistent provider adapter,
 * atomic claim, audit/limits, revocation and end-to-end release gates are complete.
 * claimInteraction MUST be shared and atomic, retain the claim until expiresAt,
 * and return false for any later submission (including another form/tab/worker).
 */
export function createMcpInteractionHandler(deps: {
  provider: Pick<
    Provider,
    "issuer" | "interactionDetails" | "interactionFinished" | "Client" | "Grant"
  >;
  db: Pick<PrismaClient, "user_configs" | "mcpGrant">;
  signingKey: Uint8Array;
  verifySiteUser: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<unknown>;
  claimInteraction: (uid: string, expiresAt: Date) => Promise<boolean>;
  now?: () => number;
  audit?: Pick<McpAuditStore, "record">;
  saveConsentGrant?: (
    data: McpGrant,
    profiles: { id: string; name: string }[],
  ) => Promise<void>;
}) {
  if (deps.provider.issuer !== MCP_AUTHORIZATION_ISSUER)
    throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
  const consent = createMcpConsentService(deps);
  const now = deps.now ?? Date.now;
  return async (req: IncomingMessage, res: ServerResponse) => {
    for (const [name, value] of Object.entries(MCP_CONSENT_HEADERS))
      res.setHeader(name, value);
    const started = performance.now();
    let protocolGrant: InstanceType<Provider["Grant"]> | undefined;
    let appGrantId: string | undefined;
    try {
      // No redirect or HTML may be constructed from untrusted proxy/Host values.
      if (
        req.headers.host !== HOST ||
        (req.headers["x-forwarded-host"] &&
          req.headers["x-forwarded-host"] !== HOST) ||
        (req.headers["x-forwarded-proto"] &&
          req.headers["x-forwarded-proto"] !== "https")
      )
        throw new McpConsentError("INVALID_REQUEST");
      const match = req.url?.match(
        /^\/oauth\/interaction\/([A-Za-z0-9_-]{16,128})$/,
      );
      if (!match) throw new McpConsentError("INVALID_REQUEST");
      if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        res.writeHead(405).end();
        return;
      }
      if (
        req.method === "POST" &&
        (req.headers.origin !== ORIGIN ||
          (req.headers["sec-fetch-site"] &&
            req.headers["sec-fetch-site"] !== "same-origin"))
      )
        throw new McpConsentError("INVALID_REQUEST");
      // The provider verifies its signed interaction cookie and current session.
      let details;
      try {
        details = await deps.provider.interactionDetails(req, res);
      } catch (error) {
        const { errors } = await import("oidc-provider");
        throw new McpConsentError(
          error instanceof errors.SessionNotFound
            ? "INVALID_REQUEST"
            : "TEMPORARILY_UNAVAILABLE",
        );
      }
      if (details.uid !== match[1])
        throw new McpConsentError("INVALID_REQUEST");
      const userId = await deps.verifySiteUser(req, res);
      if (!z.uuid().safeParse(userId).success) {
        if (req.method === "GET") {
          res
            .writeHead(303, {
              Location: `/login?next=${encodeURIComponent(`/oauth/interaction/${match[1]}`)}`,
            })
            .end();
          return;
        }
        throw new McpConsentError("LOGIN_REQUIRED");
      }
      const clientId = details.params.client_id;
      if (typeof clientId !== "string")
        throw new McpConsentError("INVALID_REQUEST");
      const client = await deps.provider.Client.find(clientId);
      if (!client) throw new McpConsentError("INVALID_REQUEST");
      const view = await consent.load(userId, details, client);
      if (req.method === "GET") {
        res
          .writeHead(200)
          .end(renderMcpConsentPage(view, consent.issueTicket(view)));
        return;
      }
      const submission = consent.verifySubmission(view, await readForm(req));
      if (
        view.interactionExpiresAt <= now() ||
        !(await deps.claimInteraction(
          view.uid,
          new Date(view.interactionExpiresAt),
        ))
      )
        throw new McpConsentError("INVALID_REQUEST");
      if (submission.decision === "deny") {
        await deps.audit?.record({
          userId: view.userId,
          grantId: null,
          event: "authorize",
          result: "denied",
          durationMs: Math.floor(performance.now() - started),
        });
        await deps.provider.interactionFinished(
          req,
          res,
          { error: "access_denied" },
          { mergeWithLastSubmission: false },
        );
        return;
      }
      protocolGrant = new deps.provider.Grant({
        accountId: view.userId,
        clientId: view.clientId,
      });
      // The scope is advertised by both AS and resource; satisfy both checks
      // without granting openid, email, profile or any extra permission.
      const scopes = [
        MCP_PROFILE_SCOPE,
        ...(submission.memoryScopes ?? []),
      ].join(" ");
      protocolGrant.addOIDCScope(scopes);
      protocolGrant.addResourceScope(MCP_PERSONAL_RESOURCE, scopes);
      const providerGrantId = await protocolGrant.save();
      // save() persists exp but does not populate it on the new instance.
      const savedGrant = await deps.provider.Grant.find(providerGrantId);
      const createdAt = new Date(now());
      const expiresAt = new Date(
        Math.min(
          (savedGrant?.exp ?? 0) * 1000,
          createdAt.getTime() + 30 * 86400_000,
        ),
      );
      if (expiresAt <= createdAt)
        throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
      appGrantId = randomUUID();
      const grantData: McpGrant = {
        id: appGrantId,
        providerGrantId,
        userId: view.userId,
        clientId: view.clientId,
        allowedProfileIds: submission.profileIds,
        createdAt,
        expiresAt,
        revokedAt: null,
        lastUsedAt: null,
      };
      if (deps.saveConsentGrant)
        await deps.saveConsentGrant(grantData, view.profiles);
      else await deps.db.mcpGrant.create({ data: grantData });
      await deps.audit?.record({
        userId: view.userId,
        grantId: appGrantId,
        event: "authorize",
        result: "success",
        durationMs: Math.floor(performance.now() - started),
      });
      // Redirect only through the provider's saved returnTo; no submitted redirect.
      await deps.provider.interactionFinished(
        req,
        res,
        {
          login: { accountId: view.userId },
          consent: { grantId: providerGrantId },
        },
        { mergeWithLastSubmission: false },
      );
    } catch (error) {
      // Compensate incomplete creation; RS also checks both grants on every call.
      if (appGrantId) {
        try {
          await deps.db.mcpGrant.updateMany({
            where: { id: appGrantId },
            data: { revokedAt: new Date(now()) },
          });
        } catch {
          /* Fail closed via protocol grant removal too. */
        }
      }
      if (protocolGrant) {
        try {
          await protocolGrant.destroy();
        } catch {
          /* No raw exception or credential logging. */
        }
      }
      if (!res.headersSent) {
        res.removeHeader("Location");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        const code =
          error instanceof McpConsentError
            ? error.code
            : "TEMPORARILY_UNAVAILABLE";
        res
          .writeHead(
            code === "LOGIN_REQUIRED"
              ? 401
              : code === "INVALID_REQUEST"
                ? 400
                : 503,
          )
          .end(code);
      } else if (!res.writableEnded) res.end();
    }
  };
}

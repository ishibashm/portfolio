import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  MCP_PERSONAL_RESOURCE,
  MCP_PROFILE_SCOPE,
  mcpScopes,
} from "@/lib/mcpAuthorizationConfig";

export class McpConsentError extends Error {
  constructor(
    public readonly code:
      | "INVALID_REQUEST"
      | "LOGIN_REQUIRED"
      | "TEMPORARILY_UNAVAILABLE",
  ) {
    super(code);
    this.name = "McpConsentError";
  }
}

const id = z.string().min(1).max(512);
const profile = z.object({ id, name: z.string().min(1).max(100) });
const interactionSchema = z.object({
  uid: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  exp: z.number().int().positive(),
  prompt: z.object({ name: z.enum(["login", "consent"]) }),
  params: z.object({
    client_id: id,
    redirect_uri: z.url(),
    response_type: z.literal("code"),
    scope: z.string().refine((value) => {
      const scopes = value.split(" ");
      return (
        scopes.includes(MCP_PROFILE_SCOPE) &&
        new Set(scopes).size === scopes.length &&
        scopes.every((scope) => mcpScopes().includes(scope))
      );
    }),
    resource: z.literal(MCP_PERSONAL_RESOURCE),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal("S256"),
  }),
  session: z.object({ accountId: z.uuid() }).optional(),
  result: z.unknown().optional(),
});

export type McpConsentView = {
  uid: string;
  userId: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  interactionExpiresAt: number;
  binding: string;
  profiles: { id: string; name: string }[];
  memoryScopes?: string[];
};

/** Internal browser-consent boundary; never accepts a user ID from a form. */
export function createMcpConsentService(deps: {
  db: Pick<PrismaClient, "user_configs">;
  signingKey: Uint8Array;
  now?: () => number;
}) {
  if (deps.signingKey.byteLength < 32)
    throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
  const key = Buffer.from(deps.signingKey);
  const now = deps.now ?? Date.now;
  const mac = (value: string) =>
    createHmac("sha256", key).update(value).digest("base64url");
  const binding = (view: McpConsentView) =>
    JSON.stringify([
      "mcp-consent-v1",
      view.uid,
      view.userId,
      view.clientId,
      view.redirectUri,
      view.interactionExpiresAt,
      view.binding,
      view.profiles,
      view.memoryScopes ?? [],
    ]);
  return {
    async load(
      userId: unknown,
      interaction: unknown,
      client: {
        clientId: string;
        clientName?: string;
        redirectUris?: readonly string[];
      },
    ): Promise<McpConsentView> {
      const user = z.uuid().safeParse(userId);
      if (!user.success) throw new McpConsentError("LOGIN_REQUIRED");
      const parsed = interactionSchema.safeParse(interaction);
      if (!parsed.success) throw new McpConsentError("INVALID_REQUEST");
      const i = parsed.data;
      const time = now();
      if (
        !Number.isFinite(time) ||
        i.exp * 1000 <= time ||
        i.result !== undefined ||
        (i.session && i.session.accountId !== user.data) ||
        client.clientId !== i.params.client_id ||
        !client.redirectUris?.includes(i.params.redirect_uri)
      )
        throw new McpConsentError("INVALID_REQUEST");
      // Redirect matching is also performed by the provider before interaction.
      // Never redirect using a form field or allow a URI prefix match here.
      let row;
      try {
        row = await deps.db.user_configs.findFirst({
          where: { user_id: user.data },
          select: { presets: true },
        });
      } catch {
        throw new McpConsentError("TEMPORARILY_UNAVAILABLE");
      }
      const profiles = z
        .array(profile)
        .max(100)
        .safeParse(row?.presets ?? []);
      if (
        !profiles.success ||
        new Set(profiles.data.map((p) => p.id)).size !== profiles.data.length
      )
        throw new McpConsentError("INVALID_REQUEST");
      // The binding covers state/nonce and every provider-validated parameter too.
      const rawParams = (interaction as { params: unknown }).params;
      return {
        uid: i.uid,
        userId: user.data,
        clientId: client.clientId,
        clientName: client.clientName?.slice(0, 200) || client.clientId,
        redirectUri: i.params.redirect_uri,
        interactionExpiresAt: i.exp * 1000,
        binding: mac(JSON.stringify(rawParams)),
        profiles: profiles.data,
        memoryScopes: i.params.scope
          .split(" ")
          .filter((scope) => scope !== MCP_PROFILE_SCOPE),
      };
    },
    issueTicket(view: McpConsentView) {
      const expires = Math.min(now() + 300_000, view.interactionExpiresAt);
      const prefix = `${expires}.${randomBytes(32).toString("base64url")}`;
      return `${prefix}.${mac(`${prefix}.${binding(view)}`)}`;
    },
    verifySubmission(view: McpConsentView, input: unknown) {
      const parsed = z
        .strictObject({
          ticket: z.string().max(200),
          decision: z.enum(["allow", "deny"]),
          profileIds: z.array(id).max(100),
          memoryScopes: z
            .array(z.enum(["read:memory", "write:memory"]))
            .max(2)
            .optional(),
        })
        .safeParse(input);
      if (!parsed.success) throw new McpConsentError("INVALID_REQUEST");
      const { ticket, decision, profileIds } = parsed.data;
      const memoryScopes = parsed.data.memoryScopes ?? [];
      if (
        new Set(memoryScopes).size !== memoryScopes.length ||
        memoryScopes.some((scope) => !view.memoryScopes?.includes(scope))
      )
        throw new McpConsentError("INVALID_REQUEST");
      const parts = ticket.match(
        /^(\d{13})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/,
      );
      const time = now();
      if (
        !parts ||
        !Number.isFinite(time) ||
        Number(parts[1]) <= time ||
        Number(parts[1]) > time + 300_000 ||
        Number(parts[1]) > view.interactionExpiresAt
      )
        throw new McpConsentError("INVALID_REQUEST");
      const expected = mac(`${parts[1]}.${parts[2]}.${binding(view)}`);
      if (!timingSafeEqual(Buffer.from(expected), Buffer.from(parts[3])))
        throw new McpConsentError("INVALID_REQUEST");
      if (decision === "deny") return { decision, profileIds: [] };
      const available = new Set(view.profiles.map((p) => p.id));
      if (
        !profileIds.length ||
        new Set(profileIds).size !== profileIds.length ||
        profileIds.some((p) => !available.has(p))
      )
        throw new McpConsentError("INVALID_REQUEST");
      // A shared atomic interaction claim must precede grant creation (PR 12c/13).
      return {
        decision,
        profileIds: [...profileIds],
        ...(memoryScopes.length ? { memoryScopes } : {}),
      };
    },
  };
}

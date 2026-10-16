import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { createMcpServer } from "@/lib/mcpServer";
import { createMcpPersonalServer } from "@/lib/mcpPersonalServer";
import { createMcpSiteLoginVerifier } from "@/lib/mcpSiteLogin";
import { mcpAuditEvent, type McpAuditStore } from "@/lib/mcpAuditStore";
import type { McpRateStore } from "@/lib/mcpRateStore";
import {
  MemoryError,
  memoryEnabled,
  type MemoryStore,
} from "@/lib/personalMemory";

export const consoleEnabled = () => process.env.MCP_CONSOLE_ENABLED === "true";
const requestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("tools"), personal: z.boolean() }),
  z.strictObject({
    action: z.literal("call"),
    personal: z.boolean(),
    name: z.string().max(100),
    arguments: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ action: z.literal("history"), after: z.uuid().optional() }),
  z.strictObject({
    action: z.literal("memory"),
    operation: z.enum(["list", "create", "update", "delete", "clear"]),
    value: z.unknown().optional(),
  }),
]);
export function createMcpWorkspaceHandler(deps: {
  db: Pick<PrismaClient, "user_configs" | "mcpAccessAudit">;
  login: Parameters<typeof createMcpSiteLoginVerifier>[0];
  memory?: MemoryStore;
  audit: Pick<McpAuditStore, "record">;
  rate: Pick<McpRateStore, "reserve" | "release">;
}) {
  const verify = createMcpSiteLoginVerifier(deps.login);
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Cookie");
    const reply = (status: number, value: unknown) => {
      if (!res.writableEnded) res.writeHead(status).end(JSON.stringify(value));
    };
    if (!consoleEnabled() && !memoryEnabled()) {
      reply(404, {});
      return;
    }
    let lease: { userId: string; requestId: string } | undefined;
    try {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        reply(405, {});
        return;
      }
      if (
        req.headers.host !== "cloud-palette.com" ||
        req.headers.origin !== "https://cloud-palette.com" ||
        req.headers["x-mcp-management"] !== "1" ||
        (req.headers["sec-fetch-site"] &&
          req.headers["sec-fetch-site"] !== "same-origin") ||
        !/^application\/json(?:;\s*charset=utf-8)?$/i.test(
          req.headers["content-type"] ?? "",
        ) ||
        req.headers["content-encoding"]
      ) {
        reply(400, { error: "INVALID_REQUEST" });
        return;
      }
      const userId = await verify(req, res);
      if (!userId) {
        reply(401, { error: "LOGIN_REQUIRED" });
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 32768) {
          reply(413, { error: "PAYLOAD_TOO_LARGE" });
          return;
        }
        chunks.push(buffer);
      }
      let input: z.infer<typeof requestSchema>;
      try {
        input = requestSchema.parse(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
      } catch {
        reply(400, { error: "INVALID_REQUEST" });
        return;
      }
      if (input.action === "memory" ? !memoryEnabled() : !consoleEnabled()) {
        reply(404, {});
        return;
      }
      const requestId = randomUUID();
      const timeCalculation =
        input.action === "call" && input.name === "judge_time_slots";
      const decision = await deps.rate.reserve({
        userId,
        requestId,
        timeCalculation,
      });
      if (!decision.allowed) {
        res.setHeader("Retry-After", decision.retryAfterSeconds);
        reply(429, { error: "RATE_LIMITED" });
        return;
      }
      if (timeCalculation) lease = { userId, requestId };
      if (input.action === "history") {
        const rows = await deps.db.mcpAccessAudit.findMany({
          where: {
            userId,
            grantId: { not: null },
            expiresAt: { gt: new Date() },
            ...(input.after ? { requestId: { gt: input.after } } : {}),
          },
          orderBy: { requestId: "asc" },
          take: 51,
          select: {
            requestId: true,
            grantId: true,
            event: true,
            result: true,
            occurredAt: true,
            durationMs: true,
          },
        });
        reply(200, {
          history: rows.slice(0, 50),
          nextCursor: rows.length > 50 ? rows[49].requestId : null,
        });
        return;
      }
      const started = performance.now();
      if (input.action === "memory") {
        if (!deps.memory) throw new MemoryError("TEMPORARILY_UNAVAILABLE");
        const events = {
          list: "list_memories",
          create: "create_memory",
          update: "update_memory",
          delete: "delete_memory",
          clear: "delete_memory",
        } as const;
        let value;
        try {
          value = await deps.memory.run(userId, input.operation, input.value);
        } catch (error) {
          await deps.audit.record({
            userId,
            grantId: null,
            event: events[input.operation],
            result:
              error instanceof MemoryError &&
              error.code !== "TEMPORARILY_UNAVAILABLE"
                ? "invalid"
                : "unavailable",
            durationMs: Math.floor(performance.now() - started),
          });
          throw error;
        }
        await deps.audit.record({
          userId,
          grantId: null,
          event: events[input.operation],
          result: "success",
          durationMs: Math.floor(performance.now() - started),
        });
        reply(200, value);
        return;
      }
      // Cookie identity is used only for this site's service, never as an MCP token.
      const row = input.personal
        ? await deps.db.user_configs.findFirst({
            where: { user_id: userId },
            select: {
              presets: true,
              metaphysical_config: true,
              updated_at: true,
            },
          })
        : null;
      const profiles = z
        .array(z.object({ id: z.string() }))
        .max(100)
        .parse(row?.presets ?? []);
      const server = input.personal
        ? createMcpPersonalServer(
            {
              userId,
              grantId: randomUUID(),
              clientId: "site-console",
              allowedProfileIds: profiles.map((p) => p.id),
              memoryScopes: ["read:memory", "write:memory"],
            },
            new Date(),
            async () => row,
            deps.memory,
          )
        : createMcpServer();
      const client = new Client({
        name: "cloud-palette-console",
        version: "1",
      });
      const [a, b] = InMemoryTransport.createLinkedPair();
      try {
        await server.connect(b);
        await client.connect(a);
        const tools = await client.listTools();
        if (input.action === "tools") {
          reply(200, tools);
          return;
        }
        if (!tools.tools.some((tool) => tool.name === input.name)) {
          reply(400, { error: "INVALID_TOOL" });
          return;
        }
        const output = await client.callTool(
          { name: input.name, arguments: input.arguments },
          undefined,
          { timeout: 4000 },
        );
        const event = mcpAuditEvent.parse(input.name);
        await deps.audit.record({
          userId,
          grantId: null,
          event,
          result: output.isError ? "invalid" : "success",
          durationMs: Math.floor(performance.now() - started),
        });
        // SDK validation errors can echo inputs. Show only fixed failures.
        reply(
          200,
          output.isError
            ? { isError: true, error: "INVALID_INPUT_OR_UNAVAILABLE" }
            : output,
        );
      } finally {
        await client.close().catch(() => undefined);
        await server.close().catch(() => undefined);
      }
    } catch (error) {
      const code =
        error instanceof MemoryError ? error.code : "TEMPORARILY_UNAVAILABLE";
      reply(code === "TEMPORARILY_UNAVAILABLE" ? 503 : 400, { error: code });
    } finally {
      if (lease)
        await deps.rate
          .release(lease.userId, lease.requestId)
          .catch(() => undefined);
    }
  };
}

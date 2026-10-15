import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  McpConnectionError,
  type createMcpConnectionService,
} from "@/lib/mcpConnections";

type Connections = ReturnType<typeof createMcpConnectionService>;
const profile = z.object({
  id: z.string().min(1).max(512),
  name: z.string().min(1).max(100),
});

/** Compose with the verified-login management handler, never a public MCP tool.
 * Names are display text only. Broken/deleted presets must not prevent revocation.
 * No route, client registry, or database client is created here. */
export function createMcpConnectionManagementService(deps: {
  connections: Connections;
  db: Pick<PrismaClient, "user_configs">;
  clients: ReadonlyMap<string, string>;
}) {
  return {
    ...deps.connections,
    async list(user: unknown, after?: unknown) {
      // Validate before either service or profile read, even with injected services.
      const parsed = z.uuid().safeParse(user);
      if (!parsed.success) throw new McpConnectionError("LOGIN_REQUIRED");
      const page = await deps.connections.list(parsed.data, after);
      const names = new Map<string, string>();
      if (page.connections.length) {
        let row;
        try {
          row = await deps.db.user_configs.findFirst({
            where: { user_id: parsed.data },
            select: { presets: true },
          });
        } catch {
          throw new McpConnectionError("TEMPORARILY_UNAVAILABLE");
        }
        const profiles = z
          .array(profile)
          .max(100)
          .safeParse(row?.presets ?? []);
        // Ambiguous IDs cannot safely supply a label. Keep revocation available.
        if (
          profiles.success &&
          new Set(profiles.data.map((p) => p.id)).size === profiles.data.length
        )
          for (const p of profiles.data) names.set(p.id, p.name);
      }
      return {
        connections: page.connections.map((connection) => ({
          ...connection,
          clientName:
            deps.clients.get(connection.clientId)?.slice(0, 200) ||
            "名称不明の接続先",
          profiles: connection.allowedProfileIds.map((id) => ({
            id,
            name: names.get(id) ?? null,
          })),
        })),
        nextCursor: page.nextCursor,
      };
    },
  };
}

export type McpConnectionsView = Awaited<
  ReturnType<ReturnType<typeof createMcpConnectionManagementService>["list"]>
>;

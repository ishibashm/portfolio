import { z } from "zod";
import { McpProfileError, type McpProfileReader } from "@/lib/mcpProfiles";
import { createMcpDatabase } from "@/lib/mcpDatabase";

/** Dormant, dedicated non-logging pool. No environment fallback or connections
 * until read. The caller owns shutdown; actual proxy timeouts need deployment
 * verification. Only minimum profile columns for one validated owner are read.
 */
export function createMcpProfileStore(connectionString: string) {
  const db = createMcpDatabase(connectionString);
  return {
    profileReader(
      signal: AbortSignal,
      remainingMs: () => number,
    ): McpProfileReader {
      return async (userId) => {
        try {
          if (!z.uuid().safeParse(userId).success)
            throw new McpProfileError("INVALID_INPUT");
          const result = await db.query<{
            presets: unknown;
            metaphysical_config: unknown;
            updated_at: Date;
          }>(
            "SELECT presets, metaphysical_config, updated_at FROM user_configs WHERE user_id = $1::uuid LIMIT 1",
            [userId],
            { signal, remainingMs },
          );
          return result.rows[0] ?? null;
        } catch {
          throw new McpProfileError("TEMPORARILY_UNAVAILABLE");
        }
      };
    },
    async close() {
      try {
        await db.close();
      } catch {
        throw new McpProfileError("TEMPORARILY_UNAVAILABLE");
      }
    },
  };
}

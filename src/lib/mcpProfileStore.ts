import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { McpProfileError, type McpProfileReader } from "@/lib/mcpProfiles";

/** Dormant, dedicated non-logging pool. No environment fallback, no connections
 * until read, no migrations. The caller owns shutdown. Startup statement_timeout
 * must be supported by the actual Postgres/proxy before this can be deployed.
 */
export function createMcpProfileStore(connectionString: string) {
  try {
    const url = new URL(connectionString);
    // pg merges URI parameters over pool options. Do not allow them to silently
    // disable timeouts or replace connection credentials/configuration.
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error("MCP_DATABASE_CONFIGURATION_INVALID");
  }
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 1000,
    statement_timeout: 4000,
    query_timeout: 4500,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  // Never print driver errors (they can include credentials, SQL and values).
  pool.on("error", () => undefined);
  return {
    profileReader(
      signal: AbortSignal,
      remainingMs: () => number,
    ): McpProfileReader {
      return async (userId) => {
        const budget = () => {
          const remaining = Math.floor(remainingMs());
          if (signal.aborted || !Number.isFinite(remaining) || remaining < 1)
            throw new McpProfileError("TEMPORARILY_UNAVAILABLE");
          return Math.min(4000, remaining);
        };
        let client: PoolClient | undefined;
        let released = false;
        const release = (destroy: boolean) => {
          if (client && !released) {
            released = true;
            client.release(destroy);
          }
        };
        const abort = () => release(true);
        try {
          if (!z.uuid().safeParse(userId).success)
            throw new McpProfileError("INVALID_INPUT");
          budget();
          client = await pool.connect();
          // A connection acquired after the HTTP deadline is never queried.
          budget();
          signal.addEventListener("abort", abort, { once: true });
          const timeout = budget();
          // pg's installed runtime accepts a per-query timeout; @types/pg only
          // declares the pool default. Keep that extra field on a named object.
          const query = {
            text: "SELECT presets, metaphysical_config, updated_at FROM user_configs WHERE user_id = $1::uuid LIMIT 1",
            values: [userId],
            query_timeout: timeout,
          };
          const result = await client.query<{
            presets: unknown;
            metaphysical_config: unknown;
            updated_at: Date;
          }>(query);
          budget();
          release(false);
          return result.rows[0] ?? null;
        } catch {
          release(true);
          throw new McpProfileError("TEMPORARILY_UNAVAILABLE");
        } finally {
          signal.removeEventListener("abort", abort);
        }
      };
    },
    async close() {
      try {
        await pool.end();
      } catch {
        throw new McpProfileError("TEMPORARILY_UNAVAILABLE");
      }
    },
  };
}

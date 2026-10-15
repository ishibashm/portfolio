import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { McpAuthBudget } from "@/lib/mcpAuth";
import { McpPrivacyError } from "@/lib/mcpAuditStore";

/** Dormant dedicated pool: explicit configuration, no site singleton or logging.
 * Single parameterized statements only; transaction ownership stays with callers
 * that need a transaction-capable adapter. The caller must close this pool.
 * Socket destruction does not prove immediate cancellation at a remote proxy.
 */
export function createMcpDatabase(connectionString: string) {
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
    async query<Row extends QueryResultRow>(
      text: string,
      values: unknown[],
      budget: McpAuthBudget,
    ) {
      const remaining = () => {
        const ms = budget.remainingMs();
        if (
          budget.signal.aborted ||
          !Number.isFinite(ms) ||
          ms < 1 ||
          ms > 5000
        )
          throw new McpPrivacyError();
        return Math.min(4000, Math.floor(ms));
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
        remaining();
        client = await pool.connect();
        remaining();
        budget.signal.addEventListener("abort", abort, { once: true });
        const query = { text, values, query_timeout: remaining() };
        const result = await client.query<Row>(query);
        remaining();
        release(false);
        return result;
      } catch {
        release(true);
        throw new McpPrivacyError();
      } finally {
        budget.signal.removeEventListener("abort", abort);
      }
    },
    async close() {
      try {
        await pool.end();
      } catch {
        throw new McpPrivacyError();
      }
    },
  };
}
export type McpDatabase = ReturnType<typeof createMcpDatabase>;

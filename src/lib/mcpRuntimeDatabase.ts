import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { McpAuthBudget } from "@/lib/mcpAuth";
import { McpPrivacyError } from "@/lib/mcpAuditStore";

/** Request-local deadlines also cover provider callbacks, transactions, audit and
 * rate queries. A late query cannot start the next query or publish its result.
 * PostgreSQL independently bounds active statements; this is not SQL rollback
 * after commit or instantaneous cancellation at a database proxy. */
export function createMcpDatabaseScope() {
  const storage = new AsyncLocalStorage<McpAuthBudget>();
  const check = () => {
    const budget = storage.getStore();
    const remaining = budget?.remainingMs();
    if (
      !budget ||
      budget.signal.aborted ||
      remaining === undefined ||
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      remaining > 5000
    )
      throw new McpPrivacyError();
  };
  return {
    run<T>(budget: McpAuthBudget, work: () => Promise<T>) {
      return storage.run(budget, async () => {
        check();
        const result = await work();
        check();
        return result;
      });
    },
    async query<T>(work: () => Promise<T>) {
      try {
        check();
        const result = await work();
        check();
        return result;
      } catch {
        throw new McpPrivacyError();
      }
    },
  };
}

/** Dedicated, non-logging Prisma pool; never imports the site's DB singleton.
 * Construction does not connect. All actual operations require a live scope. */
export function createMcpRuntimeDatabase(connectionString: string) {
  try {
    const url = new URL(connectionString);
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
  const scope = createMcpDatabaseScope();
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 1000,
    statement_timeout: 4000,
    query_timeout: 4500,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  pool.on("error", () => undefined);
  const factory = new PrismaPg(pool, { disposeExternalPool: false });
  // Guard at the driver boundary, including transaction SQL. Preserve Prisma's
  // public client type instead of casting an extended client back to it.
  const adapter: NonNullable<
    ConstructorParameters<typeof PrismaClient>[0]
  >["adapter"] = {
    provider: factory.provider,
    adapterName: factory.adapterName,
    async connect() {
      const driver = await factory.connect();
      return {
        provider: driver.provider,
        adapterName: driver.adapterName,
        queryRaw: (query) => scope.query(() => driver.queryRaw(query)),
        executeRaw: (query) => scope.query(() => driver.executeRaw(query)),
        executeScript: (script) =>
          scope.query(() => driver.executeScript(script)),
        getConnectionInfo: () => driver.getConnectionInfo(),
        dispose: () => driver.dispose(),
        async startTransaction(isolationLevel) {
          let transaction:
            | Awaited<ReturnType<typeof driver.startTransaction>>
            | undefined;
          try {
            const tx = await scope.query(async () => {
              transaction = await driver.startTransaction(isolationLevel);
              return transaction;
            });
            return {
              provider: tx.provider,
              adapterName: tx.adapterName,
              options: tx.options,
              queryRaw: (query) => scope.query(() => tx.queryRaw(query)),
              executeRaw: (query) => scope.query(() => tx.executeRaw(query)),
              commit: () => scope.query(() => tx.commit()),
              // Cleanup must still run after the request deadline.
              rollback: () => tx.rollback(),
            };
          } catch {
            if (transaction)
              await transaction.rollback().catch(() => undefined);
            throw new McpPrivacyError();
          }
        },
      };
    },
  };
  const client = new PrismaClient({
    adapter,
    log: [],
    errorFormat: "minimal",
    transactionOptions: { maxWait: 1000, timeout: 2000 },
  });
  return {
    db: client,
    scope,
    async close() {
      try {
        await client.$disconnect();
        await pool.end();
      } catch {
        throw new McpPrivacyError();
      }
    },
  };
}

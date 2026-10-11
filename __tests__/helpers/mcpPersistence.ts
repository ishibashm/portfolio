import type { McpGrant, PrismaClient } from "@prisma/client";
import { vi } from "vitest";
import type { McpStateRow } from "@/lib/mcpProviderStore";

/** Test-only Prisma double. Exercises production store/crypto wiring, NOT SQL,
 * transaction isolation, database constraints, or PostgreSQL advisory locks. */
export function mcpPersistence() {
  const rows = new Map<string, McpStateRow>();
  const grants = new Map<string, McpGrant>();
  type Where = Record<string, unknown>;
  function matches(row: object, where: Where): boolean {
    return Object.entries(where).every(([key, value]) => {
      const actual = (row as Record<string, unknown>)[key];
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const condition = value as Where;
        if ("not" in condition) return actual !== condition.not;
        if ("gt" in condition)
          return actual instanceof Date && actual > (condition.gt as Date);
        if ("lte" in condition)
          return actual instanceof Date && actual <= (condition.lte as Date);
      }
      return actual === value;
    });
  }
  const state = {
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: { model_keyHash: { model: string; keyHash: string } };
      }) =>
        rows.get(
          `${where.model_keyHash.model}:${where.model_keyHash.keyHash}`,
        ) ?? null,
    ),
    findFirst: vi.fn(
      async ({ where }: { where: Where }) =>
        [...rows.values()].find((row) => matches(row, where)) ?? null,
    ),
    upsert: vi.fn(
      async ({
        create,
        update,
      }: {
        create: McpStateRow;
        update: Partial<McpStateRow>;
      }) => {
        const key = `${create.model}:${create.keyHash}`;
        rows.set(
          key,
          structuredClone(
            rows.has(key) ? { ...rows.get(key)!, ...update } : create,
          ),
        );
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Where; data: Partial<McpStateRow> }) => {
        let count = 0;
        for (const [key, row] of rows)
          if (matches(row, where)) {
            rows.set(key, { ...row, ...data });
            count++;
          }
        return { count };
      },
    ),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      let count = 0;
      for (const [key, row] of rows)
        if (matches(row, where)) {
          rows.delete(key);
          count++;
        }
      return { count };
    }),
    createMany: vi.fn(async ({ data }: { data: McpStateRow[] }) => {
      let count = 0;
      for (const row of data) {
        const key = `${row.model}:${row.keyHash}`;
        if (!rows.has(key)) {
          rows.set(key, structuredClone(row));
          count++;
        }
      }
      return { count };
    }),
  };
  const app = {
    create: vi.fn(async ({ data }: { data: McpGrant }) => {
      grants.set(data.id, structuredClone(data));
      return data;
    }),
    findFirst: vi.fn(
      async ({ where }: { where: Where }) =>
        [...grants.values()].find((row) => matches(row, where)) ?? null,
    ),
    findUnique: vi.fn(
      async ({ where }: { where: Where }) =>
        [...grants.values()].find((row) => matches(row, where)) ?? null,
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Where; data: Partial<McpGrant> }) => {
        let count = 0;
        for (const [key, row] of grants)
          if (matches(row, where)) {
            grants.set(key, { ...row, ...data });
            count++;
          }
        return { count };
      },
    ),
  };
  const db = {
    mcpProviderState: state,
    mcpGrant: app,
    $queryRaw: vi.fn(async () => [{ locked: 1 }]),
    $executeRaw: vi.fn(async () => 0),
    $transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> =>
      run(db),
  };
  return { db: db as unknown as PrismaClient, rows, grants, state, app };
}

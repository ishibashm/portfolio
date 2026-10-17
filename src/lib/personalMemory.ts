import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createMcpStateCrypto } from "@/lib/mcpStateCrypto";

export const memoryInput = z
  .strictObject({
    title: z.string().trim().min(1).max(100),
    text: z.string().max(8000),
    category: z.enum(["move", "family", "direction", "result", "other"]),
  })
  .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= 8192);
export const memoryEnabled = () => process.env.MCP_MEMORY_ENABLED === "true";
export class MemoryError extends Error {
  constructor(
    public code:
      | "INVALID_INPUT"
      | "NOT_FOUND_OR_CONFLICT"
      | "LIMIT_REACHED"
      | "TEMPORARILY_UNAVAILABLE",
  ) {
    super(code);
  }
}
export function memoryCryptoFromEnvironment() {
  try {
    const value = z
      .strictObject({
        lookupKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
        activeVersion: z.string(),
        keys: z.record(z.string(), z.string().regex(/^[A-Za-z0-9+/]{43}=$/)),
      })
      .parse(JSON.parse(process.env.MCP_MEMORY_KEYS ?? ""));
    return createMcpStateCrypto({
      lookupKey: Buffer.from(value.lookupKey, "base64"),
      activeVersion: value.activeVersion,
      encryptionKeys: new Map(
        Object.entries(value.keys).map(([id, key]) => [
          id,
          Buffer.from(key, "base64"),
        ]),
      ),
    });
  } catch {
    throw new MemoryError("TEMPORARILY_UNAVAILABLE");
  }
}
export function createMemoryStore(
  db: Pick<PrismaClient, "$transaction">,
  crypto: ReturnType<typeof createMcpStateCrypto>,
) {
  async function run(
    userId: string,
    operation: "list" | "create" | "update" | "delete" | "clear",
    input?: unknown,
  ) {
    try {
      if (!z.uuid().safeParse(userId).success)
        throw new MemoryError("INVALID_INPUT");
      return await db.$transaction(async (tx) => {
        // Shares the registration-deletion lock; serializes quota and mutations.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 21092026))`;
        if (operation === "list") {
          const rows = await tx.memoryEntry.findMany({
            where: { userId },
            orderBy: { id: "asc" },
            take: 100,
          });
          return {
            memories: rows.map((row) => ({
              id: row.id,
              revision: row.revision,
              createdAt: row.createdAt.toISOString(),
              updatedAt: row.updatedAt.toISOString(),
              ...memoryInput.parse(
                crypto.open("MemoryEntry", `${userId}:${row.id}`, row),
              ),
            })),
          };
        }
        if (operation === "clear") {
          await tx.memoryEntry.deleteMany({ where: { userId } });
          return { deleted: true };
        }
        const target =
          operation === "create"
            ? null
            : z
                .strictObject({
                  id: z.uuid(),
                  revision: z.number().int().positive(),
                  value: z.unknown().optional(),
                })
                .parse(input);
        const id = target?.id ?? randomUUID();
        if (operation === "delete") {
          const result = await tx.memoryEntry.deleteMany({
            where: { userId, id, revision: target!.revision },
          });
          if (result.count !== 1)
            throw new MemoryError("NOT_FOUND_OR_CONFLICT");
          return { deleted: true };
        }
        const value = memoryInput.parse(target ? target.value : input);
        const sealed = crypto.seal("MemoryEntry", `${userId}:${id}`, value);
        const now = new Date();
        if (operation === "create") {
          if ((await tx.memoryEntry.count({ where: { userId } })) >= 100)
            throw new MemoryError("LIMIT_REACHED");
          await tx.memoryEntry.create({
            data: {
              id,
              userId,
              ...sealed,
              payload: Buffer.from(sealed.payload),
              revision: 1,
              createdAt: now,
              updatedAt: now,
            },
          });
          return { id, revision: 1 };
        }
        const result = await tx.memoryEntry.updateMany({
          where: { userId, id, revision: target!.revision },
          data: {
            ...sealed,
            payload: Buffer.from(sealed.payload),
            revision: { increment: 1 },
            updatedAt: now,
          },
        });
        if (result.count !== 1) throw new MemoryError("NOT_FOUND_OR_CONFLICT");
        return { id, revision: target!.revision + 1 };
      });
    } catch (error) {
      if (error instanceof MemoryError) throw error;
      if (error instanceof z.ZodError) throw new MemoryError("INVALID_INPUT");
      throw new MemoryError("TEMPORARILY_UNAVAILABLE");
    }
  }
  return { run };
}
export type MemoryStore = ReturnType<typeof createMemoryStore>;

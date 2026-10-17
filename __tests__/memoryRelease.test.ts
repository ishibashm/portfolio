import { afterEach, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { revokeMcpOnRegistrationDeletion } from "@/lib/mcpDeletion";
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
afterEach(() => vi.unstubAllEnvs());
it("hides both pages by default", async () => {
  vi.stubEnv("MCP_PERSONAL_ENABLED", "true");
  vi.stubEnv("MCP_MEMORY_ENABLED", "");
  vi.stubEnv("MCP_CONSOLE_ENABLED", "");
  const consolePage = (await import("@/app/profile/mcp/page")).default;
  const memoryPage = (await import("@/app/profile/memory/page")).default;
  expect(() => consolePage()).toThrow("NOT_FOUND");
  expect(() => memoryPage()).toThrow("NOT_FOUND");
});
it("deletes saved memory even while its feature is stopped", async () => {
  vi.stubEnv("MCP_MEMORY_ENABLED", "false");
  vi.stubEnv("MCP_MEMORY_KEYS", "installed");
  vi.stubEnv("MCP_RUNTIME_CONFIG", "");
  vi.stubEnv("MCP_PERSONAL_ENABLED", "false");
  const deleteMany = vi.fn();
  const tx = {
    memoryEntry: { deleteMany },
  } as unknown as Prisma.TransactionClient;
  const userId = "11111111-1111-4111-8111-111111111111";
  await revokeMcpOnRegistrationDeletion(tx, userId);
  expect(deleteMany).toHaveBeenCalledWith({ where: { userId } });
  await expect(revokeMcpOnRegistrationDeletion(tx, "other")).rejects.toThrow(
    "MCP_INVALID_OWNER",
  );
  expect(deleteMany).toHaveBeenCalledOnce();
});

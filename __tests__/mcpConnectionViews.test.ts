import { describe, expect, it, vi } from "vitest";
import { createMcpConnectionManagementService } from "@/lib/mcpConnectionViews";

const user = "10000000-0000-4000-8000-000000000001";
const connection = {
  id: "20000000-0000-4000-8000-000000000001",
  clientId: "test-client",
  allowedProfileIds: ["selected", "deleted"],
  scope: "read:profiles" as const,
  createdAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-31T00:00:00.000Z",
  revokedAt: null,
  lastUsedAt: null,
  status: "active" as const,
};
function setup(
  presets: unknown = [
    {
      id: "selected",
      name: "<script>name</script>",
      birthDate: "secret-birth",
      baseLat: 12.345,
    },
    { id: "new", name: "unshared-secret" },
  ],
) {
  const findFirst = vi.fn().mockResolvedValue({ presets });
  const connections = {
    list: vi
      .fn()
      .mockResolvedValue({ connections: [connection], nextCursor: null }),
    revoke: vi.fn(),
    revokeAll: vi.fn(),
    reduceProfiles: vi.fn(),
  };
  const service = createMcpConnectionManagementService({
    connections,
    db: { user_configs: { findFirst } } as never,
    clients: new Map([["test-client", "Registered AI"]]),
  });
  return { service, connections, findFirst };
}

describe("management display projection", () => {
  it("reads only the verified owner's presets and labels only consented IDs", async () => {
    const { service, connections, findFirst } = setup();
    const result = await service.list(user, connection.id);
    expect(connections.list).toHaveBeenCalledWith(user, connection.id);
    expect(findFirst).toHaveBeenCalledWith({
      where: { user_id: user },
      select: { presets: true },
    });
    expect(result.connections[0]).toEqual({
      ...connection,
      clientName: "Registered AI",
      profiles: [
        { id: "selected", name: "<script>name</script>" },
        { id: "deleted", name: null },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret-birth|12\.345|unshared-secret/,
    );
  });
  it.each([null, "dev-bypass-id", "email@example.test"])(
    "rejects an invalid subject before reads: %s",
    async (value) => {
      const { service, connections, findFirst } = setup();
      await expect(service.list(value)).rejects.toMatchObject({
        code: "LOGIN_REQUIRED",
      });
      expect(connections.list).not.toHaveBeenCalled();
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    {},
    [{ id: "selected" }],
    [
      { id: "selected", name: "a" },
      { id: "selected", name: "b" },
    ],
    Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: "x" })),
  ])("keeps broken or deleted presets revocable (%#)", async (presets) => {
    const { service, connections } = setup(presets);
    expect(
      (await service.list(user)).connections[0].profiles.every(
        (p) => p.name === null,
      ),
    ).toBe(true);
    await service.revoke(user, connection.id);
    expect(connections.revoke).toHaveBeenCalledWith(user, connection.id);
  });
  it("does not query profiles for an empty page", async () => {
    const { service, connections, findFirst } = setup();
    connections.list.mockResolvedValue({ connections: [], nextCursor: null });
    expect(await service.list(user)).toEqual({
      connections: [],
      nextCursor: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("preserves pagination and identifies an unregistered client without inventing a name", async () => {
    const { service, connections } = setup();
    connections.list.mockResolvedValue({
      connections: [{ ...connection, clientId: "removed-client" }],
      nextCursor: connection.id,
    });
    const result = await service.list(user);
    expect(result.nextCursor).toBe(connection.id);
    expect(result.connections[0]).toMatchObject({
      clientId: "removed-client",
      clientName: "名称不明の接続先",
    });
  });
  it("fails closed on DB errors without raw causes", async () => {
    const { service, findFirst } = setup();
    findFirst.mockRejectedValue(new Error("secret-birth token"));
    await expect(service.list(user)).rejects.toThrow("TEMPORARILY_UNAVAILABLE");
  });
});

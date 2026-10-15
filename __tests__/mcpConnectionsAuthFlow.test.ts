// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Provider } from "oidc-provider";
import { createMcpConnectionService } from "@/lib/mcpConnections";
import { createMcpAuthenticator } from "@/lib/mcpAuth";
import { MCP_PERSONAL_RESOURCE } from "@/lib/mcpAuthorizationConfig";

const time = Date.UTC(2026, 9, 11);
const userId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const providerGrantId = "protocol-grant";
const bearer = new Headers({ authorization: `Bearer ${"a".repeat(43)}` });

describe("management grant and resource-server authorization", () => {
  it("keeps a valid reduction, rejects empty reduction, then denies the existing token after revocation", async () => {
    const row = {
      id: connectionId,
      userId,
      clientId: "client",
      providerGrantId,
      allowedProfileIds: ["one", "two"],
      createdAt: new Date(time - 1000),
      expiresAt: new Date(time + 60_000),
      revokedAt: null as Date | null,
    };
    const db = {
      mcpGrant: {
        findFirst: vi.fn(async () => ({
          id: row.id,
          providerGrantId: row.providerGrantId,
          allowedProfileIds: [...row.allowedProfileIds],
        })),
        findUnique: vi.fn(async () => ({ ...row })),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              revokedAt: null;
              allowedProfileIds?: { equals: string[] };
            };
            data: { allowedProfileIds: string[] } | { revokedAt: Date };
          }) => {
            if (where.revokedAt !== null || row.revokedAt) return { count: 0 };
            if (where.allowedProfileIds && "allowedProfileIds" in data) {
              if (
                JSON.stringify(where.allowedProfileIds.equals) !==
                JSON.stringify(row.allowedProfileIds)
              )
                return { count: 0 };
              row.allowedProfileIds = [...data.allowedProfileIds];
            } else if ("revokedAt" in data) {
              row.revokedAt = data.revokedAt;
            }
            return { count: 1 };
          },
        ),
      },
    };
    const store = { revokeByGrantId: vi.fn().mockResolvedValue(undefined) };
    const service = createMcpConnectionService({
      db: db as unknown as PrismaClient,
      store,
      now: () => new Date(time),
    });
    const issuer = "https://cloud-palette.com/oauth";
    const provider = {
      issuer,
      AccessToken: {
        find: vi.fn(async () => ({
          kind: "AccessToken",
          tokenType: "Bearer",
          accountId: userId,
          clientId: "client",
          grantId: providerGrantId,
          aud: MCP_PERSONAL_RESOURCE,
          scope: "read:profiles",
          iat: time / 1000 - 1,
          exp: time / 1000 + 599,
        })),
      },
      Grant: {
        find: vi.fn(async () => ({
          accountId: userId,
          clientId: "client",
          exp: time / 1000 + 1000,
        })),
      },
    };
    const authenticate = createMcpAuthenticator({
      issuer,
      provider: provider as unknown as Provider,
      db: db as unknown as PrismaClient,
      now: () => time,
    });

    expect((await authenticate(bearer)).allowedProfileIds).toEqual([
      "one",
      "two",
    ]);
    await expect(
      service.reduceProfiles(userId, connectionId, ["one"]),
    ).resolves.toEqual({ updated: true });
    expect((await authenticate(bearer)).allowedProfileIds).toEqual(["one"]);
    const writes = db.mcpGrant.updateMany.mock.calls.length;
    await expect(
      service.reduceProfiles(userId, connectionId, []),
    ).rejects.toThrow("INVALID_REQUEST");
    expect(db.mcpGrant.updateMany).toHaveBeenCalledTimes(writes);
    expect((await authenticate(bearer)).allowedProfileIds).toEqual(["one"]);

    await expect(service.revoke(userId, connectionId)).resolves.toEqual({
      revoked: true,
    });
    expect(row.revokedAt).toEqual(new Date(time));
    expect(store.revokeByGrantId).toHaveBeenCalledWith(providerGrantId);
    expect(db.mcpGrant.updateMany.mock.invocationCallOrder.at(-1)).toBeLessThan(
      store.revokeByGrantId.mock.invocationCallOrder[0],
    );
    await expect(authenticate(bearer)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });
});

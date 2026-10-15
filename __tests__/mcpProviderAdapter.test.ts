// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Provider } from "oidc-provider";
import { createMcpProviderAdapter } from "@/lib/mcpProviderAdapter";
import { createMcpStateCrypto } from "@/lib/mcpStateCrypto";
import type { McpProviderStore, McpStateRow } from "@/lib/mcpProviderStore";
import {
  createMcpAuthorizationPolicy,
  MCP_PERSONAL_RESOURCE,
} from "@/lib/mcpAuthorizationConfig";
import { MCP_AUTHORIZATION_ISSUER } from "@/lib/mcpDiscovery";
import { mcpInteractionPolicy } from "@/lib/mcpInteraction";

const node22 = Number(process.versions.node.split(".")[0]) >= 22;
const userId = "11111111-1111-4111-8111-111111111111";
const crypto = createMcpStateCrypto({
  lookupKey: randomBytes(32),
  activeVersion: "test",
  encryptionKeys: new Map([["test", randomBytes(32)]]),
});

// Test-only persistence double. Production SQL/locking has a separate contract
// test; these protocol tests do not claim to exercise PostgreSQL contention.
function persistence() {
  const rows = new Map<string, McpStateRow>();
  const key = (model: string, hash: string) => `${model}:${hash}`;
  const grant = (id: string) =>
    rows.get(key("Grant", crypto.digest("Grant", "id", id)));
  const live = (id: string) => {
    const row = grant(id);
    return row && !row.consumedAt && row.expiresAt > new Date();
  };
  const revoked = new Set<string>();
  const revoke = async (id: string) => {
    revoked.add(id);
    const g = grant(id);
    if (g) g.consumedAt = new Date();
    for (const [k, row] of rows)
      if (row.grantId === id && row.model !== "Grant") rows.delete(k);
  };
  const store: McpProviderStore = {
    async put(row) {
      if (
        row.grantId &&
        ((row.model !== "Grant" && !live(row.grantId)) ||
          revoked.has(row.grantId))
      )
        throw new Error("MCP_STATE_UNAVAILABLE");
      const k = key(row.model, row.keyHash);
      rows.set(k, {
        ...structuredClone(row),
        consumedAt: rows.get(k)?.consumedAt ?? null,
      });
    },
    async find(model, selector) {
      const row = [...rows.values()].find(
        (r) =>
          r.model === model &&
          Object.entries(selector).every(
            ([k, v]) => r[k as keyof McpStateRow] === v,
          ),
      );
      return row &&
        row.expiresAt > new Date() &&
        !(model === "Grant" && row.consumedAt)
        ? structuredClone(row)
        : undefined;
    },
    async consume(model, hash) {
      const row = rows.get(key(model, hash));
      if (!row || row.expiresAt <= new Date()) return false;
      if (row.consumedAt) {
        if (row.grantId) await revoke(row.grantId);
        return false;
      }
      row.consumedAt = new Date();
      return true;
    },
    async destroy(model, hash, id) {
      if (model === "Grant" && id) await revoke(id);
      else rows.delete(key(model, hash));
    },
    revokeByGrantId: revoke,
    async claim(row) {
      const k = key(row.model, row.keyHash);
      if (rows.has(k)) return false;
      rows.set(k, row);
      return true;
    },
    async purgeExpired() {
      return 0;
    },
  };
  return { store, rows, revoked };
}

it.skipIf(node22)(
  "refuses unsupported Node runtime before loading the provider",
  async () => {
    await expect(
      createMcpProviderAdapter({ crypto, store: persistence().store }),
    ).rejects.toThrow("MCP_AUTH_REQUIRES_NODE_22");
  },
);

describe.skipIf(!node22)("encrypted provider adapter", () => {
  it("persists only sealed payload/digests and restores consumed markers across instances", async () => {
    const { store, rows } = persistence();
    const a = await createMcpProviderAdapter({ crypto, store });
    const b = await createMcpProviderAdapter({ crypto, store });
    await a.adapter("Grant").upsert("grant", { accountId: userId }, 300);
    const code = a.adapter("AuthorizationCode");
    await code.upsert(
      "synthetic-code",
      { grantId: "grant", codeChallenge: "synthetic-verifier" },
      60,
    );
    expect(JSON.stringify([...rows])).not.toContain("synthetic-code");
    expect(JSON.stringify([...rows])).not.toContain("synthetic-verifier");
    await code.consume("synthetic-code");
    await code.upsert("synthetic-code", { grantId: "grant" }, 60);
    expect(
      await b.adapter("AuthorizationCode").find("synthetic-code"),
    ).toHaveProperty("consumed");
    await expect(
      b.adapter("AuthorizationCode").consume("synthetic-code"),
    ).rejects.toMatchObject({ error: "invalid_grant" });
    expect(await a.adapter("Grant").find("grant")).toBeUndefined();
  });

  it("stores session UID as a digest and keeps interaction claims independent", async () => {
    const { store, rows } = persistence();
    const { adapter, claimInteraction } = await createMcpProviderAdapter({
      crypto,
      store,
    });
    await adapter("Session").upsert(
      "session",
      { uid: "synthetic-uid", accountId: userId },
      3600,
    );
    expect(await adapter("Session").findByUid("synthetic-uid")).toMatchObject({
      accountId: userId,
    });
    expect(JSON.stringify([...rows])).not.toContain("synthetic-uid");
    expect(
      await claimInteraction("interaction", new Date(Date.now() + 60_000)),
    ).toBe(true);
    await adapter("Interaction").upsert(
      "interaction",
      { uid: "interaction" },
      60,
    );
    await adapter("Interaction").destroy("interaction");
    expect(
      await claimInteraction("interaction", new Date(Date.now() + 60_000)),
    ).toBe(false);
    expect(
      await adapter("Interaction").findByUid("synthetic-uid"),
    ).toBeUndefined();
  });

  it("rejects missing/unbounded TTL, missing grant and unsupported models/client registration", async () => {
    const { adapter } = await createMcpProviderAdapter({
      crypto,
      store: persistence().store,
    });
    for (const ttl of [undefined, 0, -1, NaN, Infinity, 61])
      await expect(
        adapter("AuthorizationCode").upsert("code", { grantId: "g" }, ttl),
      ).rejects.toThrow("MCP_STATE_UNAVAILABLE");
    await expect(
      adapter("RefreshToken").upsert("token", {}, 60),
    ).rejects.toThrow("MCP_STATE_UNAVAILABLE");
    await expect(adapter("Grant").upsert("g", { exp: 1 }, 60)).rejects.toThrow(
      "MCP_STATE_UNAVAILABLE",
    );
    expect(() => adapter("DeviceCode")).toThrow("MCP_STATE_UNAVAILABLE");
    expect(await adapter("Client").find("unknown")).toBeUndefined();
    await expect(adapter("Client").upsert("c", {})).rejects.toThrow(
      "MCP_STATE_UNAVAILABLE",
    );
    expect(
      await adapter("RefreshToken").findByUserCode("code"),
    ).toBeUndefined();
  });
});

describe.skipIf(!node22)(
  "real provider token endpoint with encrypted state (loopback only)",
  () => {
    let provider: Provider;
    let server: ReturnType<typeof createServer>;
    let endpoint: string;
    const storage = persistence();
    const verifier = "v".repeat(43);
    const redirectUri = "https://client.invalid/callback";
    beforeAll(async () => {
      const { Provider } = await import("oidc-provider");
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const { adapter } = await createMcpProviderAdapter({
        crypto,
        store: storage.store,
      });
      provider = new Provider(MCP_AUTHORIZATION_ISSUER, {
        ...(await createMcpAuthorizationPolicy()),
        ...mcpInteractionPolicy,
        adapter,
        jwks: {
          keys: [
            {
              ...privateKey.export({ format: "jwk" }),
              kid: "test-only",
              use: "sig",
              alg: "RS256",
            },
          ],
        },
        cookies: { keys: [randomBytes(32).toString("hex")] },
        clients: [
          {
            client_id: "test",
            redirect_uris: [redirectUri],
            response_types: ["code"],
            grant_types: ["authorization_code", "refresh_token"],
            token_endpoint_auth_method: "none",
          },
        ],
      });
      provider.proxy = true;
      const callback = provider.callback();
      server = createServer((req, res) => {
        Object.assign(req, { originalUrl: req.url });
        req.url = req.url?.slice("/oauth".length);
        void callback(req, res);
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/token`;
    });
    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    async function code() {
      const grant = new provider.Grant({ accountId: userId, clientId: "test" });
      grant.addOIDCScope("read:profiles");
      grant.addResourceScope(MCP_PERSONAL_RESOURCE, "read:profiles");
      const grantId = await grant.save();
      const client = await provider.Client.find("test");
      if (!client) throw new Error("Missing test client");
      const authorization = new provider.AuthorizationCode({
        accountId: userId,
        client,
        gty: "authorization_code",
        grantId,
        redirectUri,
        scope: "read:profiles",
        resource: MCP_PERSONAL_RESOURCE,
        codeChallenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        codeChallengeMethod: "S256",
      });
      return { value: await authorization.save(), grantId };
    }
    async function token(params: Record<string, string>) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-forwarded-host": "cloud-palette.com",
          "x-forwarded-proto": "https",
        },
        body: new URLSearchParams({
          client_id: "test",
          resource: MCP_PERSONAL_RESOURCE,
          ...params,
        }),
      });
      return { status: response.status, body: await response.json() };
    }
    const exchange = (value: string, extra: Record<string, string> = {}) =>
      token({
        grant_type: "authorization_code",
        code: value,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        ...extra,
      });
    const refresh = (value: string) =>
      token({ grant_type: "refresh_token", refresh_token: value });

    it("exchanges once, rotates refresh tokens, and revokes the entire grant on replay", async () => {
      const { value, grantId } = await code();
      const first = await exchange(value);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({
        expires_in: 600,
        scope: "read:profiles",
        token_type: "Bearer",
      });
      const second = await refresh(first.body.refresh_token);
      expect(second.status).toBe(200);
      expect(second.body.refresh_token).not.toBe(first.body.refresh_token);
      const old = await provider.RefreshToken.find(first.body.refresh_token);
      const current = await provider.RefreshToken.find(
        second.body.refresh_token,
      );
      expect(current?.exp).toBeLessThanOrEqual((old?.iiat ?? 0) + 30 * 86400);
      expect((await refresh(first.body.refresh_token)).body.error).toBe(
        "invalid_grant",
      );
      expect(storage.revoked.has(grantId)).toBe(true);
      expect(await provider.Grant.find(grantId)).toBeUndefined();
      expect(
        await provider.AccessToken.find(second.body.access_token),
      ).toBeUndefined();
      expect((await refresh(second.body.refresh_token)).body.error).toBe(
        "invalid_grant",
      );
    });

    it("rejects wrong PKCE, redirect, resource and reused codes", async () => {
      const { value, grantId } = await code();
      expect(
        (await exchange(value, { code_verifier: "x".repeat(43) })).body.error,
      ).toBe("invalid_grant");
      expect(
        (
          await exchange(value, {
            redirect_uri: "https://other.invalid/callback",
          })
        ).body.error,
      ).toBe("invalid_grant");
      expect(
        (await exchange(value, { resource: "https://other.invalid/mcp" }))
          .status,
      ).toBe(400);
      // A failed exchange after consume may burn a code: obtain a fresh grant.
      const fresh = await code();
      expect((await exchange(fresh.value)).status).toBe(200);
      expect((await exchange(fresh.value)).body.error).toBe("invalid_grant");
      expect(await provider.Grant.find(fresh.grantId)).toBeUndefined();
      await provider.Grant.adapter.destroy(grantId);
    });

    it("allows at most one concurrent code exchange and refresh, leaving no live grant on replay", async () => {
      const a = await code();
      const results = await Promise.all([exchange(a.value), exchange(a.value)]);
      expect(
        results.filter((r) => r.status === 200).length,
      ).toBeLessThanOrEqual(1);
      expect(await provider.Grant.find(a.grantId)).toBeUndefined();
      const b = await code();
      const first = await exchange(b.value);
      expect(first.status).toBe(200);
      const rotations = await Promise.all([
        refresh(first.body.refresh_token),
        refresh(first.body.refresh_token),
      ]);
      expect(
        rotations.filter((r) => r.status === 200).length,
      ).toBeLessThanOrEqual(1);
      expect(await provider.Grant.find(b.grantId)).toBeUndefined();
    });

    it("fails closed on corrupt ciphertext without logging or returning stored input", async () => {
      const { value } = await code();
      const stored = [...storage.rows.values()].find(
        (r) =>
          r.model === "AuthorizationCode" &&
          crypto.open(r.model, r.keyHash, r).jti === value,
      );
      // Opaque token IDs may differ from their returned value; select via provider.
      const parsed = await provider.AuthorizationCode.find(value);
      const target =
        stored ??
        storage.rows.get(
          `AuthorizationCode:${crypto.digest("AuthorizationCode", "id", parsed!.jti)}`,
        )!;
      target.payload = new Uint8Array(30);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const result = await exchange(value);
        expect(result.status).toBe(500);
        expect(JSON.stringify(result.body)).not.toContain(value);
        expect(JSON.stringify(result.body)).not.toContain(userId);
        expect(log).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });
  },
);

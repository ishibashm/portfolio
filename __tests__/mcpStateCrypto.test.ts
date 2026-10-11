import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMcpStateCrypto, McpStateError } from "@/lib/mcpStateCrypto";

const lookupKey = randomBytes(32);
const oldKey = randomBytes(32);
const newKey = randomBytes(32);
const options = {
  lookupKey,
  activeVersion: "v1",
  encryptionKeys: new Map([["v1", oldKey]]),
};
const payload = {
  accountId: "synthetic-user",
  codeChallenge: "synthetic-secret",
  params: { state: "synthetic-state" },
};

describe("encrypted MCP provider state", () => {
  it("round trips without plaintext and uses a fresh nonce on every write", () => {
    const crypto = createMcpStateCrypto(options);
    const hash = crypto.digest("AuthorizationCode", "id", "synthetic-code");
    const a = crypto.seal("AuthorizationCode", hash, payload);
    const b = crypto.seal("AuthorizationCode", hash, payload);
    expect(a.payload).not.toEqual(b.payload);
    expect(Buffer.from(a.payload).includes(Buffer.from("synthetic"))).toBe(
      false,
    );
    expect(crypto.open("AuthorizationCode", hash, a)).toEqual(payload);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(
      crypto.digest("AuthorizationCode", "id", "synthetic-code"),
    );
    expect(
      new Set([
        hash,
        crypto.digest("RefreshToken", "id", "synthetic-code"),
        crypto.digest("AuthorizationCode", "uid", "synthetic-code"),
        crypto.digest("AuthorizationCode", "userCode", "synthetic-code"),
      ]).size,
    ).toBe(4);
  });

  it("rejects tampering, swapped rows/models, missing keys and malformed envelopes without logging", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const crypto = createMcpStateCrypto(options);
      const sealed = crypto.seal("Session", "hash", payload);
      const bytes = Buffer.from(sealed.payload);
      bytes[bytes.length - 1] ^= 1;
      for (const run of [
        () => crypto.open("Session", "hash", { ...sealed, payload: bytes }),
        () => crypto.open("Grant", "hash", sealed),
        () => crypto.open("Session", "other", sealed),
        () => crypto.open("Session", "hash", { ...sealed, keyVersion: "v2" }),
        () =>
          crypto.open("Session", "hash", {
            ...sealed,
            payload: new Uint8Array(12),
          }),
      ]) {
        expect(run).toThrow("MCP_STATE_UNAVAILABLE");
        try {
          run();
        } catch (error) {
          expect(error).not.toHaveProperty("cause");
        }
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("reads previous encryption versions while keeping lookup stable", () => {
    const before = createMcpStateCrypto(options);
    const after = createMcpStateCrypto({
      lookupKey,
      activeVersion: "v2",
      encryptionKeys: new Map([
        ["v1", oldKey],
        ["v2", newKey],
      ]),
    });
    expect(
      after.open("Grant", "hash", before.seal("Grant", "hash", payload)),
    ).toEqual(payload);
    expect(after.seal("Grant", "hash", payload).keyVersion).toBe("v2");
    expect(after.digest("Grant", "id", "id")).toBe(
      before.digest("Grant", "id", "id"),
    );
  });

  it("requires explicit independent 256-bit keys and bounded JSON", () => {
    expect(() =>
      createMcpStateCrypto({ ...options, lookupKey: new Uint8Array(0) }),
    ).toThrow(McpStateError);
    expect(() =>
      createMcpStateCrypto({ ...options, activeVersion: "missing" }),
    ).toThrow(McpStateError);
    expect(() =>
      createMcpStateCrypto({
        ...options,
        encryptionKeys: new Map([["v1", lookupKey]]),
      }),
    ).toThrow(McpStateError);
    const crypto = createMcpStateCrypto(options);
    expect(() =>
      crypto.seal("Grant", "hash", { scope: "x".repeat(128 * 1024) }),
    ).toThrow(McpStateError);
    expect(() => crypto.digest("Grant", "id", "")).toThrow(McpStateError);
  });
});

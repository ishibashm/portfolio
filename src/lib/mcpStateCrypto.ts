import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { AdapterPayload } from "oidc-provider";
import { z } from "zod";

export class McpStateError extends Error {
  constructor() {
    super("MCP_STATE_UNAVAILABLE");
    this.name = "McpStateError";
  }
}

const MAX_BYTES = 128 * 1024;
export type SealedMcpState = { payload: Uint8Array; keyVersion: string };

/** Inject keys from the future AS deployment. No env lookup or default key. */
export function createMcpStateCrypto(options: {
  lookupKey: Uint8Array;
  activeVersion: string;
  encryptionKeys: ReadonlyMap<string, Uint8Array>;
}) {
  const lookupKey = Buffer.from(options.lookupKey);
  const keys = new Map(
    [...options.encryptionKeys].map(([version, key]) => [
      version,
      Buffer.from(key),
    ]),
  );
  if (
    lookupKey.length !== 32 ||
    !keys.has(options.activeVersion) ||
    [...keys].some(
      ([version, key]) =>
        !/^[a-zA-Z0-9_-]{1,64}$/.test(version) ||
        key.length !== 32 ||
        key.equals(lookupKey),
    )
  )
    throw new McpStateError();

  const aad = (model: string, keyHash: string, version: string) =>
    Buffer.from(JSON.stringify(["mcp-state-v1", model, keyHash, version]));
  return {
    digest(model: string, purpose: "id" | "uid" | "userCode", value: string) {
      if (!model || !value || value.length > 4096) throw new McpStateError();
      return createHmac("sha256", lookupKey)
        .update(JSON.stringify(["mcp-lookup-v1", model, purpose, value]))
        .digest("hex");
    },
    seal(
      model: string,
      keyHash: string,
      value: AdapterPayload,
    ): SealedMcpState {
      try {
        const plaintext = Buffer.from(JSON.stringify(value));
        if (plaintext.length > MAX_BYTES) throw new McpStateError();
        const version = options.activeVersion;
        const key = keys.get(version);
        if (!key) throw new McpStateError();
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, nonce);
        cipher.setAAD(aad(model, keyHash, version));
        const ciphertext = Buffer.concat([
          cipher.update(plaintext),
          cipher.final(),
        ]);
        return {
          payload: Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]),
          keyVersion: version,
        };
      } catch {
        throw new McpStateError();
      }
    },
    open(
      model: string,
      keyHash: string,
      sealed: SealedMcpState,
    ): AdapterPayload {
      try {
        const key = keys.get(sealed.keyVersion);
        const bytes = Buffer.from(sealed.payload);
        if (!key || bytes.length < 30 || bytes.length > MAX_BYTES + 28)
          throw new McpStateError();
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          bytes.subarray(0, 12),
        );
        decipher.setAAD(aad(model, keyHash, sealed.keyVersion));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const value: unknown = JSON.parse(
          Buffer.concat([
            decipher.update(bytes.subarray(28)),
            decipher.final(),
          ]).toString("utf8"),
        );
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new McpStateError();
        // The provider owns the payload schema; this layer only authenticates its JSON envelope.
        return z.record(z.string(), z.unknown()).parse(value);
      } catch {
        throw new McpStateError();
      }
    },
  };
}

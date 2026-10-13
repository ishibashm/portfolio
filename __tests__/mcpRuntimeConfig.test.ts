// @vitest-environment node
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  isPersonalMcpEnabled,
  parseMcpRuntimeConfig,
} from "@/lib/mcpRuntimeConfig";
const privateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({ format: "jwk" });
function fixture() {
  return {
    databaseUrl: "postgresql://test:test@127.0.0.1/test",
    lookupKey: randomBytes(32).toString("base64"),
    encryptionKey: randomBytes(32).toString("base64"),
    consentKey: randomBytes(32).toString("base64"),
    encryptionVersion: "v1",
    cookieKeys: [randomBytes(32).toString("base64")],
    jwks: { keys: [{ ...privateKey, kid: "test", alg: "RS256", use: "sig" }] },
    clients: [
      {
        client_id: "test",
        client_name: "Test",
        redirect_uris: ["https://client.invalid/callback"],
        token_endpoint_auth_method: "none",
      },
    ],
    login: { supabaseUrl: "https://test.supabase.co", publicKey: "TEST_ONLY" },
  };
}
afterEach(() => vi.unstubAllEnvs());
it("maps explicit keys and static clients without exposing validation details", () => {
  vi.stubEnv("DEBUG", "");
  const result = parseMcpRuntimeConfig(JSON.stringify(fixture()));
  expect(result.state.lookupKey.byteLength).toBe(32);
  expect(result.clients[0].grant_types).toEqual([
    "authorization_code",
    "refresh_token",
  ]);
  expect(result.clients[0].response_types).toEqual(["code"]);
});
it("keeps the incomplete release closed even when a deployment flag is set", () => {
  vi.stubEnv("MCP_PERSONAL_ENABLED", "true");
  expect(isPersonalMcpEnabled()).toBe(false);
});
it("rejects malformed, duplicate, weak or mixed secrets and unsafe callbacks", () => {
  vi.stubEnv("DEBUG", "");
  const source = fixture();
  for (const value of [
    undefined,
    "TEST_ONLY_SECRET",
    JSON.stringify({ ...source, unknown: "secret" }),
    JSON.stringify({ ...source, consentKey: source.lookupKey }),
    JSON.stringify({
      ...source,
      clients: [...source.clients, ...source.clients],
    }),
    JSON.stringify({ ...source, cookieKeys: ["weak"] }),
    ...[
      "https://client.invalid/*",
      "https://name:password@client.invalid/cb",
      "http://public.invalid/cb",
      "https://client.invalid/cb#fragment",
    ].map((uri) =>
      JSON.stringify({
        ...source,
        clients: [{ ...source.clients[0], redirect_uris: [uri] }],
      }),
    ),
  ]) {
    expect(() => parseMcpRuntimeConfig(value)).toThrow(
      /^MCP_RUNTIME_CONFIGURATION_INVALID$/,
    );
  }
  vi.stubEnv("DEBUG", "*");
  expect(() => parseMcpRuntimeConfig(JSON.stringify(source))).toThrow(
    /^MCP_RUNTIME_CONFIGURATION_INVALID$/,
  );
});

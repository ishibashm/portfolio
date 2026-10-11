// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateOAuthConfig } from "../oauth-service/provider.mjs";

const env = () => ({
  MCP_OAUTH_ISSUER: "https://auth.cloud-palette.com",
  MCP_OAUTH_RESOURCE: "https://cloud-palette.com/api/mcp/profile",
  MCP_OAUTH_CLIENT_REDIRECT_URI:
    "https://chatgpt.com/connector_platform_oauth_redirect",
  MCP_OAUTH_CLIENT_ID: "chatgpt-cloud-palette",
  MCP_OAUTH_INTROSPECTION_SECRET: "S".repeat(48),
  MCP_OAUTH_COOKIE_SECRETS: JSON.stringify(["C".repeat(48)]),
  MCP_OAUTH_JWKS: JSON.stringify({
    keys: [{ kty: "RSA", d: "ephemeral-fixture-only" }],
  }),
  MCP_OAUTH_STORAGE_KEYS: JSON.stringify([randomBytes(32).toString("base64")]),
});

describe("production OAuth configuration validation", () => {
  it("requires pinned HTTPS issuer, resource and redirect with a storage key ring", () => {
    const config = validateOAuthConfig(env());
    expect(config.issuer).toBe("https://auth.cloud-palette.com");
    expect(config.storageKeys).toHaveLength(1);
    expect(config.storageKeys[0]).toHaveLength(32);
    for (const change of [
      { MCP_OAUTH_ISSUER: "https://user@auth.cloud-palette.com" },
      { MCP_OAUTH_RESOURCE: "https://evil.example/api/mcp/profile" },
      { MCP_OAUTH_CLIENT_REDIRECT_URI: "https://evil.example/callback" },
      { MCP_OAUTH_STORAGE_KEYS: "[]" },
      { MCP_OAUTH_STORAGE_KEYS: '["short"]' },
    ])
      expect(() => validateOAuthConfig({ ...env(), ...change })).toThrow();
  });
});

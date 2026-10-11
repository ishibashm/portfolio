// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyProfileToken } from "@/lib/mcpOAuth";
import { GET } from "@/app/.well-known/oauth-protected-resource/api/mcp/profile/route";

const USER = "11111111-2222-4333-8444-555555555555";
const now = () => Math.floor(Date.now() / 1000);
const good = () => ({
  active: true,
  iss: "https://auth.cloud-palette.com",
  aud: "https://cloud-palette.com/api/mcp/profile",
  client_id: "chatgpt-cloud-palette",
  token_type: "Bearer",
  exp: now() + 300,
  scope: "profiles:read",
  sub: USER,
});

describe("profile OAuth introspection", () => {
  beforeEach(() => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://auth.cloud-palette.com");
    vi.stubEnv("MCP_OAUTH_INTROSPECTION_SECRET", "secret".repeat(8));
    vi.stubEnv("MCP_OAUTH_CLIENT_ID", "chatgpt-cloud-palette");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(good())));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pins HTTPS issuer, Basic-auth introspection and accepts exact claims", async () => {
    expect(await verifyProfileToken("opaque-token")).toEqual({
      status: "ok",
      userId: USER,
    });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://auth.cloud-palette.com/token/introspection");
    expect(options?.redirect).toBe("error");
    expect(options?.cache).toBe("no-store");
    expect(String(options?.body)).toContain("token=opaque-token");
    expect((options?.headers as Record<string, string>).Authorization).toMatch(
      /^Basic /,
    );
  });
  it.each([
    { aud: "https://evil.example/api/mcp/profile" },
    { iss: "https://evil.example" },
    { client_id: "other-client" },
    { token_type: "Refresh" },
    { exp: 1 },
    { scope: "other:read" },
    { sub: "not-a-uuid" },
    { active: false },
  ])("rejects mismatched introspection claims: %j", async (change) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...good(), ...change }));
    expect(await verifyProfileToken("opaque-token")).toEqual({
      status: "unauthorized",
    });
  });
  it("fails closed on missing config or introspection outages", async () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "http://unsafe.example");
    expect(await verifyProfileToken("x")).toEqual({ status: "unavailable" });
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://auth.cloud-palette.com");
    vi.mocked(fetch).mockRejectedValue(new Error("private network detail"));
    expect(await verifyProfileToken("x")).toEqual({ status: "unavailable" });
  });
  it("publishes protected-resource metadata with only the profile scope", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: "https://cloud-palette.com/api/mcp/profile",
      authorization_servers: ["https://auth.cloud-palette.com"],
      scopes_supported: ["profiles:read"],
      bearer_methods_supported: ["header"],
    });
  });
});

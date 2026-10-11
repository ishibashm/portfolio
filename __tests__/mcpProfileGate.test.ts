// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// 入口が閉じている間は DB にも OAuth サービスにも触れないことを確かめる。
const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { user_configs: { findUnique: mocks.findUnique } },
}));

import { DELETE, GET, POST } from "@/app/api/mcp/profile/route";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/profile/route";

const post = () =>
  POST(
    new Request("https://cloud-palette.com/api/mcp/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer opaque-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
const plain = () => new Request("https://cloud-palette.com/api/mcp/profile");

describe("プロフィール用MCPの公開スイッチ", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });
  it.each([undefined, "", "0", "true", "yes"])(
    "MCP_PROFILE_ENABLED=%s では鍵が揃っていても404で閉じ、存在を広告しない",
    async (flag) => {
      if (flag === undefined) vi.stubEnv("MCP_PROFILE_ENABLED", undefined);
      else vi.stubEnv("MCP_PROFILE_ENABLED", flag);
      vi.stubEnv("MCP_OAUTH_ISSUER", "https://auth.cloud-palette.com");
      vi.stubEnv("MCP_OAUTH_INTROSPECTION_SECRET", "secret".repeat(8));
      vi.stubEnv("MCP_OAUTH_CLIENT_ID", "chatgpt-cloud-palette");
      vi.stubGlobal("fetch", mocks.fetch);
      for (const response of [
        await post(),
        await GET(plain()),
        await DELETE(plain()),
        metadata(),
      ]) {
        expect(response.status).toBe(404);
        expect(response.headers.get("WWW-Authenticate")).toBeNull();
        expect(await response.text()).toBe("");
      }
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.findUnique).not.toHaveBeenCalled();
    },
  );
  it("スイッチを開けても鍵が無ければ503で閉じ、DBを読まない", async () => {
    vi.stubEnv("MCP_PROFILE_ENABLED", "1");
    vi.stubEnv("MCP_OAUTH_ISSUER", undefined);
    vi.stubEnv("MCP_OAUTH_INTROSPECTION_SECRET", undefined);
    vi.stubGlobal("fetch", mocks.fetch);
    expect((await post()).status).toBe(503);
    expect(metadata().status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

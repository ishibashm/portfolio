import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/profile/McpConnectionsPanel", () => {
  throw new Error("UI must stay unreachable");
});
vi.mock("@/lib/mcpConnectionViews", () => {
  throw new Error("Profile reads must stay unreachable");
});
vi.mock("@/lib/prisma", () => {
  throw new Error("DB must stay unreachable");
});
import Page, { dynamic } from "@/app/profile/connections/page";
import { GET as metadataGET } from "@/app/.well-known/oauth-protected-resource/api/mcp/personal/route";

describe("personal connection release gates", () => {
  it("always refuses the page without loading personal UI or database dependencies", async () => {
    await expect(Page()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(dynamic).toBe("force-dynamic");
  });
  it("keeps protected-resource discovery closed and uncacheable", async () => {
    const response = await metadataGET(
      new Request(
        "https://cloud-palette.com/.well-known/oauth-protected-resource/api/mcp/personal",
      ),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.text()).not.toContain("authorization_servers");
  });
  it("does not advertise a dead connection-management link from the profile page", () => {
    const source = readFileSync("src/app/profile/page.tsx", "utf8");
    expect(source).not.toContain("/profile/connections");
    expect(source).not.toContain("McpConnectionsPanel");
  });
});

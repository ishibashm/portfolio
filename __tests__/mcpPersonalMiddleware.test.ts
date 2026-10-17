// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/utils/supabase/middleware", () => ({ updateSession }));
import { middleware } from "@/middleware";

beforeEach(() => {
  updateSession.mockReset();
  updateSession.mockResolvedValue(
    NextResponse.redirect("https://cloud-palette.com/login"),
  );
});

describe("personal MCP middleware boundary", () => {
  it.each(["POST", "GET", "HEAD", "OPTIONS", "DELETE", "PUT", "PATCH"])(
    "%s bypasses site auth even with cookies and spoofed host headers",
    async (method) => {
      updateSession.mockRejectedValue(new Error("site auth unavailable"));
      for (const path of [
        "/api/mcp/personal",
        "/api/mcp/personal/",
        "/oauth/interaction",
        "/api/mcp/connections",
        "/api/mcp/workspace",
        "/api/mcp-authorization/token",
        "/.well-known/oauth-authorization-server/oauth",
      ]) {
        const response = await middleware(
          new NextRequest(`https://cloud-palette.com${path}?ignored=1`, {
            method,
            headers: {
              cookie: "sb-test-auth-token=dummy; dev_bypass_user=admin",
              authorization: "Bearer dummy",
              "x-forwarded-host": "tech.cloud-palette.com",
            },
          }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("x-middleware-next")).toBe("1");
        expect(response.headers.has("set-cookie")).toBe(false);
        expect(response.headers.has("location")).toBe(false);
        expect(response.headers.has("x-middleware-rewrite")).toBe(false);
      }
      expect(updateSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/api/mcp",
    "/api/mcp/personal-extra",
    "/api/mcp/personal/nested",
    "/api/user-config",
    "/api/profile/connections",
    "/profile/connections",
    "/login",
    "/admin",
  ])("preserves site session handling for %s", async (path) => {
    const request = new NextRequest(`https://cloud-palette.com${path}`);
    const response = await middleware(request);
    expect(updateSession).toHaveBeenCalledExactlyOnceWith(request, path);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cloud-palette.com/login",
    );
  });
});

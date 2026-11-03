import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  $transaction: vi.fn(async () => {
    throw new Error("DB must not be called when kill switch is active");
  }),
};
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { DELETE, GET, POST } from "@/app/api/mcp/route";
import { mcpPublicEnabled } from "@/lib/mcpPublicLimit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const initializeBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
});

describe("MCP public kill switch", () => {
  it("parses MCP_PUBLIC_ENABLED disabling values case-insensitively with trimming", () => {
    for (const raw of [
      "false",
      "FALSE",
      " False ",
      "0",
      " 0 ",
      "off",
      "OFF",
      "no",
      "No",
      "\tno\n",
    ]) {
      expect(mcpPublicEnabled({ MCP_PUBLIC_ENABLED: raw }), raw).toBe(false);
    }
    for (const raw of [undefined, "", "   ", "true", "1", "on", "yes", "any"]) {
      expect(mcpPublicEnabled({ MCP_PUBLIC_ENABLED: raw }), String(raw)).toBe(
        true,
      );
    }
  });

  it.each(["false", "0", "OFF", " no "])(
    "returns 503 JSON-RPC error with Retry-After and no-store when MCP_PUBLIC_ENABLED=%s",
    async (flag) => {
      vi.stubEnv("MCP_PUBLIC_ENABLED", flag);

      const postRes = await POST(
        new Request("https://cloud-palette.com/api/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: initializeBody,
        }),
      );
      expect(postRes.status).toBe(503);
      expect(postRes.headers.get("Retry-After")).toBe("300");
      expect(postRes.headers.get("Cache-Control")).toBe("no-store");
      expect(await postRes.json()).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "MCP is temporarily disabled" },
        id: null,
      });

      const getRes = await GET();
      expect(getRes.status).toBe(503);
      expect(getRes.headers.get("Retry-After")).toBe("300");
      expect(getRes.headers.get("Cache-Control")).toBe("no-store");
      expect(await getRes.json()).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "MCP is temporarily disabled" },
        id: null,
      });

      const deleteRes = await DELETE();
      expect(deleteRes.status).toBe(503);
      expect(deleteRes.headers.get("Retry-After")).toBe("300");
      expect(deleteRes.headers.get("Cache-Control")).toBe("no-store");

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  it("behaves normally when MCP_PUBLIC_ENABLED is unset or enabled", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const getRes = await GET();
    expect(getRes.status).toBe(405);
    expect(getRes.headers.get("Allow")).toBe("POST");

    const postRes = await POST(
      new Request("https://cloud-palette.com/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: initializeBody,
      }),
    );
    expect(postRes.status).toBe(200);
    const body = await postRes.json();
    expect(body.result.serverInfo.name).toBe("cloud-palette");
  });
});

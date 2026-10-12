// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => {
  throw new Error("no database while release gate is closed");
});
vi.mock("@/lib/mcpPersonalServer", () => {
  throw new Error("no server while release gate is closed");
});
vi.mock("@/lib/mcpAuth", () => {
  throw new Error("no token lookup while release gate is closed");
});
import * as route from "@/app/api/mcp/personal/route";
import { classifyMcpPersonalRequest } from "@/lib/mcpPersonalRequest";
import { mcpAuditEvent } from "@/lib/mcpAuditStore";
import { readMcpPersonalBody } from "@/lib/mcpPrivacyGuard";
const request = (method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});
const classify = (input: unknown) =>
  classifyMcpPersonalRequest(JSON.stringify(input));
describe("personal HTTP release gate and bounded request classification", () => {
  it("keeps every route method closed without loading auth, DB or server", async () => {
    for (const method of [
      "POST",
      "GET",
      "DELETE",
      "PUT",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ] as const) {
      const response = route[method]();
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("");
      expect(response.headers.has("WWW-Authenticate")).toBe(false);
    }
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.runtime).toBe("nodejs");
  });
  it.each([
    [
      request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      }),
      "initialize",
    ],
    [request("tools/list"), "tools/list"],
    [request("ping"), "ping"],
    [{ jsonrpc: "2.0", method: "notifications/initialized" }, "notification"],
  ])(
    "accepts protocol envelopes but only assigns a fixed event",
    (message, event) => {
      expect(classify(message)).toEqual({ accepted: true, event, message });
    },
  );
  it.each([
    "get_honmei_star",
    "judge_directions",
    "find_auspicious_days",
    "search_municipality",
    "area_directions",
    "prefecture_summary",
    "list_profiles",
    "get_profile",
    "judge_profile_directions",
    "judge_time_slots",
  ])(
    "classifies %s without treating arguments as authority or audit fields",
    (name) => {
      const message = request("tools/call", {
        name,
        arguments: {
          userId: "private",
          token: "private",
          profile: { name: "private\nforged" },
        },
      });
      const output = classify(message);
      expect(output).toEqual({ accepted: true, event: name, message });
      expect(mcpAuditEvent.safeParse(output.event).success).toBe(true);
      // Field validation belongs to the tool; this preflight never runs it.
    },
  );
  it.each([
    null,
    [],
    [request("ping")],
    [request("tools/call", { name: "get_profile" }), request("ping")],
    { jsonrpc: "2.0", id: 1, result: {} },
    { jsonrpc: "2.0", id: 1, error: { code: -1, message: "private" } },
    { ...request("ping"), jsonrpc: "1.0" },
    { ...request("ping"), id: null },
    { ...request("ping"), params: "private" },
    request("initialize", { clientInfo: { name: "private" } }),
    request("tools/list", { cursor: 3 }),
    request("tools/call", { name: "get_profile", arguments: [] }),
    request("tools/call", { name: "judge_time_slots", task: { ttl: 1000 } }),
    request("tools/call", {}),
  ])(
    "rejects invalid/batched/response/task envelopes without echoing them: %j",
    (message) => {
      expect(classify(message)).toEqual({
        accepted: false,
        event: "invalid_request",
      });
    },
  );
  it("never promotes arbitrary methods/tools into audit events or notification side effects", () => {
    for (const name of [
      "authorize",
      "revoke",
      "__proto__",
      "get_profile\nprivate",
      "private",
    ]) {
      expect(classify(request("tools/call", { name }))).toEqual({
        accepted: false,
        event: "unknown_tool",
      });
      expect(classify(request(name))).toEqual({
        accepted: false,
        event: "unknown_method",
      });
    }
    for (const method of ["tools/call", "notifications/cancelled", "private"]) {
      expect(
        classify({ jsonrpc: "2.0", method, params: { name: "get_profile" } }),
      ).toEqual({ accepted: false, event: "unknown_method" });
    }
    expect(classifyMcpPersonalRequest('{"private":')).toEqual({
      accepted: false,
      event: "invalid_request",
    });
  });
  it("composes with the raw-byte limit before JSON parsing", async () => {
    const body = JSON.stringify(
      request("tools/call", {
        name: "get_profile",
        arguments: { profile: { name: "あ".repeat(12000) } },
      }),
    );
    const req = new Request("https://cloud-palette.com/api/mcp/personal", {
      method: "POST",
      body,
    });
    await expect(
      readMcpPersonalBody(req, new AbortController().signal),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    const valid = new Request(req.url, {
      method: "POST",
      body: JSON.stringify(request("ping")),
    });
    expect(
      classifyMcpPersonalRequest(
        await readMcpPersonalBody(valid, new AbortController().signal),
      ),
    ).toMatchObject({ accepted: true, event: "ping" });
  });
});

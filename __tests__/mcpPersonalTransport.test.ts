// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { user_configs: { findFirst } } }));
import { executeMcpPersonalRequest } from "@/lib/mcpPersonalTransport";
import { classifyMcpPersonalRequest } from "@/lib/mcpPersonalRequest";

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  grantId: "22222222-2222-4222-8222-222222222222",
  clientId: "test",
  allowedProfileIds: ["one", "two"],
};
const headers = new Headers({
  accept: "application/json, text/event-stream",
  "content-type": "application/json",
});
async function run(
  method: string,
  params?: unknown,
  notification = false,
  h = headers,
) {
  const classified = classifyMcpPersonalRequest(
    JSON.stringify({
      jsonrpc: "2.0",
      ...(!notification ? { id: 1 } : {}),
      method,
      params,
    }),
  );
  if (!classified.accepted) throw new Error("test classification failed");
  return executeMcpPersonalRequest(
    auth,
    classified,
    h,
    new AbortController().signal,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    presets: [
      {
        id: "one",
        name: "same",
        birthDate: "1990-05-15",
        baseLat: 35,
        baseLon: 139,
      },
      {
        id: "two",
        name: "same",
        birthDate: "1991-05-15",
        baseLat: 35,
        baseLon: 139,
      },
    ],
    metaphysical_config: {},
    updated_at: new Date("2026-10-12T00:00:00Z"),
  });
});
describe("unmounted personal SDK Web transport", () => {
  it("handles independent initialize/list/ping/notification requests without sessions", async () => {
    const init = await run("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect((await init.value.json()).result.protocolVersion).toBe("2025-03-26");
    const list = await run("tools/list");
    expect((await list.value.json()).result.tools).toHaveLength(10);
    expect(list.value.headers.has("mcp-session-id")).toBe(false);
    expect((await (await run("ping")).value.json()).result).toEqual({});
    expect(
      (await run("notifications/initialized", undefined, true)).value.status,
    ).toBe(202);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("preserves successful structured/text equality and minimizes profile inputs", async () => {
    const output = await run("tools/call", {
      name: "get_profile",
      arguments: { profile: { id: "one" } },
    });
    const payload = await output.value.json();
    expect(JSON.parse(payload.result.content[0].text)).toEqual(
      payload.result.structuredContent,
    );
    expect(JSON.stringify(payload)).not.toContain("1990-05-15");
    expect(output.result).toBe("success");
  });
  it("replaces SDK validation details including private unknown keys", async () => {
    const output = await run("tools/call", {
      name: "get_profile",
      arguments: {
        profile: { id: "one" },
        "private-birth-token": "private-input",
      },
    });
    expect(output.result).toBe("invalid");
    expect(await output.value.text()).toBe(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { code: "INVALID_INPUT", message: "INVALID_INPUT" },
              }),
            },
          ],
        },
      }),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("normalizes legacy public validation failures without changing successful calculations", async () => {
    const invalid = await run("tools/call", {
      name: "get_honmei_star",
      arguments: { birthDate: "private-invalid-date" },
    });
    expect(invalid.result).toBe("invalid");
    expect(await invalid.value.text()).not.toContain("private-invalid-date");
    const valid = await run("tools/call", {
      name: "get_honmei_star",
      arguments: { birthDate: "1990-05-15" },
    });
    const payload = await valid.value.json();
    expect(valid.result).toBe("success");
    expect(JSON.parse(payload.result.content[0].text)).toEqual(
      payload.result.structuredContent,
    );
  });
  it("keeps authorized ambiguity candidates and hides unknown/unauthorized selectors", async () => {
    const ambiguous = await run("tools/call", {
      name: "get_profile",
      arguments: { profile: { name: "same" } },
    });
    expect(
      JSON.parse((await ambiguous.value.json()).result.content[0].text).error
        .candidates,
    ).toEqual([
      { id: "one", name: "same" },
      { id: "two", name: "same" },
    ]);
    const missing = await run("tools/call", {
      name: "get_profile",
      arguments: { profile: { id: "private-other" } },
    });
    expect(missing.result).toBe("denied");
    expect(await missing.value.text()).not.toContain("private-other");
  });
  it("fails closed for DB errors and unsupported SDK HTTP headers without logging", async () => {
    const spies = [
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "log"),
    ];
    findFirst.mockRejectedValue(new Error("private-birth-token"));
    await expect(
      run("tools/call", { name: "list_profiles", arguments: {} }),
    ).rejects.toMatchObject({
      status: 503,
      message: "TEMPORARILY_UNAVAILABLE",
    });
    await expect(
      run("ping", undefined, false, new Headers()),
    ).rejects.toMatchObject({ status: 400, message: "INVALID_REQUEST" });
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

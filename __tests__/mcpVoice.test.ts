// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceService } from "@/lib/mcpVoice";
import { voiceState } from "@/lib/mcpVoiceConfig";
import {
  createAgentEntitlement,
  MemoryUsageLedger,
} from "@/lib/agentEntitlement";
import { CHAIN_TOOLS, connectChainClient } from "@/lib/mcpChain";
const at = Date.parse("2026-10-16T14:59:00Z");
function request(body: unknown = {}, origin = "https://cloud-palette.com") {
  return new Request("https://cloud-palette.com/api/voice/session", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function setup(real = false) {
  let now = at;
  const ledger = new MemoryUsageLedger();
  const fetcher = vi.fn(async () =>
    Response.json({
      value: "short-lived-token",
      expires_at: Math.floor(now / 1000) + 180,
    }),
  );
  const call = vi.fn(async () => ({ value: "a".repeat(7000) }));
  const close = vi.fn(async () => {});
  const connect = real
    ? connectChainClient
    : vi.fn(async () => ({
        call,
        close,
        listTools: async () => ({
          tools: CHAIN_TOOLS.map((name) => ({
            name,
            inputSchema: { type: "object" as const },
          })),
        }),
      }));
  const handle = createVoiceService({
    ledger,
    entitlement: createAgentEntitlement(ledger),
    fetch: fetcher,
    connect,
    now: () => now,
  });
  return {
    handle,
    ledger,
    fetcher,
    call,
    close,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
beforeEach(() => {
  vi.stubEnv("MCP_VOICE_ENABLED", "true");
  vi.stubEnv("XAI_API_KEY", "private-api-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Grok voice API", () => {
  it("requires flag and key, allows mock only in development", async () => {
    expect(voiceState({}).enabled).toBe(false);
    expect(voiceState({ XAI_API_KEY: "key" }).enabled).toBe(false);
    expect(voiceState({ MCP_VOICE_ENABLED: "true" }).enabled).toBe(false);
    expect(
      voiceState({
        NODE_ENV: "production",
        MCP_VOICE_ENABLED: "true",
        MCP_VOICE_MOCK: "true",
      }).enabled,
    ).toBe(false);
    expect(
      voiceState({
        NODE_ENV: "development",
        MCP_VOICE_ENABLED: "true",
        MCP_VOICE_MOCK: "true",
      }).enabled,
    ).toBe(true);
    vi.stubEnv("XAI_API_KEY", "");
    const s = setup();
    expect((await s.handle("session", request())).status).toBe(404);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("rejects Origin and invalid bodies before issuance", async () => {
    const s = setup();
    for (const kind of ["session", "tool", "end"] as const)
      expect(
        (await s.handle(kind, request({}, "https://evil.test"))).status,
      ).toBe(403);
    expect(
      (await s.handle("session", request({ transcript: "secret-birthdate" })))
        .status,
    ).toBe(400);
    expect(
      (await s.handle("session", request({ data: "x".repeat(17000) }))).status,
    ).toBe(413);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("reserves remaining seconds before issuing a secret and never exposes the key", async () => {
    vi.stubEnv("MCP_VOICE_DAILY_SECONDS", "40");
    const s = setup(true);
    const response = await s.handle("session", request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.seconds).toBe(40);
    expect(body.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      [...CHAIN_TOOLS].sort(),
    );
    expect(
      body.tools.every((t: { type: string }) => t.type === "function"),
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain("private-api-key");
    expect(s.ledger.voiceDaily(at)).toBe(40);
    expect(s.fetcher.mock.calls[0]).toBeDefined();
    expect(body.instructions).toContain("UNTRUSTED_TOOL_DATA");
    expect(body.model).toBe("grok-voice-3.0");
  });
  it.each([
    "MCP_VOICE_DAILY_SECONDS",
    "MCP_VOICE_FREE_DAILY_SECONDS",
    "MCP_AGENT_FREE_DAILY_REQUESTS",
  ])("rejects exhausted %s", async (name) => {
    vi.stubEnv(name, "0");
    const s = setup();
    expect((await s.handle("session", request())).status).toBe(429);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("rejects bad signatures, outside tools, duplicate calls, and concurrent calls over the cap", async () => {
    vi.stubEnv("MCP_VOICE_MAX_TOOL_CALLS", "2");
    const s = setup();
    const { sessionId } = await (await s.handle("session", request())).json();
    const body = {
      sessionId,
      name: "get_kanshi",
      call_id: "one",
      arguments: {},
    };
    expect(
      (await s.handle("tool", request({ ...body, sessionId: sessionId + "x" })))
        .status,
    ).toBe(403);
    expect(
      (await s.handle("tool", request({ ...body, name: "get_profile" })))
        .status,
    ).toBe(403);
    const first = await s.handle("tool", request(body));
    expect(first.status).toBe(200);
    expect((await first.json()).output.length).toBeLessThan(6100);
    expect((await s.handle("tool", request(body))).status).toBe(409);
    const responses = await Promise.all(
      ["two", "three"].map((call_id) =>
        s.handle("tool", request({ ...body, call_id })),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(s.call).toHaveBeenCalledTimes(2);
  });
  it.each([
    [9.2, 10],
    [1000, 180],
  ])("settles %s to %s seconds once", async (seconds, expected) => {
    const s = setup();
    const { sessionId } = await (await s.handle("session", request())).json();
    expect(
      (await s.handle("end", request({ sessionId, seconds }))).status,
    ).toBe(200);
    expect(s.ledger.voiceDaily(at)).toBe(expected);
    await s.handle("end", request({ sessionId, seconds: 0 }));
    expect(s.ledger.voiceDaily(at)).toBe(expected);
    const logs = vi.mocked(console.info).mock.calls.flat().join();
    expect(logs).toContain(`"voiceSeconds":${expected}`);
    expect(
      (
        await s.handle(
          "tool",
          request({
            sessionId,
            name: "get_kanshi",
            call_id: "x",
            arguments: {},
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("expires without refund, rejects tools and preserves reservation across JST midnight", async () => {
    const s = setup();
    const { sessionId } = await (await s.handle("session", request())).json();
    s.advance(180000);
    expect(
      (
        await s.handle(
          "tool",
          request({
            sessionId,
            name: "get_kanshi",
            call_id: "x",
            arguments: {},
          }),
        )
      ).status,
    ).toBe(403);
    expect(s.ledger.voiceDaily(at)).toBe(180);
    expect(s.ledger.voiceDaily(at + 180000)).toBe(0);
  });
  it("does not log provider secrets, transcripts, dates or raw failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup();
    s.fetcher.mockRejectedValue(
      new Error("private-api-key transcript 1990-05-05"),
    );
    const response = await s.handle("session", request());
    expect(response.status).toBe(502);
    const output = JSON.stringify([
      await response.json(),
      vi.mocked(console.info).mock.calls,
      error.mock.calls,
    ]);
    for (const secret of ["private-api-key", "transcript", "1990-05-05"])
      expect(output).not.toContain(secret);
  });
  it("development mock skips xAI but executes the real MCP tool", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MCP_VOICE_MOCK", "true");
    const s = setup(true);
    const { sessionId, mock } = await (
      await s.handle("session", request())
    ).json();
    expect(mock).toBe(true);
    expect(s.fetcher).not.toHaveBeenCalled();
    const response = await s.handle(
      "tool",
      request({
        sessionId,
        name: "get_honmei_star",
        call_id: "mock",
        arguments: { birthDate: "1990-05-05" },
      }),
    );
    expect(response.status).toBe(200);
  });
});

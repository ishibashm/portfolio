// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/mcpChain");
  vi.doUnmock("@/lib/mcpAgent");
});
it.each(["success", "error", "abort", "cancel", "timeout"])(
  "%sでもclose停止に関係なくロックを解放しstatusと一致",
  async (kind) => {
    vi.resetModules();
    vi.stubEnv("MCP_AGENT_ENABLED", "true");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    vi.stubEnv("MCP_AGENT_FREE_DAILY_REQUESTS", "20");
    let started!: () => void;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.doMock("@/lib/mcpChain", async (original) => ({
      ...(await original<object>()),
      connectChainClient: async () => ({ close: () => new Promise(() => {}) }),
    }));
    vi.doMock("@/lib/mcpAgent", async (original) => {
      const actual = await original<typeof import("@/lib/mcpAgent")>();
      return {
        ...actual,
        AGENT_LIMITS: { ...actual.AGENT_LIMITS, totalMs: 30 },
        createAgentModel: async () => ({}),
        runAgent: async (...args: Parameters<typeof actual.runAgent>) => {
          args[6]?.onModel?.("actual-fallback");
          started();
          if (kind === "error") throw new Error("503");
          if (kind !== "success")
            await actual.withinSignal(new Promise(() => {}), args[4]!);
          args[3]({ type: "done", calls: 1, reasons: [] });
        },
      };
    });
    const { POST } = await import("@/app/api/mcp-chain/route");
    const { GET } = await import("@/app/api/mcp-chain/status/route");
    const controller = new AbortController();
    const headers = {
      Origin: "https://cloud-palette.com",
      "Content-Type": "application/json",
      "x-forwarded-for": "192.0.2.1",
    };
    const request = () =>
      new Request("https://cloud-palette.com/api/mcp-chain", {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "llm", question: "1990年" }),
        signal: controller.signal,
      });
    const response = await POST(request());
    expect(response.headers.get("X-Agent-Remaining-Requests")).toBe("19");
    await running;
    if (kind === "cancel") await response.body!.cancel();
    if (kind === "abort") controller.abort();
    if (kind !== "cancel") await response.text();
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
    expect(JSON.parse(log.mock.calls[0][0]).model).toBe("actual-fallback");
    expect(
      (
        await (
          await GET(
            new Request("https://cloud-palette.com/api/mcp-chain/status", {
              headers,
            }),
          )
        ).json()
      ).remaining.requests,
    ).toBe(19);
    const next = await POST(
      new Request("https://cloud-palette.com/api/mcp-chain", {
        method: "POST",
        headers: { ...headers, "x-forwarded-for": "192.0.2.2" },
        body: JSON.stringify({ mode: "llm", question: "1990年" }),
      }),
    );
    expect(next.status).toBe(200);
    await next.text();
  },
);

// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp-chain/route";
import { createAgentModel } from "@/lib/mcpAgent";
vi.mock("@/lib/agentSession", () => ({
  agentSessionUser: async () => ({ signedIn: false }),
}));
vi.mock("@/lib/mcpAgent", async (original) => ({
  ...(await original<object>()),
  createAgentModel: vi.fn(),
}));
afterEach(() => vi.unstubAllEnvs());
it("USD予算がゼロならモデルを作る前に429と残額ヘッダを返す", async () => {
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("MCP_AGENT_PROVIDER", "xai");
  vi.stubEnv("XAI_API_KEY", "test");
  vi.stubEnv("XAI_AGENT_MODEL", "priced-model");
  vi.stubEnv("XAI_AGENT_FALLBACK_MODEL", "");
  vi.stubEnv("MCP_AGENT_DAILY_BUDGET_USD", "0");
  vi.stubEnv(
    "MCP_AGENT_PRICING_JSON",
    JSON.stringify({ "xai:priced-model": { input: 0.1, output: 0.2 } }),
  );
  const response = await POST(
    new Request("https://cloud-palette.com/api/mcp-chain", {
      method: "POST",
      headers: {
        Origin: "https://cloud-palette.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "llm", question: "相談したい" }),
    }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("X-Agent-Remaining-USD")).toBe("0");
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("本日のAI回答の枠が終わりました"),
    remaining: { usd: 0 },
  });
  expect(createAgentModel).not.toHaveBeenCalled();
});

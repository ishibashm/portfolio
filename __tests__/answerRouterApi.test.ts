// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp-chain/route";
import { canUseAgent } from "@/lib/agentEntitlement";
import { createAgentModel } from "@/lib/mcpAgent";
vi.mock("@/lib/blogStore", () => ({
  loadSearchableBlogPosts: vi.fn(async () => [
    {
      slug: "moving",
      title: "風水とは何ですか？",
      description: "風水の考え方",
      tags: [],
      draft: false,
      publishedAt: "2026-01-01",
      category: "説明",
      readingMinutes: 1,
      body: "## 先に結論\n風水は住まいについての伝統的な考え方です。流派によって解釈が異なります。科学的効果を断定する説明ではありません。",
    },
  ]),
}));
vi.mock("@/lib/agentEntitlement", () => ({
  canUseAgent: vi.fn(() => {
    throw new Error("AI枠を使ってはいけない");
  }),
}));
vi.mock("@/lib/mcpAgent", async (original) => ({
  ...(await original<object>()),
  createAgentModel: vi.fn(() => {
    throw new Error("モデルを呼んではいけない");
  }),
}));
afterEach(() => vi.unstubAllEnvs());
it("公開FAQはAI無効時にもNDJSONで返し、モデル・AI枠を呼ばない", async () => {
  vi.stubEnv("MCP_AGENT_ENABLED", "false");
  const response = await POST(
    new Request("https://cloud-palette.com/api/mcp-chain", {
      method: "POST",
      headers: {
        Origin: "https://cloud-palette.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "llm", question: "風水とは何ですか？" }),
    }),
  );
  expect(response.status).toBe(200);
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events.at(-1)).toMatchObject({ source: "site", calls: 0 });
  expect(events.some((event) => event.type === "save-offer")).toBe(false);
  expect(canUseAgent).not.toHaveBeenCalled();
  expect(createAgentModel).not.toHaveBeenCalled();
});

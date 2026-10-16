import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/houi/mcp-explorer/page";
afterEach(() => vi.unstubAllEnvs());
it("サーバー判定は鍵なしで決定的フォームにし、鍵をpropsへ渡さない", () => {
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("MCP_AGENT_MOCK", "false");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  render(Page());
  expect(screen.getByLabelText("生年月日")).toBeTruthy();
  expect(screen.queryByLabelText("質問")).toBeNull();
});
it("サーバー判定は旗と鍵でAIフォームにし、秘密を描画しない", () => {
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "secret-only-on-server");
  const element = Page();
  expect(
    JSON.stringify(element.props, (key, value) =>
      key === "type" || key === "_owner" ? undefined : value,
    ),
  ).not.toContain("secret-only-on-server");
  render(element);
  expect(screen.getByLabelText("質問")).toBeTruthy();
  expect(screen.queryByLabelText("生年月日")).toBeNull();
});

it("音声の旗・鍵がないとマイクを表示しない", () => {
  vi.stubEnv("MCP_VOICE_ENABLED", "false");
  vi.stubEnv("XAI_API_KEY", "");
  render(Page());
  expect(screen.queryByRole("button", { name: "押して話す" })).toBeNull();
});

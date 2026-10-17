import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AgentStatus from "@/app/admin/metrics/AgentStatus";
import { McpExplorer } from "@/app/ask/McpExplorer";
import HomeAgentChat from "@/components/home/HomeAgentChat";
import { AGENT_PAUSED_TEXT } from "@/lib/agentPausedText";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it.each(["ask", "home"])(
  "%sは送信前に残高切れを案内し、課金手順を公開しない",
  async (page) => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe("/api/mcp-chain/status");
      return {
        ok: true,
        json: async () => ({ enabled: true, paused: "billing" }),
      };
    });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(
      page === "ask" ? (
        <McpExplorer agentEnabled />
      ) : (
        <HomeAgentChat initialQuestion="" />
      ),
    );
    expect(await screen.findByText(AGENT_PAUSED_TEXT)).toBeTruthy();
    expect(screen.getByLabelText("AIを使わず計算のみ")).toBeTruthy();
    expect(container.textContent).not.toMatch(
      /Buy credits|aistudio|\$5|API_KEY/,
    );
    expect(fetcher.mock.calls.every(([url]) => url !== "/api/mcp-chain")).toBe(
      true,
    );
  },
);
it("管理画面はJST時刻・インスタンス制約・指定の対処手順を表示する", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        paused: "billing",
        lastBillingAt: "2026-10-17T00:01:02Z",
      }),
    })),
  );
  render(<AgentStatus />);
  expect(await screen.findByText(/2026\/10\/17 09:01:02/)).toBeTruthy();
  expect(screen.getByText(/このインスタンスで観測した最後の時刻/)).toBeTruthy();
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "https://aistudio.google.com/billing",
  );
  expect(screen.getByText(/Buy credits/)).toBeTruthy();
  expect(screen.getByText(/auto-reload/)).toBeTruthy();
  expect(screen.getByText(/Google AI Pro\/Ultra/)).toBeTruthy();
});
it("管理APIの失敗を未観測と表示しない", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  render(<AgentStatus />);
  expect(await screen.findByText(/状態を取得できませんでした/)).toBeTruthy();
  expect(screen.queryByText("未観測")).toBeNull();
});

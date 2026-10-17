import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspacePanel } from "@/components/WorkspacePanel";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("executes only after an explicit click and shows escaped results", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tools: [{ name: "get_honmei_star", inputSchema: {} }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: "<script>bad()</script>" }] }),
    });
  vi.stubGlobal("fetch", fetcher);
  const { container } = render(
    <WorkspacePanel consoleEnabled memoryEnabled={false} />,
  );
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("ツール一覧を取得"));
  await screen.findByRole("option", { name: "get_honmei_star" });
  fireEvent.click(screen.getByText("実行して応答を見る"));
  await screen.findByText(/<script>bad/);
  expect(container.querySelector("script")).toBeNull();
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
    action: "call",
    personal: false,
  });
  fireEvent(window, new Event("pagehide"));
  expect(screen.queryByText(/<script>bad/)).toBeNull();
});
it("never autosaves a note and requires explicit deletion confirmation", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      memories: [
        {
          id: "id",
          revision: 3,
          title: "家族",
          text: "部屋",
          category: "family",
        },
      ],
    }),
  });
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("confirm", confirm);
  render(
    <WorkspacePanel consoleEnabled={false} memoryEnabled initialTab="memory" />,
  );
  fireEvent.change(screen.getByLabelText("タイトル"), {
    target: { value: "新しい予定" },
  });
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("記憶を読み込む"));
  await screen.findByRole("button", { name: "家族" });
  fireEvent.click(screen.getByRole("button", { name: "家族" }));
  fireEvent.click(screen.getByText("この記憶を削除"));
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledOnce();
});
it("shows login errors without keeping old output", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "LOGIN_REQUIRED" }),
    }),
  );
  render(<WorkspacePanel consoleEnabled memoryEnabled={false} />);
  fireEvent.click(screen.getByText("ツール一覧を取得"));
  await screen.findByText("ログインしてください。");
});

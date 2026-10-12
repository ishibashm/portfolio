import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpConnectionsPanel } from "@/components/profile/McpConnectionsPanel";

const id = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const connection = {
  id,
  clientId: "test-client",
  clientName: "Test AI",
  allowedProfileIds: ["one", "deleted"],
  profiles: [
    { id: "one", name: "<img src=x onerror=alert(1)>" },
    { id: "deleted", name: null },
  ],
  scope: "read:profiles",
  createdAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-31T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  status: "active",
};
const page = { connections: [connection], nextCursor: null };
const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, json: async () => body });
async function ready() {
  render(<McpConnectionsPanel />);
  await screen.findByRole("heading", { name: "Test AI" });
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(ok(page));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("dormant connection management UI", () => {
  it("loads with Cookie/no-store and treats names as text; explains disclosure and device limits", async () => {
    const { container } = render(<McpConnectionsPanel />);
    await screen.findByRole("heading", { name: "Test AI" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mcp/connections",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      }),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/生年月日と出発地の座標/)).toBeTruthy();
    expect(screen.getByText(/端末内だけ/)).toBeTruthy();
    expect(screen.getByText(/回収できません/)).toBeTruthy();
    expect(screen.getByText(/記録なし/)).toBeTruthy();
    expect(screen.getByText("2026-10-31T00:00:00.000Z")).toBeTruthy();
  });
  it("submits only the remaining IDs and clears stale selections after refresh", async () => {
    await ready();
    const checkbox = screen.getByRole("checkbox", { name: /削除済み/ });
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
    fireEvent.click(checkbox);
    fetchMock
      .mockResolvedValueOnce(ok({ updated: true }))
      .mockResolvedValueOnce(
        ok({
          ...page,
          connections: [
            {
              ...connection,
              allowedProfileIds: ["one"],
              profiles: [connection.profiles[0]],
            },
          ],
        }),
      );
    // Native form submission also covers Enter activation without mouse-only handlers.
    fireEvent.submit(
      screen
        .getByRole("button", { name: "選択した範囲に縮小する" })
        .closest("form")!,
    );
    await screen.findByText("操作後の状態を読み込みました。");
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/mcp/connections",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MCP-Management": "1",
        },
        body: JSON.stringify({
          action: "reduceProfiles",
          connectionId: id,
          profileIds: ["one"],
        }),
      }),
    ]);
    expect(screen.queryByRole("checkbox", { name: /削除済み/ })).toBeNull();
  });
  it("requires confirmation and permits cancelling without a mutation", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "この接続を解除する" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "この接続を解除する" }));
    fetchMock
      .mockResolvedValueOnce(ok({ revoked: true }))
      .mockResolvedValueOnce(
        ok({
          ...page,
          connections: [
            {
              ...connection,
              status: "revoked",
              revokedAt: "2026-10-12T00:00:00.000Z",
            },
          ],
        }),
      );
    fireEvent.click(screen.getByRole("button", { name: "解除を実行する" }));
    await screen.findByText("状態: 解除済み");
    expect(fetchMock.mock.calls[1][1].body).toBe(
      JSON.stringify({ action: "revoke", connectionId: id }),
    );
    expect(
      screen.getByRole("checkbox", { name: /削除済み/ }).closest("fieldset")
        ?.disabled,
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "解除の後処理を再試行する" }),
    ).toBeTruthy();
  });
  it("paginates without accumulating stale data; revokeAll includes unseen pages", async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...page, nextCursor: id }));
    await ready();
    fetchMock.mockResolvedValueOnce(
      ok({
        connections: [{ ...connection, id: other, clientName: "Second AI" }],
        nextCursor: null,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "次の100件を表示する" }),
    );
    await screen.findByRole("heading", { name: "Second AI" });
    expect(screen.queryByRole("heading", { name: "Test AI" })).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/mcp/connections?after=${id}`);
    fireEvent.click(
      screen.getByRole("button", { name: "すべての接続を解除する" }),
    );
    expect(screen.getByText(/別ページを含む/)).toBeTruthy();
    fetchMock
      .mockResolvedValueOnce(ok({ revoked: true }))
      .mockResolvedValueOnce(ok({ connections: [], nextCursor: null }));
    fireEvent.click(
      screen.getByRole("button", { name: "すべての解除を実行する" }),
    );
    await screen.findByText("このページに接続はありません。");
    expect(fetchMock.mock.calls[2][1].body).toBe(
      JSON.stringify({ action: "revokeAll" }),
    );
    expect(fetchMock.mock.calls[3][0]).toBe("/api/mcp/connections");
  });
  it.each([401, 400, 503])(
    "discards stale private data after a failed mutation (%s) and hides raw errors",
    async (status) => {
      await ready();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({ error: "secret-birth token" }),
      });
      fireEvent.click(
        screen.getByRole("button", { name: "すべての接続を解除する" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "すべての解除を実行する" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).not.toContain("secret-birth");
      expect(
        within(alert)
          .getByRole("link", { name: "ログイン" })
          .getAttribute("href"),
      ).toBe("/login");
      expect(screen.queryByRole("heading", { name: "Test AI" })).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "最初から再読み込み" }),
      );
      await screen.findByRole("heading", { name: "Test AI" });
    },
  );
  it("rejects mismatched profile lists instead of offering a scope expansion", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        ...page,
        connections: [
          { ...connection, profiles: [{ id: "unshared", name: "Bad" }] },
        ],
      }),
    );
    render(<McpConnectionsPanel />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("does not send a second mutation while the first is pending", async () => {
    await ready();
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "すべての接続を解除する" }),
    );
    const execute = screen.getByRole("button", {
      name: "すべての解除を実行する",
    });
    fireEvent.click(execute);
    fireEvent.click(execute);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve(ok({ revoked: true }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
  it("aborts an outstanding read on unmount", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = render(<McpConnectionsPanel />);
    const signal = fetchMock.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

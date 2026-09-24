import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListingEmailPreview } from "@/components/relocation/ListingEmailPreview";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("previews via the authenticated endpoint and selects one URL without navigation or persistence", async () => {
  const select = vi.fn();
  const store = vi.spyOn(Storage.prototype, "setItem");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ urls: ["https://suumo.jp/a"], truncated: false }),
      ),
    );
  render(<ListingEmailPreview onSelect={select} />);
  fireEvent.click(screen.getByText(/自分の通知メールから/));
  expect(
    screen.queryByRole("region", { name: "Gmail接続" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("テスト用メール"), {
    target: { value: "test https://suumo.jp/a" },
  });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: /https:\/\/suumo.jp\/a を既存入力へ/,
    }),
  );
  expect(select).toHaveBeenCalledWith("https://suumo.jp/a");
  expect(screen.getByLabelText("テスト用メール")).toHaveValue("");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/relocation/email-preview");
  expect(store).not.toHaveBeenCalled();
});
it("shows login requirement, permits clearing, and ignores an aborted response", async () => {
  const select = vi.fn();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 401 }));
  render(<ListingEmailPreview onSelect={select} />);
  fireEvent.click(screen.getByText(/自分の通知メールから/));
  fireEvent.change(screen.getByLabelText("テスト用メール"), {
    target: { value: "private" },
  });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  await screen.findByText("プレビューにはログインが必要です。");
  let resolve!: (response: Response) => void;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  fireEvent.click(screen.getByRole("button", { name: "メール入力をクリア" }));
  resolve(new Response(JSON.stringify({ urls: ["https://suumo.jp/a"] })));
  expect(screen.getByLabelText("テスト用メール")).toHaveValue("");
  expect(select).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: /を既存入力へ/ }),
  ).not.toBeInTheDocument();
});

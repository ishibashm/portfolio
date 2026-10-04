import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { extractEmailUrls } from "@/lib/listingEmailIngest";
import { ListingEmailPreview } from "@/components/relocation/ListingEmailPreview";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("extracts pasted text locally without login, network or persistence", async () => {
  const select = vi.fn();
  const store = vi.spyOn(Storage.prototype, "setItem");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network"));
  render(<ListingEmailPreview onSelect={select} />);
  fireEvent.click(screen.getByText(/自分の通知メールから/));
  expect(
    screen.queryByRole("region", { name: "Gmail接続" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("メール本文"), {
    target: { value: "test https://suumo.jp/a" },
  });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: /https:\/\/suumo.jp\/a を既存入力へ/,
    }),
  );
  expect(select).toHaveBeenCalledWith("https://suumo.jp/a");
  expect(screen.getByLabelText("メール本文")).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
});
it("shows login requirement, permits clearing, and ignores an aborted response", async () => {
  const select = vi.fn();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 401 }));
  render(<ListingEmailPreview onSelect={select} />);
  fireEvent.click(screen.getByText(/自分の通知メールから/));
  fireEvent.change(screen.getByLabelText("メールの形式"), {
    target: { value: "html" },
  });
  fireEvent.change(screen.getByLabelText("メール本文"), {
    target: { value: "private" },
  });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  await screen.findByText(/この形式のプレビューにはログインが必要/);
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
  expect(screen.getByLabelText("メール本文")).toHaveValue("");
  expect(select).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: /を既存入力へ/ }),
  ).not.toBeInTheDocument();
});

it("keeps text for correction when the byte limit is exceeded and explains URL-free input", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network"));
  render(<ListingEmailPreview onSelect={vi.fn()} />);
  fireEvent.click(screen.getByText(/自分の通知メールから/));
  const input = screen.getByLabelText("メール本文");
  fireEvent.change(input, { target: { value: "あ".repeat(4001) } });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  await screen.findByText(/物件1件分の短い本文で/);
  expect(input).toHaveValue("あ".repeat(4001));
  fireEvent.change(input, { target: { value: "架空の物件のお知らせ" } });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  await screen.findByText(/利用できるURLがありません/);
  expect(fetch).not.toHaveBeenCalled();
});

it("plain text parsing works in a browser without Node Buffer", () => {
  vi.stubGlobal("Buffer", undefined);
  let result;
  try {
    result = extractEmailUrls("物件 https://suumo.jp/a", "text");
  } finally {
    vi.unstubAllGlobals();
  }
  expect(result?.urls).toEqual(["https://suumo.jp/a"]);
});

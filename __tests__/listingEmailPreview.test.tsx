import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { extractEmailUrls } from "@/lib/listingEmailIngest";
import { extractEmailListings } from "@/lib/listingEmailDetails";
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
  expect(select).toHaveBeenCalledWith("https://suumo.jp/a", {});
  expect(screen.getByLabelText("メール本文")).toHaveValue(
    "test https://suumo.jp/a",
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "住所は読み取れなかったため本文を残しています",
  );
  fireEvent.click(screen.getByRole("button", { name: "メール入力をクリア" }));
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
  expect(input).toHaveValue("架空の物件のお知らせ");
  fireEvent.click(screen.getByRole("button", { name: "メール入力をクリア" }));
  expect(input).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
});

it("plain text parsing works in a browser without Node Buffer", () => {
  vi.stubGlobal("Buffer", undefined);
  let result;
  try {
    result = extractEmailUrls("物件 https://suumo.jp/a", "text");
    expect(
      extractEmailListings("物件名: 合成A\nhttps://suumo.jp/a", "text")
        .listings,
    ).toEqual([{ url: "https://suumo.jp/a", propertyName: "合成A" }]);
  } finally {
    vi.unstubAllGlobals();
  }
  expect(result?.urls).toEqual(["https://suumo.jp/a"]);
});

it("keeps pasted property details separate and passes only the selected listing without network", async () => {
  const select = vi.fn();
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("No network"));
  const store = vi.spyOn(Storage.prototype, "setItem");
  render(<ListingEmailPreview onSelect={select} />);
  fireEvent.click(screen.getByText(/自分の通知メールから/));
  fireEvent.change(screen.getByLabelText("メール本文"), {
    target: {
      value:
        "物件名: 合成ハイツA\n賃料: 6万円\n所在地: 架空県見本市1-2\nhttps://suumo.jp/a\n物件名: 合成ハイツB\n賃料: 8万円\n所在地: 架空県見本市3-4\nhttps://suumo.jp/b",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "URLをプレビュー" }));
  await screen.findByText("合成ハイツA");
  expect(screen.getByLabelText("メール本文")).toHaveValue(
    "物件名: 合成ハイツA\n賃料: 6万円\n所在地: 架空県見本市1-2\nhttps://suumo.jp/a\n物件名: 合成ハイツB\n賃料: 8万円\n所在地: 架空県見本市3-4\nhttps://suumo.jp/b",
  );
  expect(screen.getByText("合成ハイツB")).toBeInTheDocument();
  expect(screen.getByText("60,000円")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "https://suumo.jp/b を既存入力へ" }),
  );
  expect(select).toHaveBeenCalledWith("https://suumo.jp/b", {
    propertyName: "合成ハイツB",
    rentYen: 80000,
    address: "架空県見本市3-4",
  });
  expect(screen.queryByText("合成ハイツA")).not.toBeInTheDocument();
  expect(screen.getByLabelText("メール本文")).toHaveValue("");
  expect(fetch).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
});

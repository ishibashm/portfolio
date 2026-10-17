import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import FaqPanel from "@/components/FaqPanel";

it("FAQ・豆知識は通信せず表示し、関連道具と候補は入力に渡すだけ", () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("通信禁止"));
  const onQuestion = vi.fn();
  render(<FaqPanel onQuestion={onQuestion} />);
  fireEvent.click(screen.getByRole("button", { name: "よくある質問" }));
  fireEvent.click(
    screen.getByRole("button", { name: "本命殺と本命的殺の違いは？" }),
  );
  expect(screen.getByText("📑 サイトの資料より")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /what-is-honmei-teki-satsu/ }),
  ).toHaveAttribute(
    "href",
    "https://cloud-palette.com/blog/what-is-honmei-teki-satsu",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "自分の場合の方位を計算したい" }),
  );
  expect(onQuestion).toHaveBeenCalledWith("自分の場合の方位を計算したい");
  fireEvent.click(screen.getByRole("button", { name: "🎲 豆知識" }));
  expect(screen.getByRole("link", { name: "出典記事を読む" })).toHaveAttribute(
    "href",
    expect.stringMatching(/^\/blog\//),
  );
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});

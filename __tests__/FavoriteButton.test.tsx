import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FavoriteButton } from "@/components/relocation/FavoriteButton";

describe("FavoriteButton", () => {
  it("星だけを押すと親カードを開かず、お気に入りを切り替える", () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    render(
      <div onClick={onOpen}>
        <FavoriteButton isFavorite={false} onToggle={onToggle} />
      </div>,
    );

    const button = screen.getByRole("button", { name: "お気に入りに追加" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("☆");

    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("登録済みなら外す操作として読める", () => {
    render(<FavoriteButton isFavorite onToggle={() => undefined} />);

    const button = screen.getByRole("button", { name: "お気に入りから外す" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("★");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

// jsdom は matchMedia を持たない。PWAInstallPrompt が
// display-mode: standalone を見るので、口だけ生やす。
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// サイドバーはログイン状態の表示のためだけに Supabase を遅延読みする。
// 読み込ませると認証の実体が要るので、口だけ用意する。
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signOut: async () => undefined,
    },
  }),
}));

import { GlobalSidebar } from "@/components/GlobalSidebar";

/**
 * 開閉ボタンに名前を付けたことの固定。
 *
 * Lighthouse の「Buttons do not have an accessible name」に挙がっていた
 * 唯一のボタンがこれ（accessibility の button-name が score 0、
 * 該当は 1 件だけだった）。中身が lucide の図形しか無いので、読み上げでは
 * 「ボタン」としか読まれず、何をするものか分からなかった。
 *
 * 名前は状態で変える。閉じているときに「メニューを閉じる」と読ませても
 * 意味が通らない。開いているかどうかは aria-expanded でも伝える
 * （名前だけだと、読み上げの種類によっては状態が落ちる）。
 */
describe("GlobalSidebar の開閉ボタン", () => {
  it("閉じているときは「メニューを開く」と読める", () => {
    render(<GlobalSidebar />);

    const button = screen.getByRole("button", { name: "メニューを開く" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("押すと名前と aria-expanded が入れ替わる", () => {
    render(<GlobalSidebar />);

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));

    const button = screen.getByRole("button", { name: "メニューを閉じる" });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("名前の無いボタンが残っていない", () => {
    // 図形だけのボタンを足したときに、ここで気付けるようにしておく。
    render(<GlobalSidebar />);

    const unnamed = screen
      .getAllByRole("button")
      .filter(
        (el) => el.textContent?.trim() === "" && !el.getAttribute("aria-label"),
      );
    expect(unnamed).toEqual([]);
  });
});

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
 * ## 名前は状態で変えない（#886 で変えた）
 *
 * 以前は「メニューを開く」「メニューを閉じる」と出し分けていた。開閉が
 * React の state から `<html data-menu>` に移り、**hydration の前から
 * 押せる**ようになったので、名前を React で出し分けると hydration の
 * 前後で読み上げが食い違う（開いているのに「メニューを開く」のまま）。
 * 名前は「メニュー」で固定し、状態は aria-expanded だけで伝える。
 * こちらは素のスクリプトも React も同じ値に揃える。
 */
describe("GlobalSidebar の開閉ボタン", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-menu");
  });

  it("名前は「メニュー」で、閉じているときは aria-expanded が false", () => {
    render(<GlobalSidebar />);

    const button = screen.getByRole("button", { name: "メニュー" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    /* 開くのは素のスクリプトの担当。React 側に onClick は無い */
    expect(button).toHaveAttribute("data-menu-toggle");
  });

  it("<html data-menu> が open になると aria-expanded が追う", async () => {
    render(<GlobalSidebar />);

    await act(async () => {
      document.documentElement.setAttribute("data-menu", "open");
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "メニュー" })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
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

import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY, themeScript } from "@/lib/theme";

const root = document.documentElement;
let media: EventTarget & { matches: boolean };

function changeOS(dark: boolean) {
  media.matches = dark;
  media.dispatchEvent(Object.assign(new Event("change"), { matches: dark }));
}

function runHeadScript() {
  new Function(themeScript)();
}

beforeEach(() => {
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  root.classList.remove("dark");
  delete root.dataset.theme;
  root.style.removeProperty("color-scheme");
});

describe("テーマ切り替え", () => {
  it("ライト、ダーク、自動を循環し、保存と両方のトグルに反映する", () => {
    runHeadScript();
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );

    for (const [label, stored, scheme] of [
      ["自動", "light", "light"],
      ["ライト", "dark", "dark"],
      ["ダーク", "system", "light"],
    ]) {
      const buttons = screen.getAllByRole("button", {
        name: new RegExp(`表示テーマ: ${label}`),
      });
      fireEvent.click(buttons[0]);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(stored);
      expect(root.classList.contains("dark")).toBe(scheme === "dark");
      expect(root.style.colorScheme).toBe(scheme);
    }
    expect(
      screen.getAllByRole("button", { name: /表示テーマ: 自動/ }),
    ).toHaveLength(2);
  });

  it("自動だけ OS 設定の変更に追従する", () => {
    runHeadScript();
    render(<ThemeToggle />);
    changeOS(true);
    expect(root).toHaveClass("dark");
    changeOS(false);
    expect(root).not.toHaveClass("dark");

    fireEvent.click(screen.getByRole("button", { name: /表示テーマ: 自動/ }));
    changeOS(true);
    expect(root).not.toHaveClass("dark");
    fireEvent.click(screen.getByRole("button", { name: /表示テーマ: ライト/ }));
    changeOS(false);
    expect(root).toHaveClass("dark");
  });

  it.each([
    [null, true, "system", "dark"],
    ["other", false, "system", "light"],
    ["light", true, "light", "light"],
    ["dark", false, "dark", "dark"],
  ])(
    "初期スクリプトで保存値 %s と OS 設定 %s を解決する",
    (stored, systemDark, theme, scheme) => {
      if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored);
      media.matches = systemDark;
      runHeadScript();
      expect(root.dataset.theme).toBe(theme);
      expect(root.classList.contains("dark")).toBe(scheme === "dark");
      expect(root.style.colorScheme).toBe(scheme);
    },
  );

  it("保存が禁止されていても初期表示とボタンが使える", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error();
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error();
    });
    media.matches = true;
    runHeadScript();
    expect(root).toHaveClass("dark");
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /表示テーマ: 自動/ }));
    expect(root).not.toHaveClass("dark");
  });
});

describe("テーマのブランド色", () => {
  it.each([
    ["light", "#faf7f2", "#171c2b", "#1e3a6e", "#ffffff", "#8a6216"],
    ["dark", "#151722", "#f3efe8", "#8cb4ff", "#151722", "#dfb968"],
  ])(
    "%s の地色、文字、勝色、ボタン文字、金を適用する",
    (scheme, background, foreground, accent, onAccent, gold) => {
      const css = readFileSync("src/app/globals.css", "utf8");
      const palette = document.createElement("style");
      // CSS 全体の Tailwind ディレクティブを除き、ルートの色定義を使う。
      palette.textContent = css
        .match(/:root(?:\.dark)?\s*\{[^}]+\}/g)!
        .join("\n");
      document.head.append(palette);
      try {
        media.matches = scheme === "dark";
        runHeadScript();
        const styles = getComputedStyle(root);
        expect(styles.getPropertyValue("--background")).toBe(background);
        expect(styles.getPropertyValue("--foreground")).toBe(foreground);
        expect(styles.getPropertyValue("--wg-accent")).toBe(accent);
        expect(styles.getPropertyValue("--wg-on-accent")).toBe(onAccent);
        expect(styles.getPropertyValue("--wg-gold")).toBe(gold);
      } finally {
        palette.remove();
      }
    },
  );
});

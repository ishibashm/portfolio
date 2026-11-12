import { readFileSync } from "node:fs";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINE_OFFICIAL_URL } from "@/lib/lineOfficial";
import { LineFriendLink } from "@/components/LineFriendLink";
import { SiteFooter } from "@/components/SiteFooter";
import TodayPage from "@/app/houi/today/page";

vi.mock("@/components/houi/CurrentDirections", () => ({
  CurrentDirections: () => null,
}));

afterEach(cleanup);

describe("公式LINEの友だち追加導線", () => {
  it("公式アカウントのURLを共有する", () => {
    expect(LINE_OFFICIAL_URL).toBe("https://line.me/R/ti/p/@345fwcgj");
  });

  it.each([
    ["共通リンク", LineFriendLink],
    ["全ページ共通フッター", SiteFooter],
    ["今日の方位の結果ページ", TodayPage],
  ])("%sに目的の分かる安全な外部リンクを表示する", (_, Component) => {
    render(<Component />);
    const link = screen.getByRole("link", {
      name: "更新のお知らせをLINEで受け取る",
    });
    expect(link).toHaveAttribute("href", LINE_OFFICIAL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(/\s+/)).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
  });

  it("ルートレイアウトで共通フッターを表示し、追加コードに禁止表現を含めない", () => {
    const paths = [
      "src/lib/lineOfficial.ts",
      "src/components/LineFriendLink.tsx",
      "src/components/SiteFooter.tsx",
      "src/app/layout.tsx",
      "src/app/houi/today/page.tsx",
    ];
    for (const path of paths) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(["Cloud Palette", "では"].join(""));
      if (path === "src/app/layout.tsx") {
        expect(source).toContain("<SiteFooter />");
      }
    }
  });
});

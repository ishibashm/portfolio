import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AgentAnswer } from "@/components/home/AgentAnswer";

it("MarkdownとGFMを要素として描画する", () => {
  const { container } = render(
    <AgentAnswer
      text={"# 見出し\n\n**太字**\n\n---\n\n- 項目\n- ~~削除~~\n\n1. 順序"}
    />,
  );
  expect(container.querySelector("strong")?.textContent).toBe("太字");
  expect(container.querySelectorAll("li")).toHaveLength(3);
  expect(container.querySelector("hr")).not.toBeNull();
  expect(container.querySelector("del")?.textContent).toBe("削除");
  expect(screen.getByRole("heading").textContent).toBe("見出し");
});
it("生HTMLと画像を描画しない", () => {
  const { container } = render(
    <AgentAnswer
      text={
        '<script>alert(1)</script>\n\n<div onclick="evil()">HTML</div>\n\n<img src="https://evil.test/x">\n\n![画像](https://cloud-palette.com/a.png)'
      }
    />,
  );
  expect(container.querySelector("script, img, [onclick]")).toBeNull();
  expect(container.textContent).not.toMatch(/alert|<script|<div|HTML/);
});
it("同一サイトの絶対URLと相対URLだけをリンクにする", () => {
  const allowed = [
    "https://cloud-palette.com/blog/a",
    "/blog/a",
    "./a",
    "../a",
    "#section",
  ];
  const denied = [
    "https://evil.test",
    "javascript:alert%281%29",
    "data:text/html,evil",
    "//evil.test",
    "http://cloud-palette.com",
    "https://cloud-palette.com.evil.test",
    "https://cloud-palette.com@evil.test",
    "https://cloud-palette.com:444/a",
    "/%5cevil.test",
  ];
  const { container } = render(
    <AgentAnswer
      text={[...allowed, ...denied]
        .map((url, i) => `[文${i}](${url})`)
        .join("\n\n")}
    />,
  );
  // Percent-encoded backslashes stay in the same-origin pathname.
  expect(
    [...container.querySelectorAll("a")].map((a) => a.getAttribute("href")),
  ).toEqual([...allowed, denied.at(-1)]);
  denied
    .slice(0, -1)
    .forEach((_, i) =>
      expect(
        screen.getByText(`文${i + allowed.length}`).closest("a"),
      ).toBeNull(),
    );
});
it("途中のMarkdownも描画でき、続きが届くと要素になる", () => {
  const { container, rerender } = render(<AgentAnswer text={"**途中"} />);
  expect(container.textContent).toContain("途中");
  rerender(
    <AgentAnswer
      text={
        "**途中の太字**\n\n- 項目\n\n[記事](https://cloud-palette.com/blog/a"
      }
    />,
  );
  expect(container.querySelector("strong")?.textContent).toBe("途中の太字");
  expect(container.querySelector("li")?.textContent).toBe("項目");
  rerender(
    <AgentAnswer
      text={
        "**途中の太字**\n\n- 項目\n\n[記事](https://cloud-palette.com/blog/a)"
      }
    />,
  );
  expect(screen.getByRole("link").getAttribute("href")).toBe(
    "https://cloud-palette.com/blog/a",
  );
});

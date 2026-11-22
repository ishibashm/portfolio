import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";

afterEach(() => cleanup());

/*
  スマホ（390px）で、本文の長い `code` や広い表に引っ張られてページ全体が
  横に広がり、画面ごと縮んで見えていた（例: /blog/does-bad-direction-last-60-years）。
  ページそのものは横にはみ出さず、表とコードの塊は器の中で横スクロールさせる。
*/
describe("記事本文がスマホで横にはみ出さない", () => {
  const body = [
    "長い `getClassicalYearStarFromSomeVeryLongFunctionName` と https://example.com/a/very/long/url/without/any/break を含む段落。",
    "",
    "| 列1 | 列2 | 列3 |",
    "| --- | --- | --- |",
    "| とても長いセルの中身 | とても長いセルの中身 | とても長いセルの中身 |",
    "",
    "```",
    "const x = 'コードの塊はとても長い行でも折り返さずに中で横スクロールする';",
    "```",
    "",
    "![図](/blog/example.png)",
  ].join("\n");

  it("本文の器は min-w-0 で、長い語は入りきらないときだけ折り返す", () => {
    const { container } = render(<BlogArticleBody body={body} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("min-w-0");
    expect(root.className).toContain("[overflow-wrap:anywhere]");
  });

  it("表は横スクロールの器に入り、器の中では折り返しを元に戻す", () => {
    const { container } = render(<BlogArticleBody body={body} />);
    const wrap = container.querySelector("table")!.parentElement!;
    expect(wrap.className).toContain("overflow-x-auto");
    expect(wrap.className).toContain("max-w-full");
    expect(wrap.className).toContain("[overflow-wrap:normal]");
  });

  it("コードの塊は折り返さず、塊の中で横スクロールする", () => {
    const { container } = render(<BlogArticleBody body={body} />);
    const pre = container.querySelector("pre")!;
    expect(pre.className).toContain("overflow-x-auto");
    expect(pre.className).toContain("max-w-full");
    expect(pre.className).toContain("[overflow-wrap:normal]");
  });

  it("画像は列の幅を超えない", () => {
    const { container } = render(<BlogArticleBody body={body} />);
    expect(container.querySelector("img")!.className).toContain("max-w-full");
  });

  it("記事ページの列はスマホでも minmax(0,1fr)（中身に引っ張られて広がらない）", () => {
    const src = fs.readFileSync("src/app/blog/[slug]/page.tsx", "utf8");
    expect(src).toContain("grid-cols-[minmax(0,1fr)] gap-10");
    expect(src).not.toMatch(/grid grid-cols-1 gap-10 lg:grid-cols/);
    expect(src).toContain('<article className="min-w-0">');
  });
});

// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page, { generateMetadata } from "@/app/houi/relocation-calendar/page";

describe("relocation calendar server page", () => {
  it("keeps the page a server component and noindexes arbitrary query keys", async () => {
    const source = readFileSync("src/app/houi/relocation-calendar/page.tsx", "utf8");
    expect(source).not.toMatch(/["']use client["']/);
    expect((await generateMetadata({ searchParams: Promise.resolve({ unknown: "1" }) })).robots)
      .toMatchObject({ index: false, follow: false });
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('method="get"');
    expect(html).not.toContain("<script");
  });
  it("renders validation errors without echoing invalid personal input", async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ birthDate: "invalid" }) }));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('value="invalid"');
  });
  it("indexes the empty form and noindexes every query, without personal metadata", async () => {
    expect(
      (await generateMetadata({ searchParams: Promise.resolve({}) })).robots,
    ).toMatchObject({ index: true });
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ birthDate: "1990-05-15" }),
    });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(JSON.stringify(metadata)).not.toContain("1990-05-15");
  });
  it("renders a GET form and results without echoing personal inputs", async () => {
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          birthDate: "1990-05-15",
          birthTime: "03:20",
          lon: "139.69",
          from: "2026-01-01",
          days: "30",
        }),
      }),
    );
    expect(html).toContain('method="get"');
    expect(html).toContain("3盤そろう日");
    expect(html).toContain("2026-01-01");
    expect(html).not.toContain("1990-05-15");
    expect(html).not.toContain('value="03:20"');
    expect(html).not.toContain("<script");
  });
});

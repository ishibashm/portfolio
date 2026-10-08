import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { AREAS, areasByPref } from "@/lib/areaContent";
import { editorialFirst } from "@/lib/editorialAreaLinks";
import AreaIndex from "@/app/houi/area/page";
import PrefPage from "@/app/houi/pref/[code]/page";
import { AreaEntryLinks } from "@/components/houi/AreaEntryLinks";
import { ArticleToolCta } from "@/components/blog/ArticleToolCta";

vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));
vi.mock("@/components/houi/GreatCircleGlobe", () => ({
  GreatCircleGlobe: () => null,
}));
// 検索に渡す全件と、本文に描くリンクを別々に確かめる。
vi.mock("@/components/houi/AreaQuickFind", () => ({
  AreaQuickFind: ({ areas }: { areas: [string, ...unknown[]][] }) => (
    <div data-search-codes={areas.map((a) => a[0]).join(",")} />
  ),
}));

function documentOf(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}
function areaCodes(doc: Document) {
  return [...doc.querySelectorAll('a[href^="/houi/area/"]')].map(
    (a) => a.getAttribute("href")!.split("/").pop()!,
  );
}

describe("解説のある頁へ辿りやすくする", () => {
  it("一覧の本文は解説のある全頁に絞り、検索と県の入口は残す", () => {
    const doc = documentOf(renderToStaticMarkup(<AreaIndex />));
    expect(new Set(areaCodes(doc))).toEqual(
      new Set(Object.keys(AREA_EDITORIAL)),
    );
    expect(
      doc
        .querySelector("[data-search-codes]")!
        .getAttribute("data-search-codes")!
        .split(",")
        .sort(),
    ).toEqual(AREAS.map((a) => a.code).sort());
    expect(doc.querySelectorAll('a[href^="/houi/pref/"]')).toHaveLength(47);
    expect(areaCodes(doc).length).toBeLessThan(AREAS.length);
  });

  it("県内の優先順は全件を保ち、元の順序と配列を壊さない", () => {
    for (const list of areasByPref().values()) {
      const before = list.map((a) => a.code);
      const result = editorialFirst(list);
      expect(result.map((a) => a.code).sort()).toEqual([...before].sort());
      expect(list.map((a) => a.code)).toEqual(before);
      const editorial = list.filter((a) => a.code in AREA_EDITORIAL);
      expect(result.slice(0, editorial.length)).toEqual(editorial);
      expect(result.slice(editorial.length)).toEqual(
        list.filter((a) => !(a.code in AREA_EDITORIAL)),
      );
    }
  });

  it.each(["12", "23"])(
    "表示のある県 %s では、方位別に解説のある街を先に描く",
    async (code) => {
      const doc = documentOf(
        renderToStaticMarkup(
          await PrefPage({ params: Promise.resolve({ code }) }),
        ),
      );
      const section = [...doc.querySelectorAll("section")].find((s) =>
        s.querySelector("h2")?.textContent?.includes("八方位ごとの市区町村"),
      )!;
      const headings = [...section.querySelectorAll("h3")];
      let checked = 0;
      for (const h of headings) {
        const codes = areaCodes(documentOf(h.parentElement!.outerHTML));
        if (!codes.length) continue;
        checked++;
        const flags = codes.map((c) => c in AREA_EDITORIAL);
        expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
      }
      expect(checked).toBeGreaterThan(0);
      // 解説のない頁も、県からは引き続き辿れる。
      expect(areaCodes(doc).some((c) => !(c in AREA_EDITORIAL))).toBe(true);
    },
  );

  it("年盤・月盤の出発地候補は、実在する解説頁を案内する", () => {
    const codes = areaCodes(
      documentOf(
        renderToStaticMarkup(<AreaEntryLinks heading="出発地を選ぶ" />),
      ),
    );
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(AREA_EDITORIAL[code]).toBeDefined();
      expect(AREAS.some((a) => a.code === code)).toBe(true);
    }
    expect(new Set(codes.map((c) => c.slice(0, 2))).size).toBe(47);
  });

  it("距離の記事から地域とガイドへ、入力操作なしで辿れる", () => {
    const doc = documentOf(
      renderToStaticMarkup(<ArticleToolCta tags={["方位", "距離"]} />),
    );
    for (const href of [
      "/houi/area",
      "/houi/pref/13",
      "/houi/area/13108",
      "/guide/compare-areas",
    ]) {
      expect(doc.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    expect(AREA_EDITORIAL["13108"]).toBeDefined();
  });
});

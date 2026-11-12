import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page, { metadata } from "@/app/houi/pref/page";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { prefNameByCode } from "@/lib/prefContent";

describe("/houi/pref（都道府県ハブ）", () => {
  it("索引対象で、自分自身を canonical にする", () => {
    expect(metadata.alternates?.canonical).toBe("/houi/pref");
    expect(metadata.title).toEqual(expect.stringContaining("都道府県"));
  });

  it("固有文のある全県へリンクし、エリア一覧と編集方針へ戻れる", () => {
    const html = renderToStaticMarkup(<Page />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const hrefs = [...doc.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    const codes = Object.keys(PREF_EDITORIAL);
    expect(codes).toHaveLength(47);
    for (const code of codes) {
      expect(hrefs, `/houi/pref/${code}`).toContain(`/houi/pref/${code}`);
      const name = prefNameByCode(code);
      expect(name, code).toBeTruthy();
      expect(doc.body.textContent).toContain(name!);
    }
    expect(hrefs).toContain("/houi/area");
    expect(hrefs).toContain("/houi");
    expect(hrefs).toContain("/editorial");
    expect(hrefs).not.toContain("/houi/pref/");
  });
});

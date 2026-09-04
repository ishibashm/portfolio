import { describe, it, expect } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { changedCodes, urlsFor } from "../scripts/submit_indexnow";

/**
 * IndexNow に送る URL の選び方。
 *
 * 送りすぎ（毎晩 1,000 頁）も、送り漏れ（動いた頁を落とす）も画面には
 * 出ない。検索エンジン側のログでしか分からないので、ここで固定する。
 */

const area = (code: string, count = 10) => ({
  code,
  lat: 35.0,
  lon: 139.0,
  count,
  sqmRent: 1000,
  medianRent: 50000,
});

/** 文章のある（index の）市区町村を 1 つ、無い（noindex の）ものを 1 つ */
const INDEXED = Object.keys(AREA_EDITORIAL)[0];
const NOINDEX = "13101"; // 千代田区。文章は無い

describe("IndexNow に送る URL", () => {
  it("前提: 検査に使う 2 つの区分が台帳と合っている", () => {
    expect(AREA_EDITORIAL[INDEXED]).toBeTruthy();
    expect(AREA_EDITORIAL[NOINDEX]).toBeUndefined();
  });

  it("値が動いていなければ 0 件", () => {
    const d = { areas: [area(INDEXED), area(NOINDEX)] };
    expect(changedCodes(d, d)).toEqual([]);
  });

  it("asOf だけ変わっても動いたことにしない", () => {
    // 毎晩変わる項目を見ると、毎晩 1,000 頁送ることになる
    const prev = { areas: [{ ...area(INDEXED), asOf: "2026-09-03" }] };
    const next = { areas: [{ ...area(INDEXED), asOf: "2026-09-04" }] };
    expect(changedCodes(prev, next)).toEqual([]);
  });

  it("件数・座標・相場のどれかが動けば拾う", () => {
    const base = area(INDEXED);
    for (const patch of [
      { count: 11 },
      { lat: 35.1 },
      { sqmRent: 1001 },
      { medianRent: 51000 },
    ]) {
      const prev = { areas: [base] };
      const next = { areas: [{ ...base, ...patch }] };
      expect(changedCodes(prev, next), JSON.stringify(patch)).toEqual([
        INDEXED,
      ]);
    }
  });

  it("新しく現れた市区町村も拾う", () => {
    expect(changedCodes({ areas: [] }, { areas: [area(INDEXED)] })).toEqual([
      INDEXED,
    ]);
  });

  it("noindex の市区町村頁は送らない。県頁は送る", () => {
    const urls = urlsFor([NOINDEX]);
    expect(urls).not.toContain(
      `https://cloud-palette.com/houi/area/${NOINDEX}`,
    );
    expect(urls).toContain("https://cloud-palette.com/houi/pref/13");
  });

  it("index の市区町村頁は、その県頁と一緒に送る", () => {
    const urls = urlsFor([INDEXED]);
    expect(urls).toContain(`https://cloud-palette.com/houi/area/${INDEXED}`);
    expect(urls).toContain(
      `https://cloud-palette.com/houi/pref/${INDEXED.slice(0, 2)}`,
    );
  });

  it("同じ県の市区町村が複数動いても県頁は 1 回", () => {
    const codes = Object.keys(AREA_EDITORIAL).filter((c) =>
      c.startsWith(INDEXED.slice(0, 2)),
    );
    const urls = urlsFor(codes);
    const prefUrls = urls.filter((u) => u.includes("/houi/pref/"));
    expect(prefUrls).toEqual([
      `https://cloud-palette.com/houi/pref/${INDEXED.slice(0, 2)}`,
    ]);
  });
});

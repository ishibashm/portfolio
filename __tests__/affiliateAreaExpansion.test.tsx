import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AffiliatePlacement } from "@/components/ads/AffiliateLink";
import {
  AFFILIATE_AREA_LABEL,
  HAKOBU_PREF_CODES,
  HAKOBU_TARGET_PREFS,
  hakobuOfferForPref,
  isHakobuTargetPref,
  offersForPath,
} from "@/lib/affiliateOffers";
import { areaAffiliateOffer, isIndexedArea } from "@/lib/areaAffiliate";
import { AREAS } from "@/lib/areaContent";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import AreaPage from "@/app/houi/area/[code]/page";

describe("ハコブ引っ越しサービスの1都3県判定", () => {
  it("対象都道府県とJISコードの定数が4都県のみを持つ", () => {
    expect([...HAKOBU_TARGET_PREFS].sort()).toEqual(
      ["東京都", "千葉県", "埼玉県", "神奈川県"].sort(),
    );
    expect([...HAKOBU_PREF_CODES].sort()).toEqual(
      ["13", "12", "11", "14"].sort(),
    );
  });

  it("東京都・千葉県・埼玉県・神奈川県のときだけ true と案件を返す", () => {
    for (const pref of HAKOBU_TARGET_PREFS) {
      expect(isHakobuTargetPref(pref), pref).toBe(true);
      const offer = hakobuOfferForPref(pref);
      expect(offer?.id, pref).toBe("hakobu-moving");
    }
    for (const shortPref of ["東京", "千葉", "埼玉", "神奈川"]) {
      expect(isHakobuTargetPref(shortPref), shortPref).toBe(true);
      expect(hakobuOfferForPref(shortPref)?.id, shortPref).toBe(
        "hakobu-moving",
      );
    }
  });

  it("対象外の道府県・空文字・undefined では false / undefined を返す", () => {
    for (const nonTarget of [
      "愛知県",
      "大阪府",
      "北海道",
      "茨城県",
      "山梨県",
      "京都府",
      "福岡県",
      "",
      undefined,
      null,
    ]) {
      expect(isHakobuTargetPref(nonTarget), String(nonTarget)).toBe(false);
      expect(hakobuOfferForPref(nonTarget), String(nonTarget)).toBeUndefined();
    }
  });
});

describe("市区町村ページ（/houi/area/[code]）のアフィリエイト判定", () => {
  it("索引対象の1都3県市区町村（新宿区・世田谷区など）ではハコブ案件を返す", () => {
    for (const code of ["13104", "13112"]) {
      expect(isIndexedArea(code), code).toBe(true);
      const offer = areaAffiliateOffer(code);
      expect(offer?.id, code).toBe("hakobu-moving");
    }
  });

  it("愛知県の市区町村では undefined を返す", () => {
    expect(areaAffiliateOffer("23100")).toBeUndefined();
    const aichiAreas = AREAS.filter((a) => a.code.startsWith("23"));
    expect(aichiAreas.length).toBeGreaterThan(0);
    for (const area of aichiAreas) {
      expect(areaAffiliateOffer(area.code), area.code).toBeUndefined();
    }
  });

  it("1都3県であっても noindex（AREA_EDITORIAL なし）の市区町村では undefined を返す", () => {
    const noindexTargetAreas = AREAS.filter(
      (a) => isHakobuTargetPref(a.pref) && !AREA_EDITORIAL[a.code],
    );
    expect(noindexTargetAreas.length).toBeGreaterThan(0);
    for (const area of noindexTargetAreas) {
      expect(isIndexedArea(area.code), area.code).toBe(false);
      expect(areaAffiliateOffer(area.code), area.code).toBeUndefined();
    }
  });

  it("AREAS のうち1都3県以外の全市区町村で undefined を返す", () => {
    const nonTargetAreas = AREAS.filter((a) => !isHakobuTargetPref(a.pref));
    expect(nonTargetAreas.length).toBeGreaterThan(0);
    for (const area of nonTargetAreas) {
      expect(areaAffiliateOffer(area.code), area.code).toBeUndefined();
    }
  });

  it("AREAS のうち noindex の全市区町村で undefined を返す", () => {
    const noindexAreas = AREAS.filter((a) => !isIndexedArea(a.code));
    expect(noindexAreas.length).toBeGreaterThan(0);
    for (const area of noindexAreas) {
      expect(areaAffiliateOffer(area.code), area.code).toBeUndefined();
    }
  });
});

describe("都道府県ページと非対象パスの判定", () => {
  it("/houi/pref/13 はハコブを返し、/houi/pref/23 と /houi/pref/27 は返さない", () => {
    expect(offersForPath("/houi/pref/13").map((o) => o.id)).toEqual([
      "hakobu-moving",
    ]);
    expect(offersForPath("/houi/pref/23")).toEqual([]);
    expect(offersForPath("/houi/pref/27")).toEqual([]);
    expect(offersForPath("/calendar")).toEqual([]);
    expect(offersForPath("/blog")).toEqual([]);
    expect(offersForPath("/blog/which-day-counts-as-moving-day")).toEqual([]);
  });
});

describe("ハコブ広告枠の表記と禁止語句の検査", () => {
  it("「広告」ラベル・対象地域注記・rel属性を含み、誇大表現を含まない", () => {
    const offer = hakobuOfferForPref("東京都")!;
    expect(offer).toBeDefined();
    for (const variant of ["sidebar", "compact"] as const) {
      const html = renderToStaticMarkup(
        createElement(AffiliatePlacement, { offer, variant }),
      );
      expect(html).toContain("広告");
      expect(html).toContain(AFFILIATE_AREA_LABEL);
      expect(html).toContain(
        "首都圏（東京・千葉・埼玉・神奈川）の引っ越し向け",
      );
      expect(html).toContain('rel="sponsored nofollow noopener"');
      expect(html).toContain('target="_blank"');
      expect(html).not.toContain("最安値級");
      expect(html).not.toContain("ランキング1位");
    }
  });

  it("市区町村・街探し・時期分析の各ページが1都3県判定を通してAffiliatePlacementを描画する", () => {
    const areaPage = readFileSync(
      join(process.cwd(), "src/app/houi/area/[code]/page.tsx"),
      "utf8",
    );
    expect(areaPage).toContain("areaAffiliateOffer");
    expect(areaPage).toContain("isIndexedArea");
    expect(areaPage).toContain('variant="compact"');
    expect(areaPage).toContain('variant="sidebar"');

    const arbitragePage = readFileSync(
      join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
      "utf8",
    );
    expect(arbitragePage).toContain("hakobuOfferForPref(basePlace?.pref)");
    expect(arbitragePage).toContain("radiusKm !== null");
    expect(arbitragePage).toContain("<AffiliatePlacement");

    const timingPage = readFileSync(
      join(process.cwd(), "src/app/relocation/timing/page.tsx"),
      "utf8",
    );
    expect(timingPage).toContain("hakobuOfferForPref(destPref)");
    expect(timingPage).toContain("<AffiliatePlacement");
  });

  it("市区町村ページ（/houi/area/[code]）の描画が1都3県かつindex対象のみ広告枠と2カラムを出す", async () => {
    const shinjukuHtml = renderToStaticMarkup(
      await AreaPage({ params: Promise.resolve({ code: "13104" }) }),
    );
    expect(shinjukuHtml).toContain("s00000020949005005000");
    expect(shinjukuHtml).toContain("s00000020949005008000");
    expect(shinjukuHtml).toContain(AFFILIATE_AREA_LABEL);
    expect(shinjukuHtml).toContain("lg:grid-cols-[minmax(0,1fr)_300px]");

    const aichiCode = AREAS.find((a) => a.code.startsWith("23"))!.code;
    const aichiHtml = renderToStaticMarkup(
      await AreaPage({ params: Promise.resolve({ code: aichiCode }) }),
    );
    expect(aichiHtml).not.toContain("s00000020949005");
    expect(aichiHtml).not.toContain("lg:grid-cols-[minmax(0,1fr)_300px]");

    const noindexTargetCode = AREAS.find(
      (a) => isHakobuTargetPref(a.pref) && !AREA_EDITORIAL[a.code],
    )!.code;
    const noindexHtml = renderToStaticMarkup(
      await AreaPage({ params: Promise.resolve({ code: noindexTargetCode }) }),
    );
    expect(noindexHtml).not.toContain("s00000020949005");
    expect(noindexHtml).not.toContain("lg:grid-cols-[minmax(0,1fr)_300px]");
  });
});

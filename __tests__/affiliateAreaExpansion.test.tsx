import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AffiliatePlacement } from "@/components/ads/AffiliateLink";
import {
  AFFILIATE_AREA_LABEL,
  AFFILIATE_OFFERS,
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
import PrefPage from "@/app/houi/pref/[code]/page";

const FORBIDDEN_HAKOBU_TERMS = [
  "s00000020949005008000",
  "s00000020949005005000",
  "TTDZ5",
  "TSQTT",
  "ランキング",
  "二冠",
  "三冠",
  "コスパ最高",
  "最安値",
  "No.1",
  "1位",
] as const;

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

  it("/houi/pref/13 と新宿ブログ経路は compact・sidebar 双方でテキスト素材 002 を出す", async () => {
    for (const path of [
      "/houi/pref/13",
      "/blog/shinjuku-2027-directions-and-rent",
    ]) {
      const offer = offersForPath(path)[0]!;
      expect(offer?.id).toBe("hakobu-moving");
      for (const variant of ["compact", "sidebar"] as const) {
        const html = renderToStaticMarkup(
          createElement(AffiliatePlacement, { offer, variant }),
        );
        expect(html).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
        expect(html).toContain("【ハコブ引っ越しサービス】");
      }
    }

    const tokyoPrefHtml = renderToStaticMarkup(
      await PrefPage({ params: Promise.resolve({ code: "13" }) }),
    );
    expect(tokyoPrefHtml).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(tokyoPrefHtml).toContain("【ハコブ引っ越しサービス】");
    expect(tokyoPrefHtml).toContain(AFFILIATE_AREA_LABEL);

    const osakaPrefHtml = renderToStaticMarkup(
      await PrefPage({ params: Promise.resolve({ code: "27" }) }),
    );
    expect(osakaPrefHtml).not.toContain("4BGDZD+CU0E7M+4HN6");
    expect(osakaPrefHtml).not.toContain("【ハコブ引っ越しサービス】");
  });
});

describe("ハコブ広告枠の表記と禁止語句の検査", () => {
  it("「広告」ラベル・対象地域注記・rel属性を含み、テキスト素材 002 のみを出し禁止語句を含まない", () => {
    const offer = hakobuOfferForPref("東京都")!;
    expect(offer).toBeDefined();
    const hakobuEntry = AFFILIATE_OFFERS.find((o) => o.id === "hakobu-moving")!;
    const serializedHakobu = JSON.stringify(hakobuEntry);
    for (const term of FORBIDDEN_HAKOBU_TERMS) {
      expect(serializedHakobu).not.toContain(term);
    }

    for (const variant of ["sidebar", "compact"] as const) {
      const html = renderToStaticMarkup(
        createElement(AffiliatePlacement, { offer, variant }),
      );
      expect(html).toContain("広告");
      expect(html).toContain(AFFILIATE_AREA_LABEL);
      expect(html).toContain(
        "首都圏（東京・千葉・埼玉・神奈川）の引っ越し向け",
      );
      expect(html).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
      expect(html).toContain("【ハコブ引っ越しサービス】");
      expect(html).toContain(
        "https://www11.a8.net/0.gif?a8mat=4BGDZD+CU0E7M+4HN6+TS3OI",
      );
      expect(html).toContain('rel="sponsored nofollow noopener"');
      expect(html).toContain('target="_blank"');
      expect(html).not.toContain("最安値級");
      expect(html).not.toContain("ランキング1位");
      for (const term of FORBIDDEN_HAKOBU_TERMS) {
        expect(html).not.toContain(term);
      }
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

  it("市区町村ページ（/houi/area/[code]）の描画が1都3県かつindex対象のみテキスト素材 002 の広告枠と2カラムを出す", async () => {
    const shinjukuHtml = renderToStaticMarkup(
      await AreaPage({ params: Promise.resolve({ code: "13104" }) }),
    );
    expect(shinjukuHtml).toContain("a8mat=4BGDZD+CU0E7M+4HN6+TS3OI");
    expect(shinjukuHtml).toContain("【ハコブ引っ越しサービス】");
    expect(shinjukuHtml).not.toContain("s00000020949005005000");
    expect(shinjukuHtml).not.toContain("s00000020949005008000");
    expect(shinjukuHtml).toContain(AFFILIATE_AREA_LABEL);
    expect(shinjukuHtml).toContain("lg:grid-cols-[minmax(0,1fr)_300px]");

    const aichiCode = AREAS.find((a) => a.code.startsWith("23"))!.code;
    const aichiHtml = renderToStaticMarkup(
      await AreaPage({ params: Promise.resolve({ code: aichiCode }) }),
    );
    expect(aichiHtml).not.toContain("s00000020949005");
    expect(aichiHtml).not.toContain("4BGDZD+CU0E7M+4HN6");
    expect(aichiHtml).not.toContain("【ハコブ引っ越しサービス】");
    expect(aichiHtml).not.toContain("lg:grid-cols-[minmax(0,1fr)_300px]");

    const noindexTargetCode = AREAS.find(
      (a) => isHakobuTargetPref(a.pref) && !AREA_EDITORIAL[a.code],
    )!.code;
    const noindexHtml = renderToStaticMarkup(
      await AreaPage({ params: Promise.resolve({ code: noindexTargetCode }) }),
    );
    expect(noindexHtml).not.toContain("s00000020949005");
    expect(noindexHtml).not.toContain("4BGDZD+CU0E7M+4HN6");
    expect(noindexHtml).not.toContain("【ハコブ引っ越しサービス】");
    expect(noindexHtml).not.toContain("lg:grid-cols-[minmax(0,1fr)_300px]");
  });
});

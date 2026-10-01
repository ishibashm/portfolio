import { describe, expect, it } from "vitest";
import {
  cleanCityName,
  officialRentForArea,
  officialRentsForPref,
} from "@/lib/officialRentForPlace";
import estatRent from "@/data/estatRent.json";
import type { EstatRentSnapshot } from "@/utils/estatRent";
import { MUNICIPALITY_POINTS } from "@/lib/municipalityCoords";

/**
 * 公的な民営家賃（小売物価統計調査）を県・市区町村に当てる。写しは毎月
 * 入れ替わるので、値ではなく当て方を見る。
 */

const SNAP = estatRent as EstatRentSnapshot;
const byCode = (code: string) =>
  SNAP.retail.cities.find((c) => c.areaCode === code);

describe("名前", () => {
  it("注記を外す", () => {
    expect(
      cleanCityName("豊橋市【2010年1月～2019年12月】【2025年1月～】"),
    ).toBe("豊橋市");
    expect(cleanCityName("千葉市")).toBe("千葉市");
  });
});

describe("県", () => {
  it("県の中の市だけを、表の並びで返す", () => {
    const chiba = officialRentsForPref(SNAP, "12");
    expect(chiba.length).toBeGreaterThan(0);
    for (const c of chiba) expect(c.areaCode.startsWith("12")).toBe(true);
    expect(chiba.map((c) => c.name)).toContain("千葉市");
  });

  it("47 都道府県のどれにも 1 市以上ある（県庁所在市）", () => {
    for (let p = 1; p <= 47; p++) {
      const code = String(p).padStart(2, "0");
      expect(officialRentsForPref(SNAP, code).length, code).toBeGreaterThan(0);
    }
  });

  it("㎡あたりは 3.3 で割った目安、前年同月比は 0.1% 単位", () => {
    const [c] = officialRentsForPref(SNAP, "12");
    const raw = byCode(c.areaCode)!;
    expect(c.perSqm).toBe(Math.round(raw.yen / 3.3));
    if (raw.yenYearAgo) {
      expect(c.yoyPct).toBeCloseTo(
        ((raw.yen - raw.yenYearAgo) / raw.yenYearAgo) * 100,
        1,
      );
    }
  });
});

describe("市区町村", () => {
  it("市そのものはコードで当たる", () => {
    expect(officialRentForArea(SNAP, "12217", "柏市")?.name).toBe("柏市");
  });

  it("政令市の区は、その市に当たる", () => {
    expect(officialRentForArea(SNAP, "12101", "千葉市中央区")?.areaCode).toBe(
      "12100",
    );
    expect(officialRentForArea(SNAP, "14133", "川崎市中原区")?.areaCode).toBe(
      "14130",
    );
    expect(officialRentForArea(SNAP, "40132", "福岡市博多区")?.areaCode).toBe(
      "40130",
    );
  });

  it("東京の区部は特別区部", () => {
    expect(officialRentForArea(SNAP, "13103", "港区")?.areaCode).toBe("13100");
  });

  it("同じ名前の別の県の市には当たらない（府中市）", () => {
    // 東京都府中市 13206 は表にある。広島県府中市 34208 は無い
    expect(officialRentForArea(SNAP, "34208", "府中市")).toBeNull();
    expect(officialRentForArea(SNAP, "13206", "府中市")?.areaCode).toBe(
      "13206",
    );
  });

  it("町村や表に無い市は null", () => {
    expect(officialRentForArea(SNAP, "12422", "長生村")).toBeNull();
    expect(officialRentForArea(SNAP, "11218", "深谷市")).toBeNull();
  });

  it("実在の市区町村で、当たった市は必ず同じ県で、名前が前に一致するかコードが同じ", () => {
    let hits = 0;
    for (const m of MUNICIPALITY_POINTS) {
      const r = officialRentForArea(SNAP, m.code, m.city);
      if (!r) continue;
      hits++;
      expect(r.areaCode.slice(0, 2), m.city).toBe(m.code.slice(0, 2));
      const ok =
        r.areaCode === m.code ||
        m.city.startsWith(r.name) ||
        r.areaCode === "13100";
      expect(ok, `${m.city} → ${r.name}`).toBe(true);
    }
    expect(hits).toBeGreaterThan(81);
  });
});

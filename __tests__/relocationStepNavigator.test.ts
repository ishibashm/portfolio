import { describe, expect, it } from "vitest";
import {
  fourLuckyForStar,
  isIndexableAreaCode,
  luckyAreasForCode,
  originOptions,
  parseDirections,
  representativeYearForStar,
  starOfYear,
} from "@/lib/relocationStepNavigator";
import { starForBirthYear } from "@/lib/kigakuContent";
import { GET } from "@/app/api/houi/lucky-areas/route";

describe("relocationStepNavigator", () => {
  it("starOfYear は既存の本命星計算と一致する", () => {
    expect(starOfYear(2026)).toBe(1);
    expect(starOfYear(2025)).toBe(2);
    for (let y = 1950; y < 2030; y++) {
      expect(starOfYear(y)).toBe(starForBirthYear(y));
    }
  });

  it("各本命星の代表年が引ける", () => {
    for (let s = 1; s <= 9; s++)
      expect(starOfYear(representativeYearForStar(s))).toBe(s);
  });

  it("四吉方は男女とも 4 方位で、合算スコアを持たない", () => {
    for (let s = 1; s <= 9; s++) {
      for (const f of fourLuckyForStar(s)) {
        expect(f.directions).toHaveLength(4);
        expect(f.directions.map((d) => d.youxing).sort()).toEqual(
          ["伏位", "天医", "延年", "生気"].sort(),
        );
        expect(f).not.toHaveProperty("score");
      }
    }
  });

  it("出発地は索引対象だけ", () => {
    const opts = originOptions();
    expect(opts.length).toBeGreaterThan(50);
    expect(opts.every((o) => isIndexableAreaCode(o.code))).toBe(true);
  });

  it("parseDirections は不正値を捨てる", () => {
    expect(parseDirections("N,XX,SE")).toEqual(["N", "SE"]);
    expect(parseDirections(null)).toEqual([]);
  });

  it("指定方位の街だけを、索引対象を優先して返す", () => {
    const origin = originOptions()[0].code;
    const items = luckyAreasForCode(origin, ["N", "S"])!;
    expect(items.every((a) => a.direction === "N" || a.direction === "S")).toBe(
      true,
    );
    for (const d of ["N", "S"]) {
      const list = items.filter((a) => a.direction === d);
      expect(list.length).toBeLessThanOrEqual(5);
      const firstNon = list.findIndex((a) => !a.indexable);
      if (firstNon >= 0)
        expect(list.slice(firstNon).every((a) => !a.indexable)).toBe(true);
    }
    expect(luckyAreasForCode("00000", ["N"])).toBeNull();
  });

  it("API は不正な入力を 400 で断る", async () => {
    const bad = await GET(
      new Request("http://x/api/houi/lucky-areas?origin=1&dirs=N"),
    );
    expect(bad.status).toBe(400);
    const origin = originOptions()[0].code;
    const ok = await GET(
      new Request(`http://x/api/houi/lucky-areas?origin=${origin}&dirs=N,E`),
    );
    expect(ok.status).toBe(200);
    expect(Array.isArray((await ok.json()).areas)).toBe(true);
  });
});

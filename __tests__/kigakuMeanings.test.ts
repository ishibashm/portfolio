import { describe, expect, it } from "vitest";
import {
  directionEffectSentence,
  elementRelation,
  elementRelationSentence,
  isHomeDirection,
  STAR_MEANINGS,
} from "@/lib/kigakuMeanings";
import { DIRECTIONS, STARS } from "@/lib/kigakuContent";

describe("九星と方位の象意", () => {
  it("9つの星すべてに象意がある", () => {
    for (const star of STARS) {
      const m = STAR_MEANINGS[star];
      expect(m, `星 ${star}`).toBeDefined();
      expect(m.keywords.length).toBeGreaterThan(0);
      expect(m.good.length).toBeGreaterThan(10);
      expect(m.bad.length).toBeGreaterThan(10);
    }
  });

  it("定位は後天定位盤どおり。五黄だけ中宮で定位を持たない", () => {
    expect(STAR_MEANINGS[1].home).toBe("N");
    expect(STAR_MEANINGS[2].home).toBe("SW");
    expect(STAR_MEANINGS[3].home).toBe("E");
    expect(STAR_MEANINGS[4].home).toBe("SE");
    expect(STAR_MEANINGS[5].home).toBeNull();
    expect(STAR_MEANINGS[6].home).toBe("NW");
    expect(STAR_MEANINGS[7].home).toBe("W");
    expect(STAR_MEANINGS[8].home).toBe("NE");
    expect(STAR_MEANINGS[9].home).toBe("S");
  });

  it("定位はすべて異なる方位（重複が無い）", () => {
    const homes = STARS.map((s) => STAR_MEANINGS[s].home).filter(Boolean);
    expect(new Set(homes).size).toBe(homes.length);
    expect(homes.length).toBe(8);
  });

  it("方位と星の全72通りで文章が作れる", () => {
    for (const dir of DIRECTIONS) {
      for (const star of STARS) {
        for (const kind of ["good", "bad"] as const) {
          const s = directionEffectSentence(dir, star, kind);
          expect(s, `${dir}/${star}/${kind}`).toBeTruthy();
          expect(s!.length, `${dir}/${star}/${kind}`).toBeGreaterThan(20);
        }
      }
    }
  });

  it("同じ方位でも星が変われば文章が変わる", () => {
    // ページ間の重複を減らすのが目的なので、ここが同じでは意味がない。
    const sentences = STARS.map((s) => directionEffectSentence("E", s, "good"));
    expect(new Set(sentences).size).toBe(STARS.length);
  });

  it("定位に回座しているときは重なりを述べる", () => {
    expect(isHomeDirection("N", 1)).toBe(true);
    expect(isHomeDirection("E", 1)).toBe(false);
    expect(directionEffectSentence("N", 1, "good")).toContain("定位");
    expect(directionEffectSentence("E", 1, "good")).not.toContain("定位");
  });

  it("五黄に吉としての働きを書かない", () => {
    const s = directionEffectSentence("NE", 5, "good")!;
    expect(s).not.toContain("恵まれ");
    expect(s).toContain("五黄土星");
  });

  it("星が分からない方位では文章を作らない", () => {
    expect(directionEffectSentence("N", null, "good")).toBeNull();
  });
});

describe("五行の相性", () => {
  it("同じ星なら比和", () => {
    for (const s of STARS) {
      expect(elementRelation(s, s), `星 ${s}`).toBe("比和");
    }
  });

  it("相生の向きを取り違えない", () => {
    // 木 → 火 → 土 → 金 → 水 → 木
    // 三碧(木) から見て 九紫(火) は「与える」、一白(水) は「受ける」。
    expect(elementRelation(3, 9)).toBe("相生（与える）");
    expect(elementRelation(3, 1)).toBe("相生（受ける）");
    expect(elementRelation(9, 3)).toBe("相生（受ける）");
    expect(elementRelation(1, 3)).toBe("相生（与える）");
  });

  it("打ち消し合う組み合わせは相剋", () => {
    // 木(三碧) と 土(二黒)、水(一白) と 火(九紫)
    expect(elementRelation(3, 2)).toBe("相剋");
    expect(elementRelation(1, 9)).toBe("相剋");
  });

  it("81通りすべてで関係が決まる", () => {
    for (const a of STARS) {
      for (const b of STARS) {
        expect(elementRelation(a, b), `${a}-${b}`).toBeTruthy();
        expect(elementRelationSentence(a, b), `${a}-${b}`).toBeTruthy();
      }
    }
  });

  it("本命星が変われば同じ回座星でも文章が変わる", () => {
    // ページ間の重複を減らすのが目的なので、ここが効く。
    const sentences = STARS.map((s) => elementRelationSentence(s, 7));
    expect(new Set(sentences).size).toBeGreaterThan(3);
  });
});

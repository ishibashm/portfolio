import { describe, expect, it } from "vitest";
import {
  degreesFromNearestEdge,
  findEditorialDrift,
  removeNameFromDirection,
  unstableToNameDeg,
} from "@/lib/editorialDrift";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";

/**
 * 境目に近すぎる地名の**検出と、その機械的な直し方**。
 *
 * 規則そのものの理由は `src/lib/editorialDrift.ts` の頭に書いた。
 * ここで見るのは「検出が働くか」と「直したあとに文が壊れないか」。
 */
describe("境目までの角度", () => {
  it("境目の真上は 0 度", () => {
    for (const edge of [15, 75, 105, 165, 195, 255, 285, 345]) {
      expect(degreesFromNearestEdge(edge)).toBeCloseTo(0, 6);
    }
  });

  it("方位の真ん中がいちばん遠い", () => {
    /* 北（345〜15）の真ん中は 0 度。両端まで 15 度ずつ */
    expect(degreesFromNearestEdge(0)).toBeCloseTo(15, 6);
    /* 北東（15〜75）の真ん中は 45 度。両端まで 30 度ずつ */
    expect(degreesFromNearestEdge(45)).toBeCloseTo(30, 6);
  });

  it("0 度をまたいでも正しく測る", () => {
    /* 350 度は 345 の境目から 5 度。360 を回り込んで測れているか */
    expect(degreesFromNearestEdge(350)).toBeCloseTo(5, 6);
  });
});

describe("距離ごとの下限", () => {
  it("近い相手ほど厳しい", () => {
    expect(unstableToNameDeg(5)).toBe(1.077);
    expect(unstableToNameDeg(15)).toBe(0.608);
    expect(unstableToNameDeg(30)).toBe(0.36);
    expect(unstableToNameDeg(100)).toBe(0.25);
  });

  it("境目の値は下の帯に入る", () => {
    /* `km < maxKm` なので 10km ちょうどは 10-20 の帯 */
    expect(unstableToNameDeg(10)).toBe(0.608);
    expect(unstableToNameDeg(40)).toBe(0.25);
  });
});

describe("方位の並びから 1 つ外す", () => {
  const P = "北西は茨城町・水戸・笠間・桜川・筑西から栃木の益子町・真岡へ。";

  it("真ん中の名前を外しても並びが繋がる", () => {
    expect(removeNameFromDirection(P, "北西", "水戸")).toBe(
      "北西は茨城町・笠間・桜川・筑西から栃木の益子町・真岡へ。",
    );
  });

  it("先頭の名前も外せる", () => {
    expect(removeNameFromDirection(P, "北西", "茨城町")).toBe(
      "北西は水戸・笠間・桜川・筑西から栃木の益子町・真岡へ。",
    );
  });

  it("「には」「も」でも当たる", () => {
    expect(
      removeNameFromDirection("南には江田島・大洲・呉が並ぶ。", "南", "大洲"),
    ).toBe("南には江田島・呉が並ぶ。");
  });

  it("2 つしか無い並びは直さない（外すと文が壊れる）", () => {
    /* 「北は A・B」から A を外すと「北は B」になり、SEG が当たらない
       形へ変わる。機械が文の形を変えないよう、ここは人へ回す */
    expect(removeNameFromDirection("北は豊島・板橋へ。", "北", "豊島")).toBe(
      null,
    );
  });

  it("同じ方位の並びが 2 つあるときは直さない", () => {
    /* どちらを直すか機械が決められない */
    const two = "北は青葉・宮城野・若林。あとで北は泉・太白・宮城野も。";
    expect(removeNameFromDirection(two, "北", "宮城野")).toBe(null);
  });

  it("「から」の直後に続く並びは触らない", () => {
    /* 「A から B・C」の B・C は A の続きで、方位の主張ではない。
       既存の検査（areaEditorialDirections）と**同じ判断**にしておく。
       ここだけ賢くすると、検出は素通りするのに修正だけが走る、という
       食い違いが起きる。 */
    const s = "東は文京から北西は板橋・練馬・豊島へ。";
    expect(removeNameFromDirection(s, "北西", "練馬")).toBe(null);
  });

  it("並びに無い名前は直さない", () => {
    expect(removeNameFromDirection(P, "北西", "宇都宮")).toBe(null);
  });
});

describe("いまの文章に対する検出", () => {
  const drift = findEditorialDrift();

  it("結果の形がそろっている", () => {
    for (const d of drift) {
      expect(d.degrees).toBeLessThan(d.floor);
      expect(d.km).toBeGreaterThan(0);
      expect(d.name.length).toBeGreaterThan(0);
      expect(typeof d.paragraph).toBe("number");
    }
  });

  /*
    **件数は 0 を期待しない。**代表点は毎晩動くので、0 を期待すると
    3 日続けて master が赤くなった状態に戻る（それがこの仕組みを
    作った理由）。ここで見るのは「拾ったものを機械で直せるか」。

    直せないもの（並びが 2 つしか無い等）が出たら、それは人が書き直す
    必要がある合図なので、そのときだけ落とす。
  */
  it("拾ったものは機械で直せる", () => {
    const stuck: string[] = [];
    for (const d of drift) {
      const before = AREA_EDITORIAL[d.code].intro[d.paragraph];
      const after = removeNameFromDirection(before, d.direction, d.name);
      if (after === null) {
        stuck.push(`${d.full} 「${d.direction}は…${d.name}…」`);
        continue;
      }
      expect(after).not.toBe(before);
      expect(after).not.toContain(`・${d.name}・`);
    }
    expect(stuck).toEqual([]);
  });
});

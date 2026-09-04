import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateToGrid, cellDegreesForZoom } from "@/lib/listingGrid";
import {
  parseMunicipalityListings,
  type MunicipalityListing,
} from "@/utils/areaDatasetMerge";

/**
 * 掲載の分布を升目にまとめる。
 *
 * 利用者の要望「広いズームのときは細かい数よりもっと大きめの数で、その
 * 箇所では集約したい」。市区町村のまま引くと全国で 1,127 個の丸になる。
 */

const m = (
  lat: number,
  lon: number,
  count: number,
  code = "x",
): MunicipalityListing => ({ code, lat, lon, count });

describe("升目の大きさ", () => {
  it("引くほど粗くなる", () => {
    expect(cellDegreesForZoom(5)).toBeGreaterThan(cellDegreesForZoom(7));
    expect(cellDegreesForZoom(7)).toBeGreaterThan(cellDegreesForZoom(9));
  });

  it("0 を返さない", () => {
    /* 0 で割ると升目の鍵が Infinity になって全部が 1 つに潰れる */
    for (let z = 0; z <= 20; z++) {
      expect(cellDegreesForZoom(z)).toBeGreaterThan(0);
    }
  });
});

describe("升目へのまとめ", () => {
  it("同じ升に入るものを足し合わせる", () => {
    const cells = aggregateToGrid([m(35.1, 139.1, 10), m(35.4, 139.4, 20)], 1);
    expect(cells).toHaveLength(1);
    expect(cells[0].count).toBe(30);
    expect(cells[0].areas).toBe(2);
  });

  it("別の升に入るものは分ける", () => {
    const cells = aggregateToGrid([m(35.1, 139.1, 10), m(36.1, 139.1, 20)], 1);
    expect(cells).toHaveLength(2);
  });

  it("位置は件数で重み付けする", () => {
    /* 単純な平均だと、掲載 3 件の村と 2 万件の市が同じ重みになり、
       印が街から離れる */
    const cells = aggregateToGrid([m(35.0, 139.0, 1), m(35.8, 139.8, 99)], 1);
    expect(cells[0].lat).toBeCloseTo(35.792, 2);
    expect(cells[0].lon).toBeCloseTo(139.792, 2);
  });

  it("掲載が 0 のものは落とす", () => {
    expect(aggregateToGrid([m(35, 139, 0)], 1)).toEqual([]);
  });

  it("升目の大きさが 0 以下なら空", () => {
    expect(aggregateToGrid([m(35, 139, 10)], 0)).toEqual([]);
    expect(aggregateToGrid([m(35, 139, 10)], -1)).toEqual([]);
  });

  it("合計は元と変わらない", () => {
    /* まとめても件数を失わない。ここが崩れると、地図の数字が実際より
       少なく出る */
    const src = [m(35, 139, 7), m(35.2, 139.2, 11), m(40, 141, 13)];
    const total = src.reduce((s, x) => s + x.count, 0);
    for (const deg of [0.5, 1, 2, 5]) {
      const sum = aggregateToGrid(src, deg).reduce((s, c) => s + c.count, 0);
      expect(sum, `${deg} 度`).toBe(total);
    }
  });
});

describe("実際の分布に当てる", () => {
  const all = parseMunicipalityListings(
    JSON.parse(
      readFileSync(
        join(process.cwd(), "public", "municipalityListings.json"),
        "utf8",
      ),
    ),
  );

  it("引くほど印が減り、1 つあたりの数が大きくなる", () => {
    const fine = aggregateToGrid(all, cellDegreesForZoom(9));
    const coarse = aggregateToGrid(all, cellDegreesForZoom(5));
    expect(coarse.length).toBeLessThan(fine.length);
    expect(coarse.length).toBeLessThan(all.length);
    const avg = (cs: { count: number }[]) =>
      cs.reduce((s, c) => s + c.count, 0) / cs.length;
    expect(avg(coarse)).toBeGreaterThan(avg(fine));
  });

  it("全国を映しても印が増えすぎない", () => {
    /* 丸だけで画面が埋まると、まとめた意味が無い */
    expect(aggregateToGrid(all, cellDegreesForZoom(5)).length).toBeLessThan(
      150,
    );
  });

  it("どの粗さでも合計が保たれる", () => {
    const total = all.reduce((s, a) => s + a.count, 0);
    for (const z of [5, 7, 9]) {
      const sum = aggregateToGrid(all, cellDegreesForZoom(z)).reduce(
        (s, c) => s + c.count,
        0,
      );
      expect(sum, `zoom ${z}`).toBe(total);
    }
  });

  it("印が日本の範囲に収まる", () => {
    for (const c of aggregateToGrid(all, cellDegreesForZoom(5))) {
      expect(c.lat, c.key).toBeGreaterThan(20);
      expect(c.lat, c.key).toBeLessThan(46);
      expect(c.lon, c.key).toBeGreaterThan(122);
      expect(c.lon, c.key).toBeLessThan(154);
    }
  });
});

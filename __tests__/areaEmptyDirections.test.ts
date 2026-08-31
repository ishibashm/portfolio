import { describe, expect, it } from "vitest";
import {
  directionsWithoutAreas,
  findArea,
  neighboursByDirection,
} from "@/lib/areaContent";
import { DIRECTIONS } from "@/lib/kigakuContent";

/**
 * 市区町村ページで「その方位に街が無い」ことを出せているか。
 *
 * ## なぜこれが要るか
 *
 * 頁は長らく候補のある方位だけを並べていて、**空の方位は黙って消えて
 * いた。**読む側は「その方位に街が無い」のか「頁が出し忘れている」のか
 * を区別できない。
 *
 * 海や山で行き止まりになる方位は、暦の上で吉方位が出ても引越し先が
 * 無いので、**この頁でいちばん効く情報**（CLAUDE.md 4 節 2-b）。
 * 文章を書いた市区町村では冒頭に人の言葉で書いているが、それは
 * 1,022 頁のうち 100 頁ほどしかない。
 *
 * ここでは実データ（areaDirections.json）で 2 つを固定する。
 *
 * 1. 地形どおりに空の方位が出る（長崎・浜松）
 * 2. 内陸で八方位が埋まる街では 1 つも出ない（誤検出しない）
 */

function emptyOf(code: string): string[] {
  const area = findArea(code);
  expect(area, `${code} が areaDirections.json に無い`).toBeDefined();
  return directionsWithoutAreas(neighboursByDirection(area!));
}

describe("directionsWithoutAreas", () => {
  it("長崎市は西・南西・南が空く（東シナ海と半島の先端）", () => {
    const empty = emptyOf("42201");
    expect(empty).toContain("W");
    expect(empty).toContain("SW");
    expect(empty).toContain("S");
    /* 北東（諫早・大村から佐賀へ）は県内で最も厚い方位なので空かない */
    expect(empty).not.toContain("NE");
  });

  it("浜松市中央区は南東・南が空く（遠州灘）", () => {
    const empty = emptyOf("22138");
    expect(empty).toContain("SE");
    expect(empty).toContain("S");
    /* 北西（新城・豊川から三河へ）は最も厚い */
    expect(empty).not.toContain("NW");
  });

  it("大阪市中央区は八方位すべてに候補がある（誤検出しない）", () => {
    expect(emptyOf("27128")).toEqual([]);
  });

  it("返すのは八方位の並び順のまま（表示の順が崩れない）", () => {
    const empty = emptyOf("42201");
    const order = DIRECTIONS.filter((d) => empty.includes(d));
    expect(empty).toEqual(order);
  });
});

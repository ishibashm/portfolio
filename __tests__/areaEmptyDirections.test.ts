import { describe, expect, it } from "vitest";
import { emptyDirections, findArea } from "@/lib/areaContent";
import { DIRECTIONS } from "@/lib/kigakuContent";

/**
 * 市区町村ページで「その方位に街が無い」ことを出せているか。
 *
 * ## なぜこれが要るか
 *
 * 頁は長らく候補のある方位だけを並べていて、**空の方位は黙って消えて
 * いた。**読む側は「その方位に街が無い」のか「頁が出し忘れている」のか
 * を区別できない。海や山で行き止まりになる方位は、暦の上で吉方位が
 * 出ても引越し先が無いので、**この頁でいちばん効く情報**。
 *
 * ## 理由を取り違えないこと
 *
 * 一覧は 5〜150km で切っている。**空の 709 方位のうち 114 は、150km
 * より先には市区町村がある**（2026-08-31 の実測）。そこを「行き止まり」
 * と書くと嘘になる。最初の実装はそう書いていたので、ここで分ける。
 */

function empty(code: string) {
  const area = findArea(code);
  expect(area, `${code} が areaDirections.json に無い`).toBeDefined();
  return emptyDirections(area!);
}

function deadEnds(code: string): string[] {
  return empty(code)
    .filter((e) => !e.hasBeyondRange)
    .map((e) => e.direction);
}

function farOnly(code: string): string[] {
  return empty(code)
    .filter((e) => e.hasBeyondRange)
    .map((e) => e.direction);
}

describe("emptyDirections", () => {
  it("長崎市は西・南西・南が空く（東シナ海と半島の先端）", () => {
    const all = empty("42201").map((e) => e.direction);
    expect(all).toContain("W");
    expect(all).toContain("SW");
    expect(all).toContain("S");
    /* 北東（諫早・大村から佐賀へ）は県内で最も厚い方位なので空かない */
    expect(all).not.toContain("NE");
  });

  it("長崎市の南西は「行き止まり」ではなく「遠いだけ」", () => {
    /* 実測: 150km より先に 17 の市区町村がある。ここを行き止まりと
       書いていたのが最初の実装の誤り。 */
    expect(farOnly("42201")).toContain("SW");
    expect(deadEnds("42201")).not.toContain("SW");
  });

  it("浜松市中央区は南東・南が空く（遠州灘）", () => {
    const all = empty("22138").map((e) => e.direction);
    expect(all).toContain("SE");
    expect(all).toContain("S");
    expect(all).not.toContain("NW");
  });

  it("函館市の南西は「遠いだけ」（本州が 150km より先にある）", () => {
    expect(farOnly("01202")).toContain("SW");
    expect(deadEnds("01202")).not.toContain("SW");
  });

  it("大阪市中央区は八方位すべてに候補がある（誤検出しない）", () => {
    expect(empty("27128")).toEqual([]);
  });

  it("返すのは八方位の並び順のまま（表示の順が崩れない）", () => {
    const all = empty("42201").map((e) => e.direction);
    expect(all).toEqual(DIRECTIONS.filter((d) => all.includes(d)));
  });
});

import { describe, expect, it } from "vitest";
import { parsePoint } from "../scripts/import_spots";

/**
 * Wikidata の座標の読み取り。
 *
 * WKT は `Point(経度 緯度)` の順で、**経度が先**。ここを取り違えると
 * 日本の神社が中東あたりに並ぶ。目で見れば分かる間違いだが、
 * 見るまで分からないので固定する。
 */
describe("Wikidata の座標を読む", () => {
  it("経度が先、緯度が後（順を取り違えない）", () => {
    /* 寒川神社。probe の実測値（run 33939209623）。 */
    expect(parsePoint("Point(139.383612 35.37979)")).toEqual([
      35.37979, 139.383612,
    ]);
  });

  it("空白の揺れを吸収する", () => {
    expect(parsePoint("Point( 135.65107  34.669953 )")).toEqual([
      34.669953, 135.65107,
    ]);
  });

  it("日本の外は捨てる（取り違えの検出）", () => {
    /* 経度と緯度を逆に読むと、35.37979 が経度になってイランあたりへ
       飛ぶ。そういう値は取り込まない。 */
    expect(parsePoint("Point(35.37979 139.383612)")).toBeNull();
    expect(parsePoint("Point(0 0)")).toBeNull();
  });

  it("読めない形は null", () => {
    expect(parsePoint("")).toBeNull();
    expect(parsePoint("Point(abc def)")).toBeNull();
    expect(parsePoint("35.3, 139.3")).toBeNull();
  });
});

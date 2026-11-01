import { describe, expect, it } from "vitest";
import { ogTitleFontSize } from "@/lib/og/card";

/**
 * 画像そのものの描画は next/og が sharp に SVG を渡す。Vitest の変換下では
 * そのバイト列が壊れるので、ここでは折り返しの大きさだけを固定する。
 * 描画はビルドした opengraph-image で見る。
 */
describe("共有カードの題の大きさ", () => {
  it("短い題は大きく、都道府県の題は 1 行に収まる大きさ", () => {
    expect(ogTitleFontSize("短い題")).toBe(64);
    expect(ogTitleFontSize("東京都の家賃相場と方位別の市区町村")).toBe(56);
  });

  it("最終行が 1 字だけになる大きさは採らない", () => {
    expect(ogTitleFontSize("あ".repeat(16))).toBeLessThan(64);
  });

  it("長い題ほど字を小さくする", () => {
    expect(ogTitleFontSize("あ".repeat(70))).toBeLessThan(
      ogTitleFontSize("あ".repeat(20)),
    );
  });
});

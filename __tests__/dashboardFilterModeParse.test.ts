import { describe, expect, it } from "vitest";
import {
  DIRECTION_FILTER_MODES,
  parseDashboardFilterMode,
  parseDirectionFilterMode,
} from "@/utils/directionFilterMode";

/**
 * ダッシュボードの観点の読み込み口。
 *
 * #1337 で観点のボタンが古い id（`kigaku_env` など）を書いていたのを
 * 正規の名前に直した。**クラウドに保存された古い値はそのまま残る**ので、
 * ダッシュボードの読み込みで正規の名前に写す。一度読んで保存し直せば、
 * 他の頁（`parseDirectionFilterMode` を通す側）も正規の名前を読める。
 *
 * 写すのは**ここだけ**。`parseDirectionFilterMode` の「知らない値は総合
 * 判定」はそのまま（MetaphysicalConfigBar のテストが固定している）。
 * ここで両方を並べて、決めごとが 2 つあることを見えるようにしておく。
 */
describe("parseDashboardFilterMode", () => {
  it("7 つの見方はそのまま", () => {
    for (const m of DIRECTION_FILTER_MODES) {
      expect(parseDashboardFilterMode(m)).toBe(m);
    }
  });

  it("表示の重ね札 2 つはそのまま（総合判定に倒さない）", () => {
    expect(parseDashboardFilterMode("optimal_only")).toBe("optimal_only");
    expect(parseDashboardFilterMode("exclude_noise")).toBe("exclude_noise");
  });

  it.each([
    ["kigaku_env", "personal_kigaku_environmental"],
    ["kigaku_bazi", "personal_kigaku_bazi"],
    ["bazi_env", "environmental_bazi"],
  ])("古い id %s は %s に写す", (legacy, canonical) => {
    expect(parseDashboardFilterMode(legacy)).toBe(canonical);
    /* 他の頁の読み口は、いまも総合判定に倒す。決めごとは 2 つある */
    expect(parseDirectionFilterMode(legacy)).toBe("composite");
  });

  it("壊れた値・空・null は総合判定", () => {
    expect(parseDashboardFilterMode("nonsense")).toBe("composite");
    expect(parseDashboardFilterMode("")).toBe("composite");
    expect(parseDashboardFilterMode(null)).toBe("composite");
    expect(parseDashboardFilterMode(undefined)).toBe("composite");
    /* prototype の名前で写さない */
    expect(parseDashboardFilterMode("toString")).toBe("composite");
  });
});

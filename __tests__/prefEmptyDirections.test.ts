import { describe, expect, it } from "vitest";
import { getPrefStats, prefNameByCode } from "@/lib/prefContent";
import { DIRECTIONS } from "@/lib/kigakuContent";

/**
 * 県ページが「掲載のある市区町村が入らない方位」を黙って消さないこと。
 *
 * 頁は長らく候補のある方位だけを並べていた（byDirection を
 * `areas.length > 0` で絞っていた）。読む側は「その方位に街が無い」のか
 * 「頁が出し忘れている」のかを区別できず、実測では **47 県で合計 151 の
 * 方位が黙って消えていた**（2026-08-31）。市区町村ページで同じ問題を
 * #789 で直したので、県ページも揃える。
 *
 * ## 意味を取り違えないこと
 *
 * 市区町村ページの空は「5〜150km に街が無い」で、海や山の行き止まりを
 * 含む。県ページの空は**県内で掲載を集計できている市区町村**の話で、
 * 巡回が届いていないだけの場合がある（熊本県は熊本市の 5 区しか無いので
 * 7 方位が空く）。頁の文言はそこを断定していない。
 */

describe("県ページの空の方位", () => {
  const prefs = Array.from({ length: 47 }, (_, i) =>
    prefNameByCode(String(i + 1).padStart(2, "0")),
  ).filter((p): p is string => Boolean(p));

  it("47 県ぶん引ける（空回りしていない）", () => {
    expect(prefs).toHaveLength(47);
  });

  it("出した方位と空の方位で、必ず八方位を過不足なく覆う", () => {
    for (const pref of prefs) {
      const s = getPrefStats(pref);
      expect(s, pref).toBeDefined();
      const shown = s!.byDirection.map((g) => g.dir);
      const all = [...shown, ...s!.emptyDirections].sort();
      expect(all, pref).toEqual([...DIRECTIONS].sort());
      // 出した方位は必ず中身がある
      for (const g of s!.byDirection)
        expect(g.areas.length, pref).toBeGreaterThan(0);
    }
  });

  it("実際に空の方位がある県と、無い県の両方を拾える", () => {
    /* 片方しか無いと、条件分岐のどちらかが一度も通らないまま緑になる。
       岡山県は掲載が岡山市の 4 区だけで 7 方位が空く。埼玉県は 8 方位
       すべてに市区町村がある */
    expect(getPrefStats("岡山県")!.emptyDirections.length).toBe(7);
    expect(getPrefStats("埼玉県")!.emptyDirections).toEqual([]);
  });

  it("空の方位は全国で 100 を超える（消していた量の記録）", () => {
    const total = prefs.reduce(
      (n, p) => n + (getPrefStats(p)?.emptyDirections.length ?? 0),
      0,
    );
    expect(total).toBeGreaterThan(100);
  });
});

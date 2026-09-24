import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OVERVIEW_PAINT_KEY,
  overviewWedgeOpacity,
  parseOverviewPaint,
  prefFillOn,
  wedgeOutlineOnly,
} from "@/lib/wedgeOverlay";
import { TIER_SECTOR_OPACITY } from "@/utils/tierDisplay";

/**
 * 全国の地図で、県ではなく**方位の扇形そのもの**を塗れること
 * （利用者の指摘、2026-09-24）。
 *
 *     どの県へ動けるかの地図は方角が描画されていないですが、都道府県が
 *     赤くなるか緑になるかだと、その方位の枠内でも赤になるのでは？
 *     純粋に枠内を色塗れない？
 *
 * 県の塗り分けは県の中心 1 点の方位で県全体を 1 色にしていた。境目を
 * またぐ広い県は、吉方位の扇形の中の土地まで凶の色になる。扇形は全国では
 * 境界線だけ（塗りなし）だったので、正しい塗りがどこにも無かった。
 *
 * 既定を「扇形を塗る・県は輪郭だけ」にし、県ごとの塗りは切り替えで残す。
 */

describe("塗り方の決め", () => {
  it("未保存・知らない値は扇形（正確なほう）", () => {
    expect(parseOverviewPaint(null)).toBe("wedge");
    expect(parseOverviewPaint("xx")).toBe("wedge");
    expect(parseOverviewPaint("pref")).toBe("pref");
  });

  it("県を塗るのは、全国を見ていて「県ごと」を選んだときだけ", () => {
    expect(prefFillOn(true, "pref")).toBe(true);
    expect(prefFillOn(true, "wedge")).toBe(false);
    expect(prefFillOn(false, "pref")).toBe(false);
  });

  it("扇形で塗る見方では、全国でも扇形を塗る（境界線だけにしない）", () => {
    const under = { zoningOn: false, hazardOn: false };
    expect(
      wedgeOutlineOnly({ isOverview: prefFillOn(true, "wedge"), ...under }),
    ).toBe(false);
    /* 県を塗るなら今までどおり扇形は線だけ（2 枚の色を混ぜない） */
    expect(
      wedgeOutlineOnly({ isOverview: prefFillOn(true, "pref"), ...under }),
    ).toBe(true);
  });

  it("全国の扇形は近景より濃く、県の塗り（0.5）より薄い", () => {
    for (const o of Object.values(TIER_SECTOR_OPACITY)) {
      const v = overviewWedgeOpacity(o);
      expect(v).toBeGreaterThan(o);
      expect(v).toBeLessThan(0.5);
    }
  });
});

describe("地図の部品が決めを使っている", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src/components/ArbitrageMapInner.tsx"),
    "utf8",
  );

  it("扇形の塗り外しは、県を塗っているかどうかで決める", () => {
    expect(SRC).toMatch(/wedgeOutlineOnly\(\{\s*isOverview: prefFilled,/);
  });

  it("扇形で塗るときは、県は輪郭だけ（塗りを 0 にする）", () => {
    expect(SRC).toMatch(/if \(!prefFilled\) \{\s*return \{\s*fillOpacity: 0,/);
  });

  it("凡例に切り替えがあり、選んだ見方を端末に残す", () => {
    expect(SRC).toContain('aria-label="全国の地図で何を塗るか"');
    expect(SRC).toContain("localStorage.setItem(OVERVIEW_PAINT_KEY, next)");
    expect(OVERVIEW_PAINT_KEY).toBe("arb_overview_paint");
  });
});

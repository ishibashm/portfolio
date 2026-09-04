import { describe, it, expect } from "vitest";
import {
  POPOVER_WIDTH,
  clampPopoverX,
} from "@/components/relocation/DayCellPopover";

/**
 * 吹き出しは押したマスの真上に出る。月初・月末のマスをそのまま中心に
 * すると器からはみ出して欠けるので、横位置を器の中へ寄せる。
 * 画面でしか見えない崩れなので、境目の値を固定する。
 */

describe("吹き出しの横位置", () => {
  const W = POPOVER_WIDTH;
  const half = W / 2;

  it("真ん中のマスは動かさない", () => {
    expect(clampPopoverX(500, 1000)).toBe(500);
  });

  it("左端のマスは右へ寄せる", () => {
    expect(clampPopoverX(0, 1000)).toBe(half + 4);
    expect(clampPopoverX(10, 1000)).toBe(half + 4);
  });

  it("右端のマスは左へ寄せる", () => {
    expect(clampPopoverX(1000, 1000)).toBe(1000 - half - 4);
  });

  it("器が吹き出しより狭ければ中央に置く", () => {
    // 幅の狭い画面。寄せる余地が無いので、はみ出し方を左右で等しくする
    expect(clampPopoverX(10, 200)).toBe(100);
    expect(clampPopoverX(190, 200)).toBe(100);
  });

  it("寄せても器の中に収まる", () => {
    for (const x of [0, 1, 100, 499, 500, 999, 1000]) {
      const at = clampPopoverX(x, 1000);
      expect(at - half).toBeGreaterThanOrEqual(0);
      expect(at + half).toBeLessThanOrEqual(1000);
    }
  });
});

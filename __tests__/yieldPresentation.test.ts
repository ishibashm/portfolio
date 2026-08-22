import { describe, expect, it } from "vitest";
import { SEQUENTIAL_RAMP } from "@/lib/panelPalette";
import {
  MIN_CELLS_FOR_PREFECTURE,
  YIELD_CAVEATS,
  YIELD_DOMAIN_MAX,
  YIELD_DOMAIN_MIN,
  YIELD_LEGEND,
  formatYield,
  isPrefectureReliable,
  yieldColor,
} from "@/lib/yieldPresentation";

/**
 * 利回りの見せ方。**色と閾値が 1 か所に閉じていること**を固定する。
 *
 * 目で見て「だんだん濃い」と判断しない。週次で集計し直すので、
 * 目盛りが動くと同じ利回りの色が先週と今週で変わる。
 */
describe("利回りの色", () => {
  it("目盛りは固定で、データに合わせて伸縮しない", () => {
    // 定数として公開されていること自体が「固定」の意味。
    expect(YIELD_DOMAIN_MIN).toBe(0.04);
    expect(YIELD_DOMAIN_MAX).toBe(0.14);
  });

  it("利回りが上がるほど濃くなる（順序が崩れていない）", () => {
    const steps = [0.04, 0.06, 0.08, 0.1, 0.12, 0.14];
    /*
      indexOf は使わない。SEQUENTIAL_RAMP は as const なので引数が
      リテラルの合併型になり、string を渡せない。キャストで押し通すのは
      CLAUDE.md で禁じてあるので findIndex で比べる。
    */
    const indexes = steps.map((v) => {
      const color = yieldColor(v);
      return SEQUENTIAL_RAMP.findIndex((step) => step === color);
    });
    // どの段もランプの中の色であること
    expect(indexes.every((i) => i >= 0)).toBe(true);
    // 単調に増える（同じ段が続くのは可。戻ってはいけない）
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i]).toBeGreaterThanOrEqual(indexes[i - 1]);
    }
    // 端から端で実際に段が変わっている（空回りしていない）
    expect(indexes[indexes.length - 1]).toBeGreaterThan(indexes[0]);
  });

  it("目盛りの外は端の色に張り付く", () => {
    expect(yieldColor(0.001)).toBe(yieldColor(YIELD_DOMAIN_MIN));
    expect(yieldColor(0.9)).toBe(yieldColor(YIELD_DOMAIN_MAX));
  });

  it("数値でない入力でも色を返す（地図が穴だらけにならない）", () => {
    expect(yieldColor(Number.NaN)).toBe(SEQUENTIAL_RAMP[0]);
  });

  it("凡例は目盛りと同じ関数から色を引いている", () => {
    for (const entry of YIELD_LEGEND) {
      expect(entry.color).toBe(yieldColor(entry.value));
    }
  });
});

describe("都道府県のまとめ", () => {
  /*
    実測（2026-08-22）で秋田県は区画 2 つしかなかった。それで
    「秋田県の中央値 8.67%」と出すのは弱すぎる。
  */
  it("区画が少ない県は、そのまま読めない印が付く", () => {
    expect(isPrefectureReliable(2)).toBe(false);
    expect(isPrefectureReliable(MIN_CELLS_FOR_PREFECTURE - 1)).toBe(false);
    expect(isPrefectureReliable(MIN_CELLS_FOR_PREFECTURE)).toBe(true);
    expect(isPrefectureReliable(60)).toBe(true);
  });
});

describe("表示", () => {
  it("年利を小数 1 桁の % にする", () => {
    expect(formatYield(0.0748)).toBe("7.5%");
    expect(formatYield(0.1411)).toBe("14.1%");
  });

  it("出せないときは 0% と偽らない", () => {
    expect(formatYield(Number.NaN)).toBe("—");
  });
});

describe("断り書き", () => {
  /*
    数字だけ出すと根拠のある数字に見えてしまう。**消されていないこと**
    を固定する。減らすときはここも直すことになり、そこで気付ける。
  */
  it("6 点そろっている", () => {
    expect(YIELD_CAVEATS).toHaveLength(6);
  });

  it("いちばん誤解されやすい 3 点が残っている", () => {
    const all = YIELD_CAVEATS.join("");
    expect(all).toContain("募集賃料");
    expect(all).toContain("表面利回り");
    expect(all).toContain("賃貸を集めていない");
  });
});

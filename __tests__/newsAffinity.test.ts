import { describe, it, expect } from "vitest";
import {
  MAX_WEIGHT,
  MIN_WEIGHT,
  bump,
  orderByAffinity,
  parseAffinity,
  type Affinity,
} from "@/lib/newsAffinity";

/**
 * 「よく開く話題を上に寄せる」の重み。
 * 並びが少し変わるだけなので、壊れても画面では気付きにくい。固定する。
 */

describe("話題の重み", () => {
  it("上限と下限で止まる（1 つの話題が全部を押し出さない）", () => {
    let a: Affinity = {};
    for (let i = 0; i < 20; i++) a = bump(a, "rent", 1);
    expect(a.rent).toBe(MAX_WEIGHT);
    for (let i = 0; i < 40; i++) a = bump(a, "rent", -1);
    expect(a.rent).toBe(MIN_WEIGHT);
  });

  it("重みの高い話題を前へ。同じ重みの中は元の順のまま", () => {
    const items = [
      { id: 1, topic: "building" as const },
      { id: 2, topic: "rent" as const },
      { id: 3, topic: null },
      { id: 4, topic: "rent" as const },
      { id: 5, topic: "building" as const },
    ];
    const out = orderByAffinity(items, { rent: 2 });
    expect(out.map((x) => x.id)).toEqual([2, 4, 1, 3, 5]);
  });

  it("重みが無ければ元の順のまま（新着順を壊さない）", () => {
    const items = [
      { id: 1, topic: "rent" as const },
      { id: 2, topic: null },
    ];
    expect(orderByAffinity(items, {}).map((x) => x.id)).toEqual([1, 2]);
  });

  it("減らした話題は後ろへ回るが、消えない", () => {
    const items = [
      { id: 1, topic: "bid" as const },
      { id: 2, topic: "rent" as const },
    ];
    const out = orderByAffinity(items, { bid: -1 });
    expect(out.map((x) => x.id)).toEqual([2, 1]);
    expect(out).toHaveLength(2);
  });

  it("保存値の読み込みは壊れた入力に耐える", () => {
    expect(parseAffinity(null)).toEqual({});
    expect(parseAffinity("not json")).toEqual({});
    expect(parseAffinity("[1,2]")).toEqual({});
    expect(parseAffinity('{"rent":"3"}')).toEqual({});
    // 知らない鍵は捨て、範囲外は丸める
    expect(parseAffinity('{"rent":99,"ghost":1}')).toEqual({
      rent: MAX_WEIGHT,
    });
  });
});

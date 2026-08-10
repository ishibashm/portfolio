import { describe, expect, it } from "vitest";

import {
  OlsAccumulator,
  buildHedonicModel,
  hedonicX,
  histogram,
  kaplanMeier,
  quantileSorted,
  summarizeDistribution,
  trailingAverage,
} from "@/utils/marketStats";

describe("OlsAccumulator", () => {
  it("既知の直線 y = 2 + 3x を厳密に復元する", () => {
    const acc = new OlsAccumulator(2);
    for (let x = 0; x < 10; x++) acc.add([1, x], 2 + 3 * x);
    const s = acc.solve()!;
    expect(s.beta[0]).toBeCloseTo(2, 8);
    expect(s.beta[1]).toBeCloseTo(3, 8);
    expect(s.r2).toBeCloseTo(1, 8);
  });

  it("ノイズ付きの多変量でも真の係数の近くへ寄る", () => {
    // 擬似乱数（決定的）。Math.random は使わない
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31 - 0.5;
    };
    const acc = new OlsAccumulator(4);
    for (let i = 0; i < 5000; i++) {
      const size = 20 + Math.abs(rand()) * 80;
      const age = Math.abs(rand()) * 40;
      const station = Math.abs(rand()) * 25;
      const x = hedonicX(size, age, station);
      // 真のモデル: log(rent) = 8 + 0.7*log(size) - 0.01*age - 0.008*station
      const y =
        8 + 0.7 * Math.log(size) - 0.01 * age - 0.008 * station + rand() * 0.1;
      acc.add(x, y);
    }
    const s = acc.solve()!;
    expect(s.beta[1]).toBeCloseTo(0.7, 1);
    expect(s.beta[2]).toBeCloseTo(-0.01, 2);
    expect(s.beta[3]).toBeCloseTo(-0.008, 2);
    expect(s.r2).toBeGreaterThan(0.9);
  });

  it("merge した結果は一括で入れた結果と一致する", () => {
    const all = new OlsAccumulator(2);
    const a = new OlsAccumulator(2);
    const b = new OlsAccumulator(2);
    for (let x = 0; x < 20; x++) {
      const y = 1 + 0.5 * x + (x % 3);
      all.add([1, x], y);
      (x < 10 ? a : b).add([1, x], y);
    }
    a.merge(b);
    const s1 = all.solve()!;
    const s2 = a.solve()!;
    expect(s2.beta[0]).toBeCloseTo(s1.beta[0], 10);
    expect(s2.beta[1]).toBeCloseTo(s1.beta[1], 10);
    expect(s2.r2).toBeCloseTo(s1.r2, 10);
  });

  it("標本不足・特異行列では null", () => {
    const acc = new OlsAccumulator(3);
    acc.add([1, 2, 4], 1);
    expect(acc.solve()).toBeNull();
    const sing = new OlsAccumulator(2);
    // x が全部同じ値 → 定数項と識別できない
    for (let i = 0; i < 10; i++) sing.add([1, 5], i);
    expect(sing.solve()).toBeNull();
  });
});

describe("summarizeDistribution / quantile", () => {
  it("分位点は線形補間", () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5);
    expect(quantileSorted([10], 0.9)).toBe(10);
    expect(quantileSorted([], 0.5)).toBeNaN();
  });

  it("対称な分布は歪度ゼロ・右裾の分布は正の歪度", () => {
    const sym = summarizeDistribution([1, 2, 3, 4, 5])!;
    expect(sym.skewness).toBeCloseTo(0, 8);
    const skewed = summarizeDistribution([1, 1, 1, 1, 2, 2, 3, 20])!;
    expect(skewed.skewness).toBeGreaterThan(1);
    expect(skewed.median).toBeLessThan(skewed.mean);
  });

  it("2 件未満は null", () => {
    expect(summarizeDistribution([1])).toBeNull();
    expect(summarizeDistribution([])).toBeNull();
  });
});

describe("histogram", () => {
  it("件数の合計が入力数と一致し、範囲外は端に寄る", () => {
    const h = histogram([-5, 0, 1, 2, 9, 100], 0, 10, 5);
    expect(h).toHaveLength(5);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(6);
    expect(h[0].count).toBe(3); // -5(寄せ), 0, 1
    expect(h[4].count).toBe(2); // 9, 100(寄せ)
  });
});

describe("kaplanMeier", () => {
  it("打ち切りが無ければ経験的生存関数と一致する", () => {
    const { curve, medianDays } = kaplanMeier([
      { duration: 1, event: true },
      { duration: 2, event: true },
      { duration: 3, event: true },
      { duration: 4, event: true },
    ]);
    // S(1)=3/4, S(2)=1/2, S(3)=1/4, S(4)=0
    expect(curve.find((p) => p.day === 2)!.survival).toBeCloseTo(0.5);
    expect(medianDays).toBe(2);
  });

  it("打ち切りは分母から抜けるが生存率を下げない", () => {
    const withCensor = kaplanMeier([
      { duration: 1, event: true },
      { duration: 2, event: false }, // まだ掲載中
      { duration: 3, event: true },
    ]);
    // S(1) = 2/3, S(3) = 2/3 * (1 - 1/1) = 0
    expect(withCensor.curve.find((p) => p.day === 1)!.survival).toBeCloseTo(
      2 / 3,
    );
    // 打ち切りを event 扱いすると S(1)=2/3 のあと S(2) が下がってしまう。
    // ここで day=2 の点が存在しないことが、打ち切りの正しい扱いの証拠
    expect(withCensor.curve.find((p) => p.day === 2)).toBeUndefined();
  });

  it("空入力", () => {
    const r = kaplanMeier([]);
    expect(r.curve).toEqual([]);
    expect(r.medianDays).toBeNull();
  });
});

describe("trailingAverage", () => {
  it("窓に満たない先頭は手前までの平均", () => {
    expect(trailingAverage([2, 4, 6, 8], 2)).toEqual([2, 3, 5, 7]);
  });
});

describe("buildHedonicModel の係数の読み下し", () => {
  it("弾力性・年次効果を % に正しく変換する", () => {
    const acc = new OlsAccumulator(4);
    // 完全な合成データ: log(rent) = 10 + 0.8*log(size) - 0.012*age - 0.005*st
    for (let i = 0; i < 200; i++) {
      const size = 15 + (i % 50);
      const age = i % 35;
      const st = i % 20;
      acc.add(
        hedonicX(size, age, st),
        10 + 0.8 * Math.log(size) - 0.012 * age - 0.005 * st,
      );
    }
    const m = buildHedonicModel(acc)!;
    expect(m.effects.sizeElasticityPct).toBeCloseTo(
      (Math.pow(1.1, 0.8) - 1) * 100,
      3,
    );
    expect(m.effects.agePctPerYear).toBeCloseTo(
      (Math.exp(-0.012) - 1) * 100,
      3,
    );
    expect(m.effects.stationPctPerMin).toBeCloseTo(
      (Math.exp(-0.005) - 1) * 100,
      3,
    );
  });
});

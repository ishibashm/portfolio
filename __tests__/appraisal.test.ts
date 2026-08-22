import { describe, expect, it } from "vitest";
import {
  MIN_COMPS,
  appraise,
  selectComps,
  type Comp,
  type SubjectProperty,
} from "@/utils/appraisal";

/**
 * 持ち込み査定の判断を固定する。
 *
 * ここで決めているのは「どこまで条件を緩めたか」と「幅で出す」の 2 つ。
 * **どちらも画面にそのまま出る**ので、変えると利用者の見る数字が変わる。
 */

/** 京都市中心部あたり。区画 0.05 度は約 5km 四方。 */
const BASE = { lat: 35.01, lon: 135.76 };

function comp(over: Partial<Comp> = {}): Comp {
  return {
    lat: BASE.lat,
    lon: BASE.lon,
    areaSqm: 70,
    unitPriceSqm: 500_000,
    builtYear: 2005,
    tradeYear: 2024,
    ...over,
  };
}

function subject(over: Partial<SubjectProperty> = {}): SubjectProperty {
  return {
    lat: BASE.lat,
    lon: BASE.lon,
    areaSqm: 70,
    builtYear: 2005,
    askingPrice: null,
    ...over,
  };
}

describe("比較する成約の選び方", () => {
  it("条件が合う成約が 5 件あれば、いちばん厳しい段で止まる", () => {
    const candidates = Array.from({ length: 6 }, () => comp());
    const { tier, comps } = selectComps(subject(), candidates);
    expect(comps).toHaveLength(6);
    expect(tier?.label).toContain("同じ区画・築年 ±10 年");
  });

  it("厳しい段で足りなければ緩める（緩めたことが label に出る）", () => {
    // 築年が 15 年離れているので ±10 では落ち、±20 で拾える
    const candidates = Array.from({ length: 6 }, () =>
      comp({ builtYear: 1990 }),
    );
    const { tier, comps } = selectComps(subject(), candidates);
    expect(comps).toHaveLength(6);
    expect(tier?.label).toContain("±20 年");
  });

  it("最後まで緩めても足りなければ諦める（足りないまま出さない）", () => {
    const candidates = Array.from({ length: MIN_COMPS - 1 }, () => comp());
    const { tier, comps } = selectComps(subject(), candidates);
    expect(tier).toBeNull();
    expect(comps).toHaveLength(0);
  });

  it("遠すぎる成約は隣の区画の段でも入らない", () => {
    // 0.05 度 × 5 ＝ 5 区画ぶん離す
    const far = Array.from({ length: 20 }, () =>
      comp({ lat: BASE.lat + 0.25 }),
    );
    const { tier } = selectComps(subject(), far);
    expect(tier).toBeNull();
  });

  it("建築年が分からない成約を、築年で落とさない", () => {
    /*
      「分からない」を「合わない」に倒すと、古い成約が丸ごと落ちて
      件数が足りなくなる。null は通す。
    */
    const candidates = Array.from({ length: 6 }, () =>
      comp({ builtYear: null }),
    );
    const { tier } = selectComps(subject(), candidates);
    expect(tier?.label).toContain("同じ区画・築年 ±10 年");
  });

  it("面積がかけ離れた成約は落ちる（1LDK と 3LDK を混ぜない）", () => {
    const candidates = Array.from({ length: 6 }, () => comp({ areaSqm: 25 }));
    const { tier } = selectComps(subject({ areaSqm: 70 }), candidates);
    // ±30% でも ±50% でも入らないので、条件を問わない最後の段まで落ちる
    expect(tier?.label).toContain("築年と面積は問わない");
  });
});

describe("査定の中身", () => {
  const spread: Comp[] = [
    comp({ unitPriceSqm: 400_000 }),
    comp({ unitPriceSqm: 450_000 }),
    comp({ unitPriceSqm: 500_000 }),
    comp({ unitPriceSqm: 550_000 }),
    comp({ unitPriceSqm: 600_000 }),
  ];

  it("点ではなく幅で返す", () => {
    const a = appraise(subject(), spread);
    expect(a).not.toBeNull();
    expect(a!.perSqm.median).toBe(500_000);
    expect(a!.perSqm.p25).toBeLessThan(a!.perSqm.median);
    expect(a!.perSqm.p75).toBeGreaterThan(a!.perSqm.median);
    // 総額は面積を掛けただけ
    expect(a!.price.mid).toBe(500_000 * 70);
  });

  it("使った件数と、緩めた度合いを返す", () => {
    const a = appraise(subject(), spread);
    expect(a!.n).toBe(5);
    expect(a!.tierLabel).toContain("同じ区画");
  });

  it("成約の時点を返す（時点補正をまだしていないため）", () => {
    const a = appraise(subject(), [
      ...spread,
      comp({ tradeYear: 2023 }),
      comp({ tradeYear: 2025 }),
    ]);
    expect(a!.tradeYears).toEqual({ from: 2023, to: 2025 });
  });

  it("売出価格を入れると、その位置づけが出る", () => {
    // 70㎡ × 600,000 = 4,200 万円。成約 5 件中 4 件がこれより安い
    const a = appraise(subject({ askingPrice: 600_000 * 70 }), spread);
    expect(a!.asking?.perSqm).toBe(600_000);
    expect(a!.asking?.ratioBelow).toBeCloseTo(0.8, 5);
    // 中央値 500,000 に対して 20% 高い
    expect(a!.asking?.gapFromMedian).toBeCloseTo(0.2, 5);
  });

  it("売出価格が無ければ asking は null（0 と偽らない）", () => {
    const a = appraise(subject(), spread);
    expect(a!.asking).toBeNull();
  });

  it("件数が足りなければ null（相場並みと言わない）", () => {
    expect(appraise(subject(), spread.slice(0, 3))).toBeNull();
  });

  it("面積が 0 なら null（0 除算で無限大を出さない）", () => {
    expect(appraise(subject({ areaSqm: 0 }), spread)).toBeNull();
  });
});

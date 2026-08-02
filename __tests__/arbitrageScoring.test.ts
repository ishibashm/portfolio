import { describe, it, expect } from "vitest";
import {
  AXIS_ORDER,
  LOCAL_VALUE_MIN_SAMPLES,
  WEIGHT_PRESETS,
  composeScore,
  getPreset,
  isCandidateStrategy,
  parseFloorNumber,
  parseLayoutRooms,
  scoreBuilding,
  scoreCost,
  scoreLocalValue,
  scoreMarket,
  scoreProximity,
  scoreSpace,
  scoreStationAccess,
  slidersToWeights,
  tScore,
  weightsToSliders,
} from "@/utils/arbitrageScoring";

describe("tScore", () => {
  it("相場ちょうどなら 50 を返す", () => {
    expect(tScore(3000, 3000, 500)).toBe(50);
  });

  it("invert を立てると安いほど高得点になる", () => {
    // 1 標準偏差ぶん安い → 60
    expect(tScore(2500, 3000, 500, true)).toBeCloseTo(60);
    expect(tScore(3500, 3000, 500, true)).toBeCloseTo(40);
  });

  it("ばらつきが 0 の母集団では差が付かないので 50 に倒す", () => {
    expect(tScore(2500, 3000, 0, true)).toBe(50);
  });

  it("0〜100 に収める", () => {
    expect(tScore(0, 3000, 100, true)).toBe(100);
    expect(tScore(99999, 3000, 100, true)).toBe(0);
  });
});

describe("scoreStationAccess", () => {
  it("徒歩 3 分以内は満点", () => {
    expect(scoreStationAccess(1)).toBe(100);
    expect(scoreStationAccess(3)).toBe(100);
  });

  it("遠くなるほど単調に下がる", () => {
    const near = scoreStationAccess(5)!;
    const mid = scoreStationAccess(15)!;
    const far = scoreStationAccess(25)!;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });

  it("未取得なら null（0 点ではない）", () => {
    expect(scoreStationAccess(null)).toBeNull();
    expect(scoreStationAccess(undefined)).toBeNull();
  });
});

describe("scoreProximity", () => {
  it("5km 圏内は満点、遠いほど下がる", () => {
    expect(scoreProximity(2)).toBe(100);
    expect(scoreProximity(50)).toBe(0);
    expect(scoreProximity(27.5)).toBeCloseTo(50, 0);
  });

  it("未取得なら null", () => {
    expect(scoreProximity(null)).toBeNull();
  });
});

describe("parseLayoutRooms", () => {
  it("間取りから居室数を取る", () => {
    expect(parseLayoutRooms("2LDK")).toBe(2);
    expect(parseLayoutRooms("3 LDK")).toBe(3);
    expect(parseLayoutRooms("1K")).toBe(1);
    expect(parseLayoutRooms("1R")).toBe(1);
    expect(parseLayoutRooms("ワンルーム")).toBe(1);
  });

  it("判別できない表記は null", () => {
    expect(parseLayoutRooms("")).toBeNull();
    expect(parseLayoutRooms(null)).toBeNull();
    expect(parseLayoutRooms("メゾネット")).toBeNull();
  });
});

describe("parseFloorNumber", () => {
  it("階数を数値にする", () => {
    expect(parseFloorNumber("3階")).toBe(3);
    expect(parseFloorNumber("12階")).toBe(12);
    expect(parseFloorNumber("1")).toBe(1);
  });

  it("地下は負の数にする", () => {
    expect(parseFloorNumber("地下1階")).toBe(-1);
    expect(parseFloorNumber("B1階")).toBe(-1);
  });

  it("数値化できない表記は null", () => {
    expect(parseFloorNumber("-")).toBeNull();
    expect(parseFloorNumber(null)).toBeNull();
  });
});

describe("scoreSpace", () => {
  it("同じ面積でも居室数が多いほど 1 室あたりが狭くなり下がる", () => {
    const oneRoom = scoreSpace(40, "1K", 40, 10)!;
    const threeRoom = scoreSpace(40, "3LDK", 40, 10)!;
    expect(oneRoom).toBeGreaterThan(threeRoom);
  });

  it("間取り不明でも面積の偏差値だけで算出する", () => {
    expect(scoreSpace(60, null, 40, 10)).toBeCloseTo(70);
  });

  it("面積が無ければ null", () => {
    expect(scoreSpace(null, "1K", 40, 10)).toBeNull();
  });
});

describe("scoreBuilding", () => {
  it("築浅ほど高い", () => {
    expect(scoreBuilding(0, "3階", false)!).toBeGreaterThan(
      scoreBuilding(20, "3階", false)!,
    );
  });

  it("1 階・地下は減点される", () => {
    const third = scoreBuilding(10, "3階", false)!;
    const first = scoreBuilding(10, "1階", false)!;
    const basement = scoreBuilding(10, "地下1階", false)!;
    expect(third).toBeGreaterThan(first);
    expect(first).toBeGreaterThan(basement);
  });

  it("築年数が無ければ判定材料が無いので null", () => {
    expect(scoreBuilding(null, "3階", false)).toBeNull();
  });
});

describe("scoreMarket", () => {
  const now = new Date("2026-08-02T00:00:00Z");

  it("新着ほど高い", () => {
    const fresh = scoreMarket(new Date("2026-08-01T00:00:00Z"), 1, now)!;
    const stale = scoreMarket(new Date("2026-05-01T00:00:00Z"), 1, now)!;
    expect(fresh).toBeGreaterThan(stale);
  });

  it("掲載社数が多いほど下がる（既に出回っている）", () => {
    const exclusive = scoreMarket(new Date("2026-07-30T00:00:00Z"), 1, now)!;
    const crowded = scoreMarket(new Date("2026-07-30T00:00:00Z"), 12, now)!;
    expect(exclusive).toBeGreaterThan(crowded);
  });

  it("材料が片方だけでも算出する", () => {
    expect(scoreMarket(null, 1, now)).not.toBeNull();
    expect(scoreMarket(new Date("2026-07-30T00:00:00Z"), null, now)).not.toBeNull();
  });

  it("材料が無ければ null", () => {
    expect(scoreMarket(null, null, now)).toBeNull();
  });
});

describe("scoreCost", () => {
  it("予算の 70% 以下なら満点", () => {
    expect(scoreCost(70000, 100000)).toBe(100);
  });

  it("予算ちょうどで 60 前後、超過で下がる", () => {
    expect(scoreCost(100000, 100000)).toBeCloseTo(60, 0);
    expect(scoreCost(145000, 100000)).toBe(0);
  });

  it("予算未設定なら軸として使わない", () => {
    expect(scoreCost(100000, null)).toBeNull();
    expect(scoreCost(100000, 0)).toBeNull();
  });
});

describe("scoreLocalValue", () => {
  it("中央値ちょうどで 50、安いほど高い", () => {
    expect(scoreLocalValue(3000, 3000, 20)).toBe(50);
    expect(scoreLocalValue(2400, 3000, 20)).toBeCloseTo(80);
    expect(scoreLocalValue(3600, 3000, 20)).toBeCloseTo(20);
  });

  it("サンプルが少ない地域は中央値が偶然で動くので算出しない", () => {
    expect(scoreLocalValue(2400, 3000, LOCAL_VALUE_MIN_SAMPLES - 1)).toBeNull();
    expect(scoreLocalValue(2400, 3000, LOCAL_VALUE_MIN_SAMPLES)).not.toBeNull();
  });

  it("基準が無ければ null", () => {
    expect(scoreLocalValue(2400, null, 20)).toBeNull();
  });
});

describe("composeScore", () => {
  it("重み付き平均を返す", () => {
    const result = composeScore(
      { value: 80, astrology: 40 },
      { value: 0.5, astrology: 0.5 },
    );
    expect(result.score).toBeCloseTo(60);
    expect(result.coverage).toBe(1);
    expect(result.missing).toEqual([]);
  });

  it("欠損軸は 0 点ではなく評価対象外として残りで正規化する", () => {
    // access が無いだけの物件が最下位に沈まないこと。
    const withAccess = composeScore(
      { value: 80, access: 80 },
      { value: 0.5, access: 0.5 },
    );
    const withoutAccess = composeScore(
      { value: 80, access: null },
      { value: 0.5, access: 0.5 },
    );
    expect(withoutAccess.score).toBeCloseTo(withAccess.score);
    expect(withoutAccess.coverage).toBeCloseTo(0.5);
    expect(withoutAccess.missing).toEqual(["access"]);
  });

  it("重み 0 の軸は欠損扱いにしない", () => {
    const result = composeScore(
      { value: 80, cost: null },
      { value: 1, cost: 0 },
    );
    expect(result.missing).toEqual([]);
    expect(result.coverage).toBe(1);
  });

  it("使える軸が 1 つも無ければ 0 点・カバレッジ 0", () => {
    const result = composeScore({ value: null }, { value: 1 });
    expect(result.score).toBe(0);
    expect(result.coverage).toBe(0);
  });

  it("寄与の合計が総合スコアに一致する", () => {
    const axes = { value: 80, astrology: 40, access: 60 };
    const weights = { value: 0.5, astrology: 0.3, access: 0.2 };
    const result = composeScore(axes, weights);
    const sum = Object.values(result.contributions).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(result.score);
  });
});

describe("プリセット", () => {
  it("すべての軸キーを持ち、重みは非負", () => {
    for (const preset of WEIGHT_PRESETS) {
      for (const key of AXIS_ORDER) {
        expect(preset.weights[key]).toBeTypeOf("number");
        expect(preset.weights[key]).toBeGreaterThanOrEqual(0);
      }
      const total = AXIS_ORDER.reduce((s, k) => s + preset.weights[k], 0);
      expect(total).toBeGreaterThan(0);
    }
  });

  it("id が重複していない", () => {
    const ids = WEIGHT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("未知の id は既定プリセットに落ちる", () => {
    expect(getPreset("no-such-preset").id).toBe("balanced");
  });

  it("プリセットごとに最重要軸が異なる（角度が実際に変わる）", () => {
    const topAxis = (id: string) => {
      const w = getPreset(id).weights;
      return AXIS_ORDER.reduce((best, k) => (w[k] > w[best] ? k : best), AXIS_ORDER[0]);
    };
    expect(topAxis("bargain")).toBe("value");
    expect(topAxis("fortune")).toBe("astrology");
    expect(topAxis("commute")).toBe("access");
    expect(topAxis("family")).toBe("space");
    expect(topAxis("quality")).toBe("building");
    expect(topAxis("budget")).toBe("cost");
    expect(topAxis("hidden")).toBe("market");
  });
});

describe("スライダーと重みの往復", () => {
  it("スライダー値を合計 1 の重みに正規化する", () => {
    const weights = slidersToWeights({ value: 50, astrology: 50 });
    expect(weights.value).toBeCloseTo(0.5);
    expect(weights.astrology).toBeCloseTo(0.5);
    expect(weights.access).toBe(0);
  });

  it("すべて 0 なら既定プリセットに戻す", () => {
    expect(slidersToWeights({})).toEqual(getPreset("balanced").weights);
  });

  it("重み → スライダー → 重み で比率が保たれる", () => {
    const original = getPreset("commute").weights;
    const roundTripped = slidersToWeights(weightsToSliders(original));
    for (const key of AXIS_ORDER) {
      expect(roundTripped[key]).toBeCloseTo(original[key], 2);
    }
  });
});

describe("isCandidateStrategy", () => {
  it("既知の戦略だけ通す", () => {
    expect(isCandidateStrategy("balanced")).toBe(true);
    expect(isCandidateStrategy("station")).toBe(true);
    expect(isCandidateStrategy("'; DROP TABLE rental_properties;--")).toBe(false);
  });
});

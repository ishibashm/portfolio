import { describe, it, expect } from "vitest";
import {
  ALL_LAYER_MODES,
  mergeStatuses,
  statusForLayerMode,
  type DirectionLayers,
} from "@/utils/directionStatus";

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * 2026-08-04・既定プロフィール（生年月日 2000/01/01・東京）で本番から実測した盤。
 * 年+日 を選んだときに地図とヒートマップが食い違っていた実例をそのまま固定する。
 */
const OBSERVED: DirectionLayers = {
  yearLayer: {
    N: "NOISE_ANKEN",
    NE: "NOISE_HA",
    E: "SAFE",
    SE: "SAFE",
    S: "NOISE_GOU",
    SW: "NOISE_GETSUMEI",
    W: "OPTIMAL_REGULAR",
    NW: "SAFE",
  },
  monthLayer: {
    N: "NOISE_GETSUTEKI",
    NE: "NOISE_HA",
    E: "NOISE_ANKEN",
    SE: "SAFE",
    S: "NOISE_GETSUMEI",
    SW: "NOISE_NODE",
    W: "NOISE_GOU",
    NW: "OPTIMAL_REGULAR",
  },
  dayLayer: {
    N: "NOISE_VOID",
    NE: "NOISE_ANKEN",
    E: "NOISE_TEKI",
    SE: "NOISE_HA",
    S: "OPTIMAL_REGULAR",
    SW: "NOISE_GOU",
    W: "NOISE_HONMEI",
    NW: "NOISE_GETSUTEKI",
  },
  finalVectors: {
    N: "NOISE_ANKEN",
    NE: "NOISE_ANKEN",
    E: "NOISE_ANKEN",
    SE: "NOISE_HA",
    S: "NOISE_GOU",
    SW: "NOISE_GOU",
    W: "NOISE_GOU",
    NW: "NOISE_GETSUTEKI",
  },
};

describe("mergeStatuses", () => {
  it("重い凶を優先する", () => {
    expect(mergeStatuses(["OPTIMAL", "NOISE_GOU"])).toBe("NOISE_GOU");
    expect(mergeStatuses(["NOISE_ANKEN", "NOISE_GOU"])).toBe("NOISE_GOU");
    // 破と本命殺は両方とも五大凶殺だが、エンジンの合成は破を
    // 五黄殺と同格の絶対格として先に採る。以前ここは本命殺を
    // 期待していて、エンジンと逆の順序を固定してしまっていた。
    expect(mergeStatuses(["NOISE_HA", "NOISE_HONMEI"])).toBe("NOISE_HA");
    // 五大凶殺（本命殺）は二次凶（天中殺方位）より必ず先に出る
    expect(mergeStatuses(["NOISE_VOID", "NOISE_HONMEI"])).toBe("NOISE_HONMEI");
  });

  it("凶が無ければ吉を残す", () => {
    expect(mergeStatuses(["SAFE", "OPTIMAL"])).toBe("OPTIMAL");
    expect(mergeStatuses(["SAFE", "OPTIMAL_REGULAR"])).toBe("OPTIMAL_REGULAR");
    expect(mergeStatuses(["SAFE", "SAFE"])).toBe("SAFE");
  });

  it("優先順表に無い凶は名前を保ったまま残す", () => {
    // NOISE_GETSUMEI（月命殺）は表に無い。SAFE に落とすと「凶なのに平穏」、
    // "NOISE" に潰すと地図のラベルも色も消える。
    expect(mergeStatuses(["NOISE_GETSUMEI", "SAFE"])).toBe("NOISE_GETSUMEI");
    expect(mergeStatuses(["NOISE_GETSUMEI", "NOISE_GOU"])).toBe("NOISE_GOU");
  });

  it("空なら SAFE", () => {
    expect(mergeStatuses([])).toBe("SAFE");
    expect(mergeStatuses([undefined, undefined])).toBe("SAFE");
  });
});

describe("statusForLayerMode", () => {
  it("単独の時間軸はその盤をそのまま返す", () => {
    expect(statusForLayerMode(OBSERVED, "N", "year")).toBe("NOISE_ANKEN");
    expect(statusForLayerMode(OBSERVED, "N", "month")).toBe("NOISE_GETSUTEKI");
    expect(statusForLayerMode(OBSERVED, "N", "day")).toBe("NOISE_VOID");
    expect(statusForLayerMode(OBSERVED, "N", "final")).toBe("NOISE_ANKEN");
  });

  it("年+日 は月盤を外すので、全統合とは違う答えになる", () => {
    // 実測で地図とヒートマップが割れていた 2 方位。
    // 月盤の五黄・暗剣が本命殺／的殺を覆い隠しており、月盤を外すと表に出る。
    expect(statusForLayerMode(OBSERVED, "E", "year_day")).toBe("NOISE_TEKI");
    expect(statusForLayerMode(OBSERVED, "W", "year_day")).toBe("NOISE_HONMEI");
    expect(statusForLayerMode(OBSERVED, "E", "final")).toBe("NOISE_ANKEN");
    expect(statusForLayerMode(OBSERVED, "W", "final")).toBe("NOISE_GOU");
  });

  it("組み合わせは含む盤だけを見る", () => {
    // 南は日盤だけが吉。年盤の五黄が入る組み合わせでは吉にならない。
    expect(statusForLayerMode(OBSERVED, "S", "day")).toBe("OPTIMAL_REGULAR");
    expect(statusForLayerMode(OBSERVED, "S", "year_day")).toBe("NOISE_GOU");
    expect(statusForLayerMode(OBSERVED, "S", "month_day")).toBe(
      "NOISE_GETSUMEI",
    );
  });

  it("凶の名前を組み合わせでも失わない", () => {
    // SW は年盤=月命殺・月盤=ノード。優先表（noiseSeverity）では
    // 月命殺のほうが重い。以前の表は月命殺を載せておらずノードが
    // 勝っていた。
    expect(statusForLayerMode(OBSERVED, "SW", "year_month")).toBe(
      "NOISE_GETSUMEI",
    );
    expect(statusForLayerMode(OBSERVED, "NW", "year_day")).toBe(
      "NOISE_GETSUTEKI",
    );
  });

  it("知らないモードは全統合に落とす", () => {
    expect(statusForLayerMode(OBSERVED, "E", "")).toBe(OBSERVED.finalVectors.E);
    expect(statusForLayerMode(OBSERVED, "E", "year_month_day")).toBe(
      OBSERVED.finalVectors.E,
    );
  });

  it("盤に無い方位は SAFE", () => {
    const empty: DirectionLayers = {
      yearLayer: {},
      monthLayer: {},
      dayLayer: {},
      finalVectors: {},
    };
    for (const mode of ALL_LAYER_MODES) {
      expect(statusForLayerMode(empty, "N", mode)).toBe("SAFE");
    }
  });

  it("組み合わせモードは、地図が元々やっていた合成と同じ答えを返す", () => {
    // 地図（MagneticMapInner）が持っていた実装を参照実装として書き下ろし、
    // 共通化した関数がそれと一致することを確かめる。
    // ヒートマップ側はこの合成を持たず、全統合を返していた。
    const asMapDidBefore = (d: string, mode: string) => {
      if (mode === "year_month")
        return mergeStatuses([OBSERVED.yearLayer[d], OBSERVED.monthLayer[d]]);
      if (mode === "month_day")
        return mergeStatuses([OBSERVED.monthLayer[d], OBSERVED.dayLayer[d]]);
      return mergeStatuses([OBSERVED.yearLayer[d], OBSERVED.dayLayer[d]]);
    };
    for (const mode of ["year_month", "month_day", "year_day"]) {
      for (const d of DIRS) {
        expect(statusForLayerMode(OBSERVED, d, mode)).toBe(
          asMapDidBefore(d, mode),
        );
      }
    }
  });

  it("年+日 は全統合と一致しない方位を持つ（素通しなら気付けない）", () => {
    const differing = DIRS.filter(
      (d) =>
        statusForLayerMode(OBSERVED, d, "year_day") !==
        statusForLayerMode(OBSERVED, d, "final"),
    );
    // 本番で地図とヒートマップが割れていたのがちょうどこの 2 方位。
    expect(differing).toEqual(["E", "W"]);
  });
});

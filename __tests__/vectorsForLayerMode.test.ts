import { describe, expect, it } from "vitest";
import {
  ALL_LAYER_MODES,
  statusForLayerMode,
  vectorsForLayerMode,
  type DirectionLayers,
} from "@/utils/directionStatus";

/**
 * `vectorsForLayerMode` は「時間軸 → 方位ごとのステータス」の唯一の実装。
 *
 * これを置く前は同じ if の連鎖が 6 か所に写されていて、どれも
 * 年+月／月+日／年+日 を知らなかった（全統合に落ちるか、空になる）。
 * 旧実装をここに写し、単独の盤では同じ答え、組み合わせでは違う答えに
 * なることを固定する。
 */

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const STATUSES = [
  "SAFE",
  "OPTIMAL",
  "OPTIMAL_REGULAR",
  "NOISE_GOU",
  "NOISE_ANKEN",
  "NOISE_HA",
  "NOISE_HONMEI",
  "NOISE_TEKI",
  "NOISE_VOID",
  "NOISE_GETSUMEI",
  "NOISE_GETSUTEKI",
  "NOISE_NODE",
];

/** 旧実装（municipalities-wealth / arbitrageAstro / SolarTimeClock と同じ形）。 */
function legacyVectors(layers: DirectionLayers, mode: string) {
  if (mode === "year") return layers.yearLayer;
  if (mode === "month") return layers.monthLayer;
  if (mode === "day") return layers.dayLayer;
  return layers.finalVectors;
}

/** 決定的な疑似乱数。実行のたびに違う盤で落ちないように種を固定する。 */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

function randomLayers(seed: number): DirectionLayers {
  const r = rng(seed);
  const layer = () => {
    const out: Record<string, string> = {};
    for (const d of DIRS) out[d] = STATUSES[Math.floor(r() * STATUSES.length)];
    return out;
  };
  return {
    yearLayer: layer(),
    monthLayer: layer(),
    dayLayer: layer(),
    finalVectors: layer(),
  };
}

describe("vectorsForLayerMode", () => {
  it("単独の盤と全統合は、盤のオブジェクトそのものを返す（旧実装と同一）", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layers = randomLayers(seed);
      for (const mode of ["year", "month", "day", "final", ""]) {
        // 同じ参照。呼び出し側の `=== finalVectors` 判定を壊さない
        expect(vectorsForLayerMode(layers, mode)).toBe(
          legacyVectors(layers, mode),
        );
      }
    }
  });

  it("組み合わせは方位ごとに statusForLayerMode と同じ答えになる", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const layers = randomLayers(seed);
      for (const mode of ["year_month", "month_day", "year_day"]) {
        const v = vectorsForLayerMode(layers, mode);
        for (const d of DIRS) {
          expect(v[d], `${mode} ${d} seed=${seed}`).toBe(
            statusForLayerMode(layers, d, mode),
          );
        }
      }
    }
  });

  it("組み合わせは全統合とは違う答えになる（旧実装なら落ちる）", () => {
    // 旧実装は組み合わせを全統合に落としていた。200 盤のどれかで
    // 必ず食い違う（8 方位 × 3 組み合わせが全部一致する確率は無視できる）
    let differs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const layers = randomLayers(seed);
      for (const mode of ["year_month", "month_day", "year_day"]) {
        const v = vectorsForLayerMode(layers, mode);
        const legacy = legacyVectors(layers, mode);
        if (DIRS.some((d) => v[d] !== legacy[d])) differs++;
      }
    }
    expect(differs).toBeGreaterThan(500);
  });

  it("盤に無い方位は組み合わせでも作らない", () => {
    const layers: DirectionLayers = {
      yearLayer: { N: "NOISE_GOU" },
      monthLayer: { E: "OPTIMAL" },
      dayLayer: {},
      finalVectors: {},
    };
    expect(vectorsForLayerMode(layers, "year_month")).toEqual({
      N: "NOISE_GOU",
      E: "OPTIMAL",
    });
    expect(vectorsForLayerMode(layers, "month_day")).toEqual({ E: "OPTIMAL" });
  });

  it("ALL_LAYER_MODES の全部を受け付ける", () => {
    const layers = randomLayers(7);
    for (const mode of ALL_LAYER_MODES) {
      expect(() => vectorsForLayerMode(layers, mode)).not.toThrow();
    }
  });
});

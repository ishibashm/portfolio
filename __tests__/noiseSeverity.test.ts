import { describe, expect, it } from "vitest";

import {
  FIVE_FATAL_NOISES,
  NOISE_PRIORITY,
  isFatalNoise,
  worstNoise,
} from "@/utils/noiseSeverity";

describe("noiseSeverity（凶の重さの唯一の定義）", () => {
  it("五大凶殺と土用殺を絶対凶にする", () => {
    expect(FIVE_FATAL_NOISES).toEqual([
      "NOISE_DOYOU", // 専用状態になっても従来の大凶の重さを保つ。
      "NOISE_GOU",
      "NOISE_ANKEN",
      "NOISE_HA",
      "NOISE_HONMEI",
      "NOISE_TEKI",
    ]);
  });

  it("優先順の先頭は必ず絶対凶。致命的な凶が二次凶のラベルに隠れない", () => {
    expect(NOISE_PRIORITY.slice(0, FIVE_FATAL_NOISES.length)).toEqual([
      ...FIVE_FATAL_NOISES,
    ]);
  });

  it("isFatalNoise は五大凶殺と土用殺を真にする", () => {
    for (const s of FIVE_FATAL_NOISES) expect(isFatalNoise(s)).toBe(true);
    expect(isFatalNoise("NOISE_VOID")).toBe(false);
    expect(isFatalNoise("SAFE")).toBe(false);
    expect(isFatalNoise(undefined)).toBe(false);
  });

  it("worstNoise は最も重い凶を返し、凶が無ければ null", () => {
    expect(worstNoise(["NOISE_GETSUMEI", "NOISE_GOU", "SAFE"])).toBe(
      "NOISE_GOU",
    );
    expect(worstNoise(["NOISE_VOID", "NOISE_HONMEI"])).toBe("NOISE_HONMEI");
    expect(worstNoise(["SAFE", "OPTIMAL"])).toBeNull();
  });

  it("優先表に無い凶も名前を保ったまま返す", () => {
    expect(worstNoise(["NOISE_MIKKA", "SAFE"])).toBe("NOISE_MIKKA");
    expect(worstNoise(["NOISE_MIKKA", "NOISE_GETSUTEKI"])).toBe(
      "NOISE_GETSUTEKI",
    );
  });
});

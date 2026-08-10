import { describe, expect, it } from "vitest";

import {
  FIVE_FATAL_NOISES,
  NOISE_PRIORITY,
  isFatalNoise,
  worstNoise,
} from "@/utils/noiseSeverity";

describe("noiseSeverity（凶の重さの唯一の定義）", () => {
  it("五大凶殺は 5 つ", () => {
    expect(FIVE_FATAL_NOISES).toEqual([
      "NOISE_GOU",
      "NOISE_ANKEN",
      "NOISE_HA",
      "NOISE_HONMEI",
      "NOISE_TEKI",
    ]);
  });

  it("優先順の先頭は必ず五大凶殺。致命的な凶が二次凶のラベルに隠れない", () => {
    expect(NOISE_PRIORITY.slice(0, 5)).toEqual([...FIVE_FATAL_NOISES]);
  });

  it("isFatalNoise は五大凶殺だけを真にする", () => {
    for (const s of FIVE_FATAL_NOISES) expect(isFatalNoise(s)).toBe(true);
    expect(isFatalNoise("NOISE_VOID")).toBe(false);
    expect(isFatalNoise("NOISE_NODE")).toBe(false);
    expect(isFatalNoise("SAFE")).toBe(false);
    expect(isFatalNoise(undefined)).toBe(false);
  });

  it("worstNoise は最も重い凶を返し、凶が無ければ null", () => {
    expect(worstNoise(["NOISE_NODE", "NOISE_GOU", "SAFE"])).toBe("NOISE_GOU");
    expect(worstNoise(["NOISE_VOID", "NOISE_HONMEI"])).toBe("NOISE_HONMEI");
    expect(worstNoise(["SAFE", "OPTIMAL"])).toBeNull();
  });

  it("優先表に無い凶も名前を保ったまま返す", () => {
    expect(worstNoise(["NOISE_MIKKA", "SAFE"])).toBe("NOISE_MIKKA");
    expect(worstNoise(["NOISE_MIKKA", "NOISE_NODE"])).toBe("NOISE_NODE");
  });
});

/**
 * /api/relocation/export が時間軸の畳み方を directionStatus
 * （statusForLayerMode）から引いていること。
 *
 * 以前は `layerMode === "year" ? yearLayer[dir] : …` の連鎖が 4 か所
 * （日ごとの 8 方位と、目的地の 3 系統）にあり、年+月／月+日／年+日 を
 * 全統合に落としていた。#1118〜#1120 で他の 5 か所を寄せた最後の 1 つ。
 * 畳み方そのものは __tests__/directionStatus.test.ts が固定している。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("relocation/export の時間軸", () => {
  it("statusForLayerMode を使い、layerMode の連鎖を持たない", () => {
    const src = readFileSync("src/app/api/relocation/export/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // 日ごとの 8 方位 + 目的地の 3 系統 = 4 回
    expect(src.match(/statusForLayerMode\(/g)?.length).toBe(4);
    expect(src).not.toMatch(/layerMode === "year"\)/);
  });
});

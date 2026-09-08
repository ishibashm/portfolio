/**
 * ホームの 3 部品が、時間軸の畳み方を directionStatus（vectorsForLayerMode）
 * から引いていること。
 *
 * 以前は `activeLayerMode === "year" ? yearLayer : …` の連鎖が 3 か所に
 * 写されていて、年+月／月+日／年+日 では TacticalMagneticMap の HUD が空、
 * SolarTimeClock の activeVectors（目的地の判定・スコアカード）と
 * DestinationMapPanel の札が全統合、という食い違いが同じ画面に出ていた。
 * 地図本体とヒートマップは statusForLayerMode で合成していた。
 *
 * 畳み方そのものは __tests__/vectorsForLayerMode.test.ts が固定している。
 * ここは写しが戻っていないことだけを見る（旧の源ではここで落ちる）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/components/TacticalMagneticMap.tsx",
  "src/components/SolarTimeClock.tsx",
  "src/components/home/DestinationMapPanel.tsx",
];

function codeOnly(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("ホームの時間軸の畳み方", () => {
  it.each(FILES)(
    "%s は vectorsForLayerMode を使い、activeLayerMode の連鎖を持たない",
    (file) => {
      const src = codeOnly(file);
      expect(src).toMatch(/vectorsForLayerMode\(/);
      expect(src).not.toMatch(/activeLayerMode === "year"\)/);
    },
  );

  it("DestinationMapPanel の見出しは組み合わせの名前を持つ", () => {
    const src = codeOnly("src/components/home/DestinationMapPanel.tsx");
    for (const label of ["年+月", "月+日", "年+日"]) {
      expect(src).toContain(label);
    }
  });
});

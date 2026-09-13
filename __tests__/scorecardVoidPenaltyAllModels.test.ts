import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 総合スコアの「③時間ゲート」は、3 つの計算モデルで同じ天中殺の
 * 減点を持つ。
 *
 * 直す前は、物理独立・伝統連動の 2 モデルだけが
 * `voidPenalty + doyou + 月相` で、古典モデルは `doyou + 月相` だった。
 * 天中殺（年・月・日の十二支が空亡に当たる日）は**人の生年月日で決まる**
 * もので、盤の組み方（古典か物理か）には依らない。同じ日の同じ方位で
 * 古典だけ減点が無く、「⚠️ 位相差警告」（モデル間で吉凶が分かれる）が
 * 天中殺の日に必ず出ていた。総点検（2026-09-12）で見つけた。
 *
 * 計算はコンポーネントの中（SolarTimeClock の useMemo）にあり、値の
 * テストは切り出せない。ここでは 3 本の式が同じ項を持つことを
 * ソースで固定する。旧挙動（古典だけ voidPenalty 無し）に戻すと落ちる。
 */
describe("総合スコアの時間ゲート", () => {
  const code = readFileSync("src/components/SolarTimeClock.tsx", "utf8");
  const gate = (name: string) => {
    const m = code.match(new RegExp(`const ${name} =\\s*([^;]*);`));
    expect(m, name).not.toBeNull();
    return m![1].replace(/\s+/g, " ");
  };

  it("古典・物理独立・伝統連動のどれも voidPenalty を持つ", () => {
    for (const name of [
      "timeGate_class",
      "timeGate_indep",
      "timeGate_coupled",
    ]) {
      expect(gate(name), name).toContain("voidPenalty");
      expect(gate(name), name).toContain("lunarPhaseScore");
    }
    expect(gate("timeGate_class")).toContain("doyou_class");
    expect(gate("timeGate_indep")).toContain("doyou_indep");
    expect(gate("timeGate_coupled")).toContain("doyou_coupled");
  });

  it("voidPenalty は 1 か所で決まり、3 本がそれを読む", () => {
    expect(code.match(/const voidPenalty = /g)?.length).toBe(1);
  });
});

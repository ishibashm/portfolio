import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 気圧の応答が壊れていても、画面を落とさないこと。
 *
 * `/api/surface-pressure` の応答を受ける側は `data.current === null` だけを
 * 見ていた。項目ごと無い応答（undefined）はこの条件を素通りするので、
 * `{ current: undefined }` を state に入れてしまう。読む側は
 * `pressure.current.toFixed(1)` を呼ぶため、その瞬間に React の木ごと
 * 落ちて**画面が真っ白**になる。
 *
 * 2026-08-14 に本番を真っ白にしたのと同じ形（#320 の yieldScore）。
 * あのときは「型に項目が残っていた」、ここは「null しか見ていない」。
 * どちらも **外から来る値は「無い」だけでなく「壊れている」ことがある**
 * という同じ穴で、tsc も単体テストも止められなかった。
 *
 * 煙試験（scripts/smoke_pages.mjs）では実際にホームが真っ白になり、
 * それでこの穴に気付いた。字面でも戻らないよう押さえておく。
 */

const SOURCE = join(process.cwd(), "src", "components", "SolarTimeClock.tsx");

describe("気圧の応答の見張り", () => {
  const src = readFileSync(SOURCE, "utf8").split("\r\n").join("\n");

  it("数として使えるかで判定している", () => {
    expect(src).toMatch(/Number\.isFinite\(current\)/);
    expect(src).toMatch(/Number\.isFinite\(drop\)/);
  });

  it("null との比較だけで通していない", () => {
    // 戻した場合に落ちる。=== null だけの門番は、undefined を通す。
    expect(src).not.toContain(
      "if (data.current === null || data.drop === null)",
    );
  });

  it("取れていないときは 0 を入れず null にする（変化なしと見せない）", () => {
    expect(src).toContain("setPressureData(null)");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 保存した候補の「現在の条件で再判定」（?candidate=）で /relocation/arbitrage
 * を開いたとき、札まで画面を送り、地図を候補へ寄せること。
 *
 * 札は左の列の 4 番目にあり、頁の頭に着地すると何も起きていないように
 * 見えた（狭い画面では 1 画面以上下）。候補は inputSource が "pin" で
 * fromMap として届くので、そのままでは地図も寄らなかった。
 */

const SRC = readFileSync(
  join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
  "utf8",
);

describe("保存した候補を開いたとき", () => {
  it("札（arb-spot-section）まで画面を送る", () => {
    const m = SRC.match(
      /if \(new URLSearchParams\(window\.location\.search\)\.has\("candidate"\)\) \{[\s\S]*?\n      return;\n    \}/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toContain('getElementById("arb-spot-section")');
    expect(m![0]).toContain("openedCandidate.current = true");
  });

  it("地図を候補へ 1 度だけ寄せる（fromMap でも）", () => {
    const m = SRC.match(
      /const onSpotTargetChange = useCallback\([\s\S]*?\n  \);/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).toContain("(!fromMap || openedCandidate.current)");
    expect(m![0]).toContain("openedCandidate.current = false");
  });
});

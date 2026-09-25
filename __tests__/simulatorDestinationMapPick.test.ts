import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * シミュレータの各ステップの目的地を、地図からも選べること
 * （利用者の依頼、2026-09-25「このページでも目的地を選ぶところは地図で
 * 選べるようにしてほしい」）。
 *
 * 目的地の欄は PlaceInput（#1508）で、PlaceInput は `allowMapPick` を
 * 立てた画面でだけ「地図から選ぶ」を出す。シミュレータは立てていなかった。
 * 右の地図でも動かせるが、画面が狭いと欄から遠い下に回る。
 *
 * 地図で押した点には地名が無いので、名前は座標にしておき、最寄りの
 * 市区町村を引いて「〇〇 付近」にする。引き終わる前に別の点へ動いて
 * いたら書かない。
 */

const src = readFileSync(
  join(process.cwd(), "src/app/relocation/simulator/page.tsx"),
  "utf8",
);

describe("シミュレータの目的地", () => {
  const block = src.match(/<PlaceInput\s+label="目的地"[\s\S]*?\n\s*\/>/)?.[0];

  it("目的地の PlaceInput は地図から選べる", () => {
    expect(block).toBeDefined();
    expect(block).toMatch(/\ballowMapPick\b/);
    expect(block).toContain("地図から選ぶ");
  });

  it("名前の無い点（地図で押した点）は、最寄りの市区町村を引いて名付ける", () => {
    expect(block).toContain("if (!name) nameStepFromPoint(idx, lat, lon)");
  });

  it("引き終わる前に点が動いていたら、古い名前を書かない", () => {
    const fn = src.match(/const nameStepFromPoint[\s\S]*?\n {2}};/)?.[0];
    expect(fn).toBeDefined();
    expect(fn).toContain("s.toLat !== lat || s.toLon !== lon");
    expect(fn).toContain("付近");
  });
});

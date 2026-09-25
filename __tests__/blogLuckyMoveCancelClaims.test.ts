import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BASE_STAY_DAYS, baseMovesAfter } from "@/lib/stayBase";

/**
 * 記事「75日後の吉方位への移動で、最初の凶方位は相殺される？」
 * （does-a-lucky-move-cancel-an-unlucky-move）の数字の主張を、計算の
 * 規則と突き合わせる（毎日の監査の精度確認 (c)、2026-09-26）。
 *
 * 記事が言っていること
 *   - 75 日という条件が変えるのは「次の移動をどこから測るか」
 *   - 滞在が 75 日未満なら、次の移動も以前の起点から測る
 *   - 長期移住として 75 日以上滞在したら、その場所を次の起点にする
 *
 * 規則はシミュレータの頁に直に書かれていたので lib/stayBase に移した。
 * 記事の日数を変えずに規則だけ変える（逆も）と、ここで落ちる。
 */

const md = readFileSync(
  join(
    process.cwd(),
    "content/blog/does-a-lucky-move-cancel-an-unlucky-move.md",
  ),
  "utf8",
);

describe("記事の日数と、起点が動く規則", () => {
  it("記事が言う日数は規則の日数と同じ", () => {
    expect(md).toContain(
      `滞在が${BASE_STAY_DAYS}日未満なら、次の移動も以前の起点から測る`,
    );
    expect(md).toContain(
      `長期移住として${BASE_STAY_DAYS}日以上滞在したら、その場所を次の起点にする`,
    );
  });

  it("75 日以上の長期移住で起点が動き、74 日では動かない", () => {
    expect(baseMovesAfter("MIGRATION", 75)).toBe(true);
    expect(baseMovesAfter("MIGRATION", 200)).toBe(true);
    expect(baseMovesAfter("MIGRATION", 74)).toBe(false);
    expect(baseMovesAfter("MIGRATION", 0)).toBe(false);
  });

  it("「長期移住として」— 旅行は何日いても起点を動かさない", () => {
    expect(baseMovesAfter("TRAVEL", 75)).toBe(false);
    expect(baseMovesAfter("TRAVEL", 365)).toBe(false);
  });

  it("シミュレータは同じ規則を使っている（写しを持たない）", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/relocation/simulator/page.tsx"),
      "utf8",
    );
    expect(page).toContain("baseMovesAfter(step.purpose, stayDuration)");
    expect(page).not.toMatch(/purpose === "MIGRATION" && stayDuration >= 75/);
  });
});

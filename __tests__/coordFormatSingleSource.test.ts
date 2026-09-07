import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { formatCoords } from "@/lib/profileCompletion";

/**
 * 座標の見せ方（`北緯 35.681 / 東経 139.767`）を **1 か所に保つ**ための
 * 見張り。
 *
 * 同じ字面が 3 か所に写されていた（`PlaceInput` に 1・
 * `PersonalProfileConfig` に 2）。どれも `toFixed(3)` を手で書いていて、
 * **桁を変えたい日に 3 か所そろって直せる保証が無い。**#1066 で
 * `formatCoords` に寄せたので、写しが増えていないことをここで見る。
 *
 * 方位の集約（`directionFromBearing`）で「名前ではなく実装のパターンで
 * 引く」と決めたのと同じやり方。CLAUDE.md 3 節。
 */

const SRC = path.join(process.cwd(), "src");
/** 寄せ先。ここにだけ字面があってよい。 */
const HOME = path.join(SRC, "lib", "profileCompletion.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("座標の書式", () => {
  it("「北緯」を書いているのは寄せ先だけ", () => {
    const guilty = walk(SRC)
      .filter((f) => f !== HOME)
      .filter((f) => fs.readFileSync(f, "utf8").includes("北緯"))
      .map((f) => path.relative(process.cwd(), f));

    expect(guilty).toEqual([]);
  });

  it("見張りが空回りしていない（寄せ先には字面がある）", () => {
    expect(fs.readFileSync(HOME, "utf8")).toContain("北緯");
    expect(formatCoords(35.6812, 139.7671)).toBe("北緯 35.681 / 東経 139.767");
  });
});

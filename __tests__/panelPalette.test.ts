import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCENT_HUE,
  NEUTRAL_HUE,
  RESERVED_JUDGEMENT_HUES,
  SEQUENTIAL_RAMP,
  WARN_HUE,
  rampColor,
  relativeLuminance,
} from "@/lib/panelPalette";

/**
 * 色の決め事が守られているかを検査する。
 *
 * ## 何を守るのか
 *
 * ホームの各タブが 6〜9 色の色相を独立に使っていた。1 画面ずつ塗り直しても、
 * **足すときに気付けなければまた散る。**
 *
 * この検査は 2 段構えにしてある。
 *
 *   1. 決め事そのものの検査   ランプが単調か、役割どうしが重なっていないか
 *   2. **色相の数の歯止め**   いま使っている数を上限として固定する
 *
 * 2 が要点。**「直っている」ことではなく「増えていない」ことを検査する。**
 * 実際にはまだ散らかっているので、直っていると主張する検査は嘘になる。
 * 上限を今の実測値に置いて、揃える作業が進むたびに数を下げていく。
 */

const HUE_PATTERN =
  /(?:bg|text|border|from|to|via|ring|fill|stroke|shadow)-(rose|red|emerald|green|amber|yellow|indigo|purple|sky|blue|cyan|teal|orange|violet|fuchsia|pink|lime)-\d{2,3}/g;

function huesIn(relativePath: string): Set<string> {
  const src = readFileSync(join(process.cwd(), relativePath), "utf8");
  const found = new Set<string>();
  for (const m of src.matchAll(HUE_PATTERN)) found.add(m[1]);
  return found;
}

/**
 * 現状の実測値。**下げることはあっても上げない。**
 *
 * 数え方は上の HUE_PATTERN。bg / text / border だけでなく
 * from / via / ring / fill / stroke / shadow も数える。手で bg / text /
 * border だけ数えたときは ScorecardPanel が 7 に見えたが、実際は
 * **9 だった**（teal と violet を取りこぼしていた）。手で数えない。
 *
 * 上げたくなったときは、色を足す前に「その色は 4 つの役割のどれか」を
 * 考えること。たいていは既存の役割で足りる。
 */
const HUE_BUDGET: Record<string, number> = {
  "src/components/home/ConsultPanel.tsx": 8,
  "src/components/home/ScorecardPanel.tsx": 9,
  "src/components/home/DestinationMapPanel.tsx": 9,
  "src/components/home/HomePortal.tsx": 6,
};

describe("色の決め事", () => {
  it("役割どうしの色相が重なっていない", () => {
    // 操作・注意・構造が判定の色を借りると、「色が付いている＝意味がある」
    // が成り立たなくなる。
    const reserved = new Set<string>(RESERVED_JUDGEMENT_HUES);
    expect(reserved.has(ACCENT_HUE)).toBe(false);
    expect(reserved.has(WARN_HUE)).toBe(false);
    expect(reserved.has(NEUTRAL_HUE)).toBe(false);
    expect(new Set([ACCENT_HUE, WARN_HUE, NEUTRAL_HUE]).size).toBe(3);
  });

  it("連続量のランプは単調に暗くなる", () => {
    // 目で見て「だんだん濃い」と判断しない。段を足したり差し替えたりした
    // ときに、順序が崩れたことへ気付けるようにする。
    const lums = SEQUENTIAL_RAMP.map(relativeLuminance);
    for (let i = 1; i < lums.length; i += 1) {
      expect(lums[i], `${SEQUENTIAL_RAMP[i]} が前の段より明るい`).toBeLessThan(
        lums[i - 1],
      );
    }
  });

  it("ランプは端を丸め、値が無いときは薄い側へ倒す", () => {
    expect(rampColor(-1)).toBe(SEQUENTIAL_RAMP[0]);
    expect(rampColor(0)).toBe(SEQUENTIAL_RAMP[0]);
    expect(rampColor(1)).toBe(SEQUENTIAL_RAMP[SEQUENTIAL_RAMP.length - 1]);
    expect(rampColor(2)).toBe(SEQUENTIAL_RAMP[SEQUENTIAL_RAMP.length - 1]);
    // NaN を濃い側へ倒すと「値が無い」が「値が大きい」に見える。
    expect(rampColor(NaN)).toBe(SEQUENTIAL_RAMP[0]);
  });

  it("色は #rrggbb でしか受け取らない", () => {
    expect(() => relativeLuminance("blue")).toThrow();
    expect(() => relativeLuminance("#fff")).toThrow();
  });
});

describe("画面ごとの色相の数", () => {
  it("検査の対象を読めている（空回りしていない）", () => {
    // 対象が読めないと、上限をいくつにしても素通りする。
    for (const path of Object.keys(HUE_BUDGET)) {
      expect(huesIn(path).size, path).toBeGreaterThan(0);
    }
  });

  for (const [path, budget] of Object.entries(HUE_BUDGET)) {
    it(`${path} の色相は ${budget} 色以下`, () => {
      const hues = [...huesIn(path)].sort();
      expect(
        hues.length,
        `${path} の色相: ${hues.join(", ")}\n` +
          "色を足す前に、その色が「判定 / 構造 / 操作 / 注意」のどれかを考えること。" +
          "たいていは既存の役割で足りる。揃える作業で減ったら HUE_BUDGET も下げる。",
      ).toBeLessThanOrEqual(budget);
    });
  }
});

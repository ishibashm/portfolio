import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECTION_FILTER_MODES,
  DIRECTION_FILTER_MODE_LABELS,
  directionFilterModeLabel,
} from "@/utils/directionFilterMode";

/**
 * 目的地タブの「観点」は、**既定では 1 行**で、7 つのボタンは「変える」で開く。
 *
 * 地図の帯（#1338）と同じ形。以前は 7 つのボタンが常に並んでいて、
 * 400px では 3 段に折れていた。押し口を減らすが、**見方は 7 つとも
 * そのまま選べる**（機能は削らない）。
 *
 * 見るもの:
 *   1. 7 つの `setDirectionFilterMode("<見方>")` が `filterMenuOpen &&` の
 *      中にある（常時表示に戻ったら落ちる）
 *   2. 1 行の名前は `directionFilterModeLabel(` から引く（表を 3 つ目に
 *      増やさない）
 *   3. 名前の表は 7 つとも日本語だけ（ローマ字・英語の併記を持ち込まない）
 *   4. 開く口に aria-expanded がある
 */
const SOURCE = join(
  process.cwd(),
  "src/components/home/DestinationMapPanel.tsx",
);
const src = readFileSync(SOURCE, "utf8");

describe("目的地タブの観点の畳み", () => {
  const openStart = src.indexOf("{filterMenuOpen && (");
  const openEnd = src.indexOf("            )}\n          </div>", openStart);

  it("読めている（この検査自体が空回りしていない）", () => {
    expect(openStart).toBeGreaterThan(0);
    expect(openEnd).toBeGreaterThan(openStart);
  });

  it("7 つの見方のボタンは「変える」を開いたときだけ出る", () => {
    const inside = src.slice(openStart, openEnd);
    for (const mode of DIRECTION_FILTER_MODES) {
      const call = `setDirectionFilterMode("${mode}")`;
      expect(src, `${mode} のボタンが無い`).toContain(call);
      expect(inside, `${mode} のボタンが畳みの外にある`).toContain(call);
    }
  });

  it("既定の 1 行は共有の名前（directionFilterModeLabel）を使う", () => {
    expect(src.slice(0, openStart)).toContain("directionFilterModeLabel(");
  });

  it("名前の表は 7 つとも日本語だけ", () => {
    for (const mode of DIRECTION_FILTER_MODES) {
      const label = directionFilterModeLabel(mode);
      expect(label.length).toBeGreaterThan(0);
      expect(label, `${mode}: ${label}`).not.toMatch(/[A-Za-z()]/);
    }
    expect(Object.keys(DIRECTION_FILTER_MODE_LABELS).sort()).toEqual(
      [...DIRECTION_FILTER_MODES].sort(),
    );
  });

  it("開く口は aria-expanded を持つ", () => {
    expect(src).toMatch(/aria-expanded=\{filterMenuOpen\}/);
  });
});

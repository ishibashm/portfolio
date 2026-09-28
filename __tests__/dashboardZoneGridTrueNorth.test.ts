import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 目的地と地図の「ゾーン分類」の升目（DestinationMapPanel）。
 *
 * 1. 🎯 は判定と同じ真北の方位に置く。以前は磁北（magneticDirection）で
 *    置いていて、方位の境目の近くでは判定（SolarTimeClock は
 *    trueDirection）と別の升目に 🎯 が付いた（2026-09-28 の監査で発見）。
 * 2. 札は日本語の段階名。以前は SAFE / GO / OK / WARN / ALERT の英語で、
 *    値の無い方位まで SAFE と出ていた。
 *
 * 升目は大きな部品の中の 1 ブロックで、描くには地図と暦エンジンが要る。
 * 字面で固定する（dashboardControlsLabeled などと同じ作法）。
 */

const SRC = readFileSync(
  join(process.cwd(), "src/components/home/DestinationMapPanel.tsx"),
  "utf8",
);
const grid = SRC.slice(
  SRC.indexOf("const allDirs"),
  SRC.indexOf("const allDirs") + 6000,
);

describe("ゾーン分類の升目", () => {
  it("升目の区間を拾えている（空回りしていない）", () => {
    expect(grid).toContain("const isTarget");
    expect(grid).toContain("🎯");
  });

  it("🎯 は真北の方位で置く（判定と同じ）", () => {
    expect(grid).toMatch(/targetDirInfo\.trueDirection === dir/);
    expect(grid).not.toMatch(/magneticDirection === dir/);
  });

  it("札は日本語の段階名で、英語の札を残していない", () => {
    expect(grid).toContain("directionLabelName(val");
    expect(grid).not.toMatch(/statusLabel = "(SAFE|GO|OK|WARN|ALERT)"/);
  });
});

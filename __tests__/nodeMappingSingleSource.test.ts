import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  directionFromBearing,
  nodeMappingForBoard,
  type NodeMapping,
} from "@/utils/directionGeo";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(full)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [full]
        : [];
  });
}

// 改行・引用符の違いと、TacticalMagneticMap の逆向きも拾う。
const COPY =
  /\?\s*["']traditional["']\s*:\s*["']physical["']|\?\s*["']physical["']\s*:\s*["']traditional["']/g;

describe("盤と八方位の対応", () => {
  it("src の対応の写しは共通関数の 1 件だけ", () => {
    const matches = walk(path.join(process.cwd(), "src")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(COPY)].map(() =>
        path.relative(process.cwd(), file),
      ),
    );
    expect(matches).toEqual(["src/utils/directionGeo.ts"]);
  });

  it.each([true, false])("古典盤=%s: 旧実装と全周で同じ答え", (classical) => {
    // 集約前の正向き・逆向きの式を残す。
    const legacy: NodeMapping = classical ? "traditional" : "physical";
    const isPhysical = !classical;
    const legacyReverse: NodeMapping = isPhysical ? "physical" : "traditional";
    expect(nodeMappingForBoard(classical)).toBe(legacy);
    expect(nodeMappingForBoard(!isPhysical)).toBe(legacyReverse);
    for (let bearing = -720; bearing <= 720; bearing += 0.5) {
      expect(
        directionFromBearing(bearing, nodeMappingForBoard(classical)),
      ).toBe(directionFromBearing(bearing, legacy));
    }
  });
});

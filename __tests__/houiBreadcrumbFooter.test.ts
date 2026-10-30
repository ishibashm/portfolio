import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOUI_BREADCRUMB_LABEL,
  currentYearInJapan,
} from "@/lib/kigakuContent";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("方位のパンくずとフッター", () => {
  it("/houi のパンくず名を統一する", () => {
    expect(HOUI_BREADCRUMB_LABEL).toBe("引越しの方位");
    for (const file of sourceFiles("src/app/houi")) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /\{[^{}]*\bname:\s*["'](?:吉方位|方位の早見表)["'][^{}]*\bpath:\s*["']\/houi["'][^{}]*\}/,
      );
    }
  });

  it("トップのフッターは日本時間の現在年を使う", () => {
    const source = readFileSync("src/app/page.tsx", "utf8");
    expect(source).not.toContain("© 2026");
    expect(source).toContain("© {currentYearInJapan()}");
  });

  it("日本時間で年を繰り上げる", () => {
    expect(currentYearInJapan(new Date("2026-12-31T15:30:00Z"))).toBe(2027);
  });

  it("共有カード ogp.png は 1200x630 で 500KB 未満", () => {
    const png = readFileSync("public/ogp.png");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeLessThan(500 * 1024);
  });
});

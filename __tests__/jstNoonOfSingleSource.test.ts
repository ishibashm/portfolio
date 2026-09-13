import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forecastAnchorMs, jstNoonOf } from "@/utils/boardInstant";

/**
 * 「日本時間の正午」を返す関数は `utils/boardInstant` の `jstNoonOf`
 * ただ 1 つ。同じ関数が ephemerisEngine・auspiciousDays・kigakuContent に
 * 1 つずつ写されていた（2026-09-13 に寄せた）。CLAUDE.md 3 節「同じ
 * ことを 2 か所に書かない」。写しが戻ると、片方だけ直したときに盤の
 * 代表点がずれる。
 */
describe("jstNoonOf は 1 か所", () => {
  it("boardInstant 以外に function jstNoonOf を書かない", () => {
    for (const file of [
      "src/utils/ephemerisEngine.ts",
      "src/utils/auspiciousDays.ts",
      "src/lib/kigakuContent.ts",
    ]) {
      const body = readFileSync(file, "utf8").replace(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(body, file).not.toMatch(/function jstNoonOf\b/);
      expect(body, file).toMatch(/jstNoonOf/);
    }
  });

  it("forecastAnchorMs と同じ瞬間（JST 正午 = 03:00 UTC）", () => {
    for (const iso of [
      "2026-01-01T00:00:00+09:00",
      "2026-06-15T23:59:59+09:00",
      "2026-09-13T09:30:00Z",
    ]) {
      const d = new Date(iso);
      expect(jstNoonOf(d).getTime()).toBe(forecastAnchorMs(d));
      expect(jstNoonOf(d).getUTCHours()).toBe(3);
    }
  });
});

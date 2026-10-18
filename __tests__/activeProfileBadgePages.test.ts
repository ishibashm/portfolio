import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("各道具で保存済みプロフィールを確認できる", () => {
  it.each([
    ["calendar", "吉日と暦", "AuspiciousDayFinder"],
    ["houi/3d", "街の方位", "CityPanel"],
    ["houi/fengshui", "本命卦", "FengShuiLookup"],
  ])("/%s の道具より前に共通バッジを表示する", (route, purpose, tool) => {
    const source = readFileSync(
      join(process.cwd(), "src/app", route, "page.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { ActiveProfileBadge } from "@/components/profile/ActiveProfileBadge";',
    );
    const badge = `<ActiveProfileBadge purpose="${purpose}"`;
    expect(source).toContain(badge);
    expect(source.indexOf(badge)).toBeLessThan(source.indexOf(`<${tool}`));
  });
});

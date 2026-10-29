import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";

// 閉じた PR #1754 の「暦ライブラリ無し」計算は master の tenchusatsuCore に既にある。
// ここではその日柱が lunar-javascript（正午時点の日柱）と一致することを広い範囲で確かめる。
describe("tenchusatsuForCivilDate は lunar-javascript の日柱と一致する", () => {
  it("1900〜2100 年の 7 日おき + 月末・閏日", () => {
    const dates: [number, number, number][] = [];
    for (
      let t = Date.UTC(1900, 0, 1);
      t <= Date.UTC(2100, 11, 31);
      t += 7 * 86_400_000
    ) {
      const d = new Date(t);
      dates.push([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
    }
    dates.push(
      [2000, 2, 29],
      [2024, 2, 29],
      [1999, 12, 31],
      [2000, 1, 1],
      [1970, 1, 1],
    );
    for (const [y, m, d] of dates) {
      const lunar = Solar.fromYmdHms(y, m, d, 12, 0, 0).getLunar();
      expect(tenchusatsuForCivilDate(y, m, d).ganZhi, `${y}-${m}-${d}`).toBe(
        lunar.getDayInGanZhi(),
      );
    }
  });
});

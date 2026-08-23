import { describe, it, expect } from "vitest";
import {
  AREAS,
  AREA_GENERATED_AT,
  areaAsOf,
  type Area,
} from "@/lib/areaContent";

/**
 * エリアページの「集計日」。
 *
 * 掲載が閾値に満たない市区町村は前回の数字を引き継いでいる（#533）。
 * ファイル全体の `generatedAt` を出すと、**更新していない相場に今日の
 * 日付が付く。**行ごとの `asOf` を見ること。
 */
describe("areaAsOf", () => {
  const sample: Area = { ...AREAS[0] };

  it("行が asOf を持つならそれを返す", () => {
    expect(areaAsOf({ ...sample, asOf: "2026-08-12" })).toBe("2026-08-12");
  });

  it("引き継ぎ分にファイルの日付を付けない", () => {
    // これが崩れると、1 週間前の相場が「今日集計」として出る。
    const carried = { ...sample, asOf: "2026-08-12" };
    expect(areaAsOf(carried)).not.toBe(AREA_GENERATED_AT.slice(0, 10));
  });

  it("asOf を持たない行はファイルの日付に落とす（併合を入れる前の JSON）", () => {
    const legacy = { ...sample };
    delete legacy.asOf;
    expect(areaAsOf(legacy)).toBe(AREA_GENERATED_AT.slice(0, 10));
  });

  it("asOf が空文字でもファイルの日付に落とす", () => {
    // 空文字は「不明」であって「その日付」ではない。素通りさせると
    // new Date("") が Invalid Date になり、画面に出る。
    expect(areaAsOf({ ...sample, asOf: "" })).toBe(
      AREA_GENERATED_AT.slice(0, 10),
    );
  });

  it("返すのは YYYY-MM-DD。Date に食わせられる形", () => {
    const value = areaAsOf(sample);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(value).getTime())).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCountFilters,
  layoutPatterns,
  positiveNumber,
  UNSUPPORTED_COUNT_FILTERS,
} from "../src/lib/rentalCountFilters";

/**
 * 数え上げの条件。
 *
 * 県別の件数と表示範囲の件数が**同じ規則で数えている**ことを担保する。
 * 片方だけ規則が変わると、同じ絞り込みなのに県の合計と表示範囲の数が
 * 食い違い、どちらが正しいのか画面からは分からなくなる。
 */

const params = (q: string) => new URLSearchParams(q);

describe("positiveNumber", () => {
  it("正の数だけ通す", () => {
    expect(positiveNumber("12.5")).toBe(12.5);
  });

  it("0・負・非数・空は指定なしに倒す", () => {
    for (const raw of ["0", "-1", "abc", "", null]) {
      expect(positiveNumber(raw)).toBeNull();
    }
  });
});

describe("layoutPatterns", () => {
  it("部分一致のパターンにする（前方一致にしない）", () => {
    // 前方一致だと "ワンルーム2LDK" のような表記を落とし、
    // 同じ条件なのに件数と一覧が食い違う。
    expect(layoutPatterns("2LDK")).toEqual(["%2LDK%"]);
  });

  it("小文字と空白を正規化し、複数を分ける", () => {
    expect(layoutPatterns(" 1k , 2ldk ")).toEqual(["%1K%", "%2LDK%"]);
  });

  it("空・長すぎる値は落とす", () => {
    expect(layoutPatterns("")).toEqual([]);
    expect(layoutPatterns(",,")).toEqual([]);
    expect(layoutPatterns("123456789")).toEqual([]);
  });

  it("数が多すぎても 20 件で打ち切る", () => {
    const many = Array.from({ length: 40 }, (_, i) => `${i}K`).join(",");
    expect(layoutPatterns(many)).toHaveLength(20);
  });
});

describe("buildCountFilters", () => {
  it("絞り込みが無ければ掲載中の条件だけ", () => {
    const { conditions, appliedFilters } = buildCountFilters(params(""));
    expect(conditions).toHaveLength(1);
    expect(appliedFilters).toEqual([]);
  });

  it("指定した絞り込みだけが条件と名前に増える", () => {
    const { conditions, appliedFilters } = buildCountFilters(
      params("maxRentMan=8&minSizeSqm=25"),
    );
    // 掲載中 + 家賃 + 広さ
    expect(conditions).toHaveLength(3);
    expect(appliedFilters).toEqual(["maxRentMan", "minSizeSqm"]);
  });

  it("家賃は万円を円に直し、管理費を足した額で比べる", () => {
    const { conditions } = buildCountFilters(params("maxRentMan=8.5"));
    const sql = conditions[1];
    expect(sql.sql).toContain("management_fee");
    // 8.5 万円 → 85,000 円
    expect(sql.values).toEqual([85000]);
  });

  it("壊れた値は指定なしとして扱い、条件を増やさない", () => {
    const { conditions, appliedFilters } = buildCountFilters(
      params("maxRentMan=0&maxBuildingAge=-3&maxStationMin=abc"),
    );
    expect(conditions).toHaveLength(1);
    expect(appliedFilters).toEqual([]);
  });

  it("間取りは 1 つの OR にまとめる（条件を 1 つだけ増やす）", () => {
    const { conditions, appliedFilters } = buildCountFilters(
      params("layouts=1K,2LDK,3LDK"),
    );
    expect(conditions).toHaveLength(2);
    expect(appliedFilters).toEqual(["layouts"]);
  });

  it("SQL で表せない絞り込みの一覧に方位と吉凶が入っている", () => {
    // ここが抜けると、画面が「方位は含みません」と断れなくなる。
    expect(UNSUPPORTED_COUNT_FILTERS).toContain("direction");
    expect(UNSUPPORTED_COUNT_FILTERS).toContain("astrologyStatus");
  });
});

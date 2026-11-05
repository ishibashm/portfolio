import { describe, expect, it } from "vitest";
import {
  contentYears,
  currentYearInJapan,
  monthContentYears,
} from "@/lib/kigakuContent";
import {
  canonicalHouiRedirect,
  houiContentYears,
  houiMonthContentYears,
  houiYearInJapan,
  isCanonicalHouiSegment,
} from "@/lib/houiCanonicalPath";

describe("方位頁の正規パス", () => {
  it("年の幅は kigakuContent と一致する", () => {
    expect(houiYearInJapan()).toBe(currentYearInJapan());
    expect(houiContentYears()).toEqual(contentYears());
    expect(houiMonthContentYears()).toEqual(monthContentYears());
  });

  it("先頭ゼロと末尾のゴミは正規の断片ではない", () => {
    expect(isCanonicalHouiSegment("2026")).toBe(true);
    expect(isCanonicalHouiSegment("1")).toBe(true);
    expect(isCanonicalHouiSegment("12")).toBe(true);
    expect(isCanonicalHouiSegment("01")).toBe(false);
    expect(isCanonicalHouiSegment("1abc")).toBe(false);
    expect(isCanonicalHouiSegment("02026")).toBe(false);
  });

  it("緩い parseInt で実在する頁になるパスだけ正規形へ送る", () => {
    const year = houiContentYears()[0];
    const monthYear = houiMonthContentYears()[0];
    expect(canonicalHouiRedirect(`/houi/${year}/01`)).toBe(`/houi/${year}/1`);
    expect(canonicalHouiRedirect(`/houi/${year}/1abc`)).toBe(`/houi/${year}/1`);
    expect(canonicalHouiRedirect(`/houi/0${year}/1`)).toBe(`/houi/${year}/1`);
    expect(canonicalHouiRedirect(`/houi/${monthYear}/1/01`)).toBe(
      `/houi/${monthYear}/1/1`,
    );
    expect(canonicalHouiRedirect(`/houi/${year}/1`)).toBeNull();
    expect(canonicalHouiRedirect(`/houi/${monthYear}/1/1`)).toBeNull();
    expect(canonicalHouiRedirect("/houi/area/13101")).toBeNull();
    expect(canonicalHouiRedirect("/houi/pref/13")).toBeNull();
  });

  it("月盤が無い年の緩い月パスは送らない", () => {
    const yearOnly = houiContentYears().find(
      (year) => !houiMonthContentYears().includes(year),
    );
    expect(yearOnly).toBeTypeOf("number");
    expect(canonicalHouiRedirect(`/houi/${yearOnly}/1/01`)).toBeNull();
    expect(canonicalHouiRedirect(`/houi/${yearOnly}/99`)).toBeNull();
  });
});

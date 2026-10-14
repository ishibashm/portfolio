// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  kanshiAt,
  kanshiForBirth,
  parseKanshiBirth,
  solarTermsForYear,
} from "@/lib/kanshi";
import { getPersonalVoidZodiac } from "@/utils/ephemerisEngine";

// 国立天文台 暦要項 中央標準時（JST）。実行時にネットワークへ依存しない。
// https://eco.mtk.nao.ac.jp/koyomi/yoko/2026/rekiyou262.html
const NAOJ_2026 = [
  "01-05T17:23",
  "01-20T10:45",
  "02-04T05:02",
  "02-19T00:52",
  "03-05T22:59",
  "03-20T23:46",
  "04-05T03:40",
  "04-20T10:39",
  "05-05T20:49",
  "05-21T09:37",
  "06-06T00:48",
  "06-21T17:25",
  "07-07T10:57",
  "07-23T04:13",
  "08-07T20:43",
  "08-23T11:19",
  "09-07T23:41",
  "09-23T09:05",
  "10-08T15:29",
  "10-23T18:38",
  "11-07T18:52",
  "11-22T16:23",
  "12-07T11:53",
  "12-22T05:50",
];

describe("六十干支と節入り", () => {
  it("2026年の24節気は暦要項の固定値から3分以内（既存計算の精度）", () => {
    const terms = solarTermsForYear(2026);
    expect(terms).toHaveLength(24);
    terms.forEach((term, index) => {
      expect(term.atJst).toMatch(/\+09:00$/);
      expect(
        Math.abs(
          Date.parse(term.atJst) -
            Date.parse(`2026-${NAOJ_2026[index]}:00+09:00`),
        ),
      ).toBeLessThan(180_000);
    });
  });

  it("2025年立春は2月3日23:10、立冬は11月7日13:04（暦要項）", () => {
    // https://eco.mtk.nao.ac.jp/koyomi/yoko/2025/rekiyou252.html
    for (const [name, at] of [
      ["立春", "2025-02-03T23:10:00+09:00"],
      ["立冬", "2025-11-07T13:04:00+09:00"],
    ]) {
      expect(
        Math.abs(
          Date.parse(
            solarTermsForYear(2025).find((t) => t.name === name)!.atJst,
          ) - Date.parse(at),
        ),
      ).toBeLessThan(180_000);
    }
  });

  it("立春で年と月が同時に切り替わり、中気では月が変わらない", () => {
    for (const term of solarTermsForYear(2026)) {
      const at = Date.parse(term.atJst);
      const before = kanshiAt(new Date(at - 2000));
      const after = kanshiAt(new Date(at));
      expect(before.month !== after.month).toBe(term.changesMonth);
      expect(before.year !== after.year).toBe(term.name === "立春");
      if (term.name === "立春") {
        expect([before.year, before.month]).toEqual(["乙巳", "己丑"]);
        expect([after.year, after.month]).toEqual(["丙午", "庚寅"]);
      }
    }
  });

  it("甲子日から60日で一巡し、空亡は既存出力と一致する", () => {
    const origin = Date.parse("2000-01-07T00:00:00+09:00");
    expect(kanshiAt(new Date(origin)).day).toBe("甲子");
    const days = Array.from({ length: 60 }, (_, i) =>
      kanshiAt(new Date(origin + i * 86_400_000)),
    );
    expect(new Set(days.map((p) => p.day)).size).toBe(60);
    expect(new Set(days.map((p) => p.voidBranches.join(""))).size).toBe(6);
    expect(kanshiAt(new Date(origin + 60 * 86_400_000)).day).toBe("甲子");
    days.forEach((p, i) =>
      expect(p.voidBranches).toEqual(
        getPersonalVoidZodiac(new Date(origin + i * 86_400_000)),
      ),
    );
    expect(days[0].voidBranches).toEqual(["戌", "亥"]);
  });

  it("日柱はJST0時で変わり、23時・UTC0時では変わらない", () => {
    expect(kanshiForBirth("2000-01-07T23:59:59").kanshi.day).toBe("甲子");
    expect(kanshiForBirth("2000-01-08T00:00").kanshi.day).toBe("乙丑");
    expect(kanshiForBirth("2000-01-06T15:00Z").kanshi.day).toBe("甲子");
  });

  it("時刻不明の節入り当日は前後両方の柱と併臨候補を返す", () => {
    const result = kanshiForBirth("2026-02-04");
    expect(result.timeUnknown).toBe(true);
    expect(result.boundaryAlternatives?.before.year).toBe("乙巳");
    expect(result.boundaryAlternatives?.after.year).toBe("丙午");
    expect(result.kanshiHeirin.year).toEqual([2026, 2086, 2146]);
    expect(result.kanshiHeirinAlternatives?.before.year).toEqual([2085, 2145]);
    expect(kanshiForBirth("2026-02-04T12:00").boundaryAlternatives).toBeNull();
  });

  it("節年前半の1月も前年で、併臨を出生暦年から120年間に限定する", () => {
    const result = kanshiForBirth("2000-01-07");
    expect(result.kanshi.year).toBe("己卯");
    expect(result.kanshiHeirin.year).toEqual([2059, 2119]);
    expect(result.kanshiHeirin.day).toEqual([2044, 2104]);
  });

  it.each([
    "2026-02-30",
    "2025-02-29",
    "1899-12-31",
    "2101-01-01",
    "oops",
    "2026-2-4",
    "2026-02-04T24:00",
    "2026-02-04T12:99",
  ])("不正入力を拒否する: %s", (value) => {
    expect(parseKanshiBirth(value)).toBeNull();
  });
  it("閏日と対応範囲の両端を受け付ける", () => {
    for (const value of ["2000-02-29", "1900-01-01", "2100-12-31"])
      expect(parseKanshiBirth(value)).not.toBeNull();
  });
});

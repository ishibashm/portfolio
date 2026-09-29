import { describe, expect, it } from "vitest";
import {
  buildCpiRent,
  buildRetailRent,
  codeByName,
  monthOfTimeName,
  parseRentValue,
  plainName,
  type EstatRentResponse,
  type EstatRentValue,
} from "@/utils/estatRent";

/**
 * 公的な家賃の統計（e-Stat の民営家賃）の写しを作る集計。
 *
 * 項目のコードを決め打ちせず名前で選ぶので、**名前が見つからないときに
 * 黙って別の系列に落ちない**（止める）ことを固定する。前年同月比は
 * 指数から出す。
 */

function response(
  classes: Record<string, [string, string][]>,
  values: EstatRentValue[],
): EstatRentResponse {
  return {
    GET_STATS_DATA: {
      RESULT: { STATUS: 0 },
      STATISTICAL_DATA: {
        CLASS_INF: {
          CLASS_OBJ: Object.entries(classes).map(([id, list]) => ({
            "@id": id,
            CLASS: list.map(([code, name]) => ({
              "@code": code,
              "@name": name,
            })),
          })),
        },
        DATA_INF: { VALUE: values },
      },
    },
  };
}

const TIME: [string, string][] = [
  ["2025000000", "2025年"],
  ["2025000808", "2025年8月"],
  ["2026000707", "2026年7月"],
  ["2026000808", "2026年8月"],
];

describe("読み方", () => {
  it("月の名前だけを YYYY-MM にする", () => {
    expect(monthOfTimeName("2026年8月")).toBe("2026-08");
    expect(monthOfTimeName("2026年12月")).toBe("2026-12");
    expect(monthOfTimeName("2026年")).toBeNull();
    expect(monthOfTimeName("2026年度")).toBeNull();
    expect(monthOfTimeName("2026年13月")).toBeNull();
  });

  it("欠測は null、カンマは外す、0 は 0", () => {
    expect(parseRentValue("-")).toBeNull();
    expect(parseRentValue("***")).toBeNull();
    expect(parseRentValue("X")).toBeNull();
    expect(parseRentValue("")).toBeNull();
    expect(parseRentValue("8,712")).toBe(8712);
    expect(parseRentValue("0")).toBe(0);
  });

  it("名前が無ければ止める（別の項目に落ちない）", () => {
    const r = response({ tab: [["02", "前年同月比"]] }, []);
    const objs = r.GET_STATS_DATA.STATISTICAL_DATA!.CLASS_INF!.CLASS_OBJ;
    expect(() =>
      codeByName(Array.isArray(objs) ? objs : [objs], "tab", "指数"),
    ).toThrow(/「指数」が無い/);
  });
});

describe("項目名の先頭に重なったコード", () => {
  it("外して比べる（消費者物価指数の表は「0047 民営家賃」の形で返す）", () => {
    expect(plainName("0047 民営家賃")).toBe("民営家賃");
    expect(plainName("3001 民営家賃")).toBe("民営家賃");
    expect(plainName("00000 全国")).toBe("全国");
    expect(plainName("13100　東京都区部")).toBe("東京都区部");
    expect(plainName("2026年8月")).toBe("2026年8月");
    expect(plainName("民営家賃")).toBe("民営家賃");
  });

  it("コード付きの名前の表からも、品目・地域・月を選べる", () => {
    const data = response(
      {
        tab: [["01", "01 指数"]],
        area: [
          ["00000", "00000 全国"],
          ["13100", "13100 東京都区部"],
        ],
        time: [
          ["2025000808", "2025年8月"],
          ["2026000808", "2026年8月"],
        ],
      },
      [
        { "@tab": "01", "@area": "00000", "@time": "2025000808", $: "100.0" },
        { "@tab": "01", "@area": "00000", "@time": "2026000808", $: "100.5" },
        { "@tab": "01", "@area": "13100", "@time": "2026000808", $: "101.0" },
      ],
    );
    const cpi = buildCpiRent(data, "T", ["全国", "東京都区部"]);
    expect(cpi.latestMonth).toBe("2026-08");
    expect(cpi.areas.map((a) => a.areaName).sort()).toEqual([
      "全国",
      "東京都区部",
    ]);
    expect(cpi.areas.find((a) => a.areaName === "全国")?.yoyPct).toBe(0.5);
  });
});

describe("消費者物価指数の民営家賃", () => {
  const classes = {
    tab: [
      ["01", "指数"],
      ["02", "前年同月比"],
    ] as [string, string][],
    area: [
      ["00000", "全国"],
      ["13100", "東京都区部"],
      ["27100", "大阪市"],
    ] as [string, string][],
    time: TIME,
  };
  const v = (tab: string, area: string, time: string, $: string) => ({
    "@tab": tab,
    "@area": area,
    "@time": time,
    $,
  });
  const data = response(classes, [
    v("01", "00000", "2025000000", "99.0"), // 年の値は推移に入れない
    v("01", "00000", "2025000808", "100.0"),
    v("01", "00000", "2026000707", "100.4"),
    v("01", "00000", "2026000808", "100.6"),
    v("02", "00000", "2026000808", "9.9"), // 前年同月比の表章は読まない
    v("01", "13100", "2025000808", "100.0"),
    v("01", "13100", "2026000808", "101.2"),
    v("01", "27100", "2026000808", "100.1"), // 前年同月が無い
  ]);

  const cpi = buildCpiRent(data, "T", ["全国", "東京都区部"]);

  it("最新月と、全国・東京都区部の月次の推移", () => {
    expect(cpi.latestMonth).toBe("2026-08");
    expect(cpi.series.map((s) => s.areaName)).toEqual(["全国", "東京都区部"]);
    expect(cpi.series[0].points).toEqual([
      { month: "2025-08", value: 100 },
      { month: "2026-07", value: 100.4 },
      { month: "2026-08", value: 100.6 },
    ]);
  });

  it("前年同月比は指数から出す。前年同月が無ければ null", () => {
    const by = Object.fromEntries(cpi.areas.map((a) => [a.areaName, a]));
    expect(by["全国"]).toEqual({ areaName: "全国", index: 100.6, yoyPct: 0.6 });
    expect(by["東京都区部"].yoyPct).toBe(1.2);
    expect(by["大阪市"].yoyPct).toBeNull();
  });

  it("推移に持つ地域が表に無ければ止める", () => {
    expect(() => buildCpiRent(data, "T", ["全国", "那覇市"])).toThrow(
      /「那覇市」が無い/,
    );
  });

  it("e-Stat が拒否したら止める", () => {
    const bad: EstatRentResponse = {
      GET_STATS_DATA: { RESULT: { STATUS: 100, ERROR_MSG: "認証" } },
    };
    expect(() => buildCpiRent(bad, "T", ["全国"])).toThrow(/拒否: 100/);
  });
});

describe("小売物価統計調査の民営家賃（都市別）", () => {
  const data = response(
    {
      area: [
        ["13100", "東京都区部"],
        ["01100", "札幌市"],
      ],
      time: TIME,
    },
    [
      { "@area": "13100", "@time": "2025000808", "@unit": "円", $: "8,500" },
      { "@area": "13100", "@time": "2026000808", "@unit": "円", $: "8,712" },
      { "@area": "01100", "@time": "2026000808", "@unit": "円", $: "3,100" },
      { "@area": "01100", "@time": "2026000707", "@unit": "円", $: "-" },
    ],
  );
  const retail = buildRetailRent(data, "R");

  it("都市ごとに最新月と前年同月。コード順", () => {
    expect(retail.latestMonth).toBe("2026-08");
    expect(retail.unit).toBe("円");
    expect(retail.cities).toEqual([
      { areaCode: "01100", areaName: "札幌市", yen: 3100, yenYearAgo: null },
      {
        areaCode: "13100",
        areaName: "東京都区部",
        yen: 8712,
        yenYearAgo: 8500,
      },
    ]);
  });
});

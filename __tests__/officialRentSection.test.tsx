import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  OfficialRentSection,
  monthLabel,
} from "@/components/relocation/OfficialRentSection";
import { ESTAT_API_CREDIT } from "@/lib/estatCredit";
import type { EstatRentSnapshot } from "@/utils/estatRent";

/**
 * 家賃市場の頁の、公的な家賃の統計の札（利用者の指摘、2026-09-30
 * 「このデータは最新？」。掲載の推移は 2026-09-13 で止まっている）。
 *
 * - 題に「何月まで」を出す（止まっているのか動いているのかが題で分かる）
 * - 全国・東京都区部の最新の指数と前年同月比を本文に出す
 * - 都市別の水準は 3.3㎡あたりと㎡あたり（÷3.3）、前年同月比
 * - e-Stat の API の規約のクレジットと、出典・加工の明記
 */

const SNAPSHOT: EstatRentSnapshot = {
  cpi: {
    tableId: "0004052037",
    latestMonth: "2026-08",
    series: [
      {
        areaName: "全国",
        points: [
          { month: "2025-08", value: 100 },
          { month: "2026-08", value: 100.6 },
        ],
      },
      {
        areaName: "東京都区部",
        points: [
          { month: "2025-08", value: 100 },
          { month: "2026-08", value: 101.2 },
        ],
      },
    ],
    areas: [
      { areaName: "全国", index: 100.6, yoyPct: 0.6 },
      { areaName: "東京都区部", index: 101.2, yoyPct: 1.2 },
      { areaName: "那覇市", index: 99.5, yoyPct: -0.4 },
      { areaName: "新しい地域", index: 100.1, yoyPct: null },
    ],
  },
  retail: {
    tableId: "0003421913",
    latestMonth: "2026-08",
    unit: "円",
    cities: [
      { areaCode: "01100", areaName: "札幌市", yen: 3300, yenYearAgo: null },
      {
        areaCode: "13100",
        areaName: "東京都区部",
        yen: 8712,
        yenYearAgo: 8500,
      },
    ],
  },
};

afterEach(() => cleanup());

describe("OfficialRentSection", () => {
  it("月の書き方", () => {
    expect(monthLabel("2026-08")).toBe("2026年8月");
    expect(monthLabel("2026-12")).toBe("2026年12月");
  });

  it("題に最新月、本文に全国・東京都区部の指数と前年同月比", () => {
    render(<OfficialRentSection snapshot={SNAPSHOT} />);
    expect(
      screen.getByRole("heading", { name: /民営家賃の推移.*2026年8月まで/ }),
    ).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("全国 100.6（前年同月比 +0.6%）");
    expect(text).toContain("東京都区部 101.2（前年同月比 +1.2%）");
  });

  it("地域別は前年同月比の高い順、無いものは最後に —", () => {
    render(<OfficialRentSection snapshot={SNAPSHOT} />);
    const rows = [
      ...document.querySelectorAll("details")[0].querySelectorAll("tbody tr"),
    ].map((tr) => tr.textContent);
    expect(rows).toEqual([
      "東京都区部101.2+1.2%",
      "全国100.6+0.6%",
      "那覇市99.5-0.4%",
      "新しい地域100.1—",
    ]);
  });

  it("都市別は高い順に、3.3㎡あたり・㎡あたり・前年同月比", () => {
    render(<OfficialRentSection snapshot={SNAPSHOT} />);
    const rows = [
      ...document.querySelectorAll("details")[1].querySelectorAll("tbody tr"),
    ].map((tr) => tr.textContent);
    expect(rows).toEqual([
      "東京都区部8,712円2,640円+2.5%",
      "札幌市3,300円1,000円—",
    ]);
  });

  it("地域別が推移の 2 地域しか無いときは、地域別の表を出さない（要約と同じ行になる）", () => {
    const only2 = {
      ...SNAPSHOT,
      cpi: { ...SNAPSHOT.cpi, areas: SNAPSHOT.cpi.areas.slice(0, 2) },
    };
    render(<OfficialRentSection snapshot={only2} />);
    const summaries = [...document.querySelectorAll("details summary")].map(
      (s) => s.textContent,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain("都市別の家賃の水準");
  });

  it("規約のクレジットと出典・加工の明記", () => {
    render(<OfficialRentSection snapshot={SNAPSHOT} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain(ESTAT_API_CREDIT);
    expect(text).toContain("出典：政府統計の総合窓口(e-Stat)");
    expect(text).toContain("を加工して作成");
  });
});

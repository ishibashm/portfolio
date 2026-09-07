import { describe, expect, it } from "vitest";
import { fetchMetaphysicalData } from "@/utils/metaphysicalApis";
import type { BaziResult } from "@/utils/baziEngine";

/**
 * 大運（10 年ごとの柱）を選ぶ年を、**日本時間で**読むこと。
 *
 * `currentDate.getFullYear()` は実行環境のタイムゾーンを見る。本番
 * （Cloud Run）は UTC なので、元日の 0〜9 時（日本時間）には前年になり、
 * **大運の切り替わりに当たる人だけ 1 つ前の柱が出る**。
 *
 * 同じ関数の中で、日替わりの乱数は既に toJapanDateString で引いている。
 * 引き方が 2 通りあると、同じ画面の中で日と年がずれる。
 */

/** 大運の境目が 2027 年に来る人。ほかの項目は使わないので最小限。 */
const bazi = {
  luckCycles: [
    { ganZhi: "丙午", startYear: 2017, endYear: 2026 },
    { ganZhi: "丁未", startYear: 2027, endYear: 2036 },
  ],
} as unknown as BaziResult;

const birth = new Date("1990-05-15T12:00");

function pillarAt(iso: string): string | undefined {
  const data = fetchMetaphysicalData(birth, new Date(iso), bazi, true);
  return data.chineseMetasoft.daYunPillar?.pillar;
}

describe("大運の年は日本時間で決める", () => {
  it("元日の 0 時台（日本時間）で、その年の柱が出る", () => {
    /* この時刻の UTC は 2026-12-31。旧実装は 2026 年として丙午を返した */
    expect(pillarAt("2027-01-01T00:30:00+09:00")).toBe("丁未");
  });

  it("大晦日（日本時間）はまだ前の柱", () => {
    expect(pillarAt("2026-12-31T23:30:00+09:00")).toBe("丙午");
  });

  it("昼の時刻では前後とも変わらない", () => {
    expect(pillarAt("2026-06-01T12:00:00+09:00")).toBe("丙午");
    expect(pillarAt("2027-06-01T12:00:00+09:00")).toBe("丁未");
  });

  it("年齢の起点は生年（ここは変えていない）", () => {
    const data = fetchMetaphysicalData(
      birth,
      new Date("2027-01-01T00:30:00+09:00"),
      bazi,
      true,
    );
    expect(data.chineseMetasoft.daYunPillar?.startAge).toBe(2027 - 1990);
  });
});

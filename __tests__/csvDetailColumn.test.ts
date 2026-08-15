import { describe, expect, it } from "vitest";
import { formatCsvDetail } from "@/components/SolarTimeClock";

/**
 * 書き出し（マスター状態の CSV）の「_Detail」列が読める形で出ること。
 *
 * DS_Ephemeris_Detail / DS_Astrology_Detail / DS_RAG_Detail の 3 列は、
 * 中身がオブジェクトや配列なのにそのまま `${v}` で文字列化していた。
 * 結果は "[object Object]" で、列としてまったく読めなかった。
 * 型が any だったので tsc も止められず、書き出した人しか気付けない。
 *
 * 畳み込みを 1 か所（formatCsvDetail）に置いたので、ここで固定する。
 */
describe("書き出しの _Detail 列", () => {
  it("オブジェクトを key=value の並びにする（[object Object] にしない）", () => {
    const out = formatCsvDetail({ sun: "獅子座 12.3", moon: "牡牛座 4.5" });
    expect(out).toBe("sun=獅子座 12.3 | moon=牡牛座 4.5");
    expect(out).not.toContain("[object Object]");
  });

  it("配列を区切って並べる", () => {
    expect(formatCsvDetail(["火星180度土星", "月90度太陽"])).toBe(
      "火星180度土星 | 月90度太陽",
    );
  });

  it("空はそのまま空にする（null / undefined）", () => {
    expect(formatCsvDetail(null)).toBe("");
    expect(formatCsvDetail(undefined)).toBe("");
  });

  it("文字列と数値はそのまま出す", () => {
    expect(formatCsvDetail("astronomy-engine")).toBe("astronomy-engine");
    expect(formatCsvDetail(42)).toBe("42");
  });

  it("区切りに CSV の , を使わない（セルが割れないこと）", () => {
    expect(formatCsvDetail(["a", "b"])).not.toContain(",");
  });
});

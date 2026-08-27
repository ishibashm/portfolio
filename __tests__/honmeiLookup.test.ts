import { describe, it, expect } from "vitest";
import { isValidBirthDateInput, lookupHonmei } from "@/lib/honmeiLookup";

/**
 * 期待値はエンジンから再計算せず、既知の値を直書きする。
 * エンジンで期待値を作ると、エンジンが壊れてもテストが通ってしまう。
 *
 * - 1980 年生まれ: 古典で二黒土星(2)、独自モデルで六白金星(6)。
 *   /houi ページ本文が例として載せている値。
 * - 2026 年の年盤は中宮 1（一白）。よって 2025 年生まれの古典は 2。
 * - 2026 年の立春は 2月4日 5時1分ごろ（JST）。/houi ページ本文の値。
 */
describe("isValidBirthDateInput", () => {
  it("YYYY-MM-DD だけを受け付ける", () => {
    expect(isValidBirthDateInput("1980-06-15")).toBe(true);
    expect(isValidBirthDateInput("")).toBe(false);
    expect(isValidBirthDateInput("1980/06/15")).toBe(false);
    expect(isValidBirthDateInput("1980-6-15")).toBe(false);
    expect(isValidBirthDateInput("abc")).toBe(false);
  });

  it("存在しない日付を弾く", () => {
    expect(isValidBirthDateInput("2026-02-30")).toBe(false);
    expect(isValidBirthDateInput("2026-13-01")).toBe(false);
    expect(isValidBirthDateInput("2023-02-29")).toBe(false);
    expect(isValidBirthDateInput("2024-02-29")).toBe(true); // 閏年
  });

  it("範囲外の年を弾く", () => {
    expect(isValidBirthDateInput("1899-12-31")).toBe(false);
    expect(isValidBirthDateInput("1900-01-01")).toBe(true);
    expect(isValidBirthDateInput("2050-12-31")).toBe(true);
    expect(isValidBirthDateInput("2051-01-01")).toBe(false);
  });
});

describe("lookupHonmei", () => {
  it("妥当でない入力は null", async () => {
    expect(await lookupHonmei("")).toBeNull();
    expect(await lookupHonmei("2026-02-30")).toBeNull();
  });

  it("立春から離れた日は一意に決まる（1980-06-15 = 古典二黒・独自六白）", async () => {
    const r = await lookupHonmei("1980-06-15");
    expect(r).not.toBeNull();
    expect(r!.classicalChanges).toBe(false);
    expect(r!.dayStart.classical).toBe(2);
    expect(r!.dayStart.physical).toBe(6);
  });

  it("立春当日（2026-02-04）は日の中で古典の本命星が変わる", async () => {
    const r = await lookupHonmei("2026-02-04");
    expect(r).not.toBeNull();
    expect(r!.classicalChanges).toBe(true);
    // 立春（5時1分ごろ）より前は前年 2025 の星、後は 2026 の星
    expect(r!.dayStart.classical).toBe(2);
    expect(r!.dayEnd.classical).toBe(1);
  });

  it("立春の前日・翌日は変わらない", async () => {
    const before = await lookupHonmei("2026-02-03");
    expect(before!.classicalChanges).toBe(false);
    expect(before!.dayStart.classical).toBe(2); // まだ 2025 年扱い

    const after = await lookupHonmei("2026-02-05");
    expect(after!.classicalChanges).toBe(false);
    expect(after!.dayStart.classical).toBe(1);
  });
});

/**
 * 場所の表示（lib/placeLabel）。地名 → 市区町村「付近」→ 座標 の順。
 */
import { describe, expect, it } from "vitest";
import { describePlace } from "@/lib/placeLabel";

describe("describePlace", () => {
  it("座標が無ければ未設定", () => {
    expect(describePlace(null, 139, "東京駅")).toBe("未設定");
  });
  it("地名があればそれ", () => {
    expect(describePlace(35.68, 139.77, "東京駅", "東京都千代田区")).toBe(
      "東京駅",
    );
  });
  it("地名が無ければ市区町村に「付近」", () => {
    expect(describePlace(35.68, 139.77, "", "東京都千代田区")).toBe(
      "東京都千代田区 付近",
    );
  });
  it("どちらも無ければ座標", () => {
    expect(describePlace(35.68, 139.77)).toMatch(/北緯/);
  });
});

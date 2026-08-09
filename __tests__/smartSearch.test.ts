import { describe, expect, it } from "vitest";

import {
  hasStructuredFilters,
  normalizeLayout,
  parseSmartQuery,
} from "@/utils/smartSearch";

describe("parseSmartQuery", () => {
  it("典型的な複合条件を全部拾う", () => {
    const f = parseSmartQuery(
      "姫路 2LDK 8万円以下 駅徒歩10分 築15年以内 北東 吉方位のみ",
    );
    expect(f.maxRentMan).toBe(8);
    expect(f.maxStationMin).toBe(10);
    expect(f.maxBuildingAge).toBe(15);
    expect(f.layouts).toEqual(["2LDK"]);
    expect(f.direction).toBe("北東");
    expect(f.luckyOnly).toBe(true);
    expect(f.keywords).toEqual(["姫路"]);
  });

  it("解釈した部分をキーワードに残さない", () => {
    // 「8万円以下」が住所検索にかかると必ず 0 件になる
    const f = parseSmartQuery("神戸市 8万円以下");
    expect(f.keywords).toEqual(["神戸市"]);
  });

  it("家賃の範囲指定", () => {
    const f = parseSmartQuery("6~8万");
    expect(f.minRentMan).toBe(6);
    expect(f.maxRentMan).toBe(8);
  });

  it("全角数字と波ダッシュを受け付ける", () => {
    const f = parseSmartQuery("６〜８万円");
    expect(f.minRentMan).toBe(6);
    expect(f.maxRentMan).toBe(8);
  });

  it("新築・築浅・駅近の慣用表現", () => {
    expect(parseSmartQuery("新築").maxBuildingAge).toBe(1);
    expect(parseSmartQuery("築浅").maxBuildingAge).toBe(10);
    expect(parseSmartQuery("駅近").maxStationMin).toBe(10);
  });

  it("広さと複数の間取り", () => {
    const f = parseSmartQuery("30㎡以上 1LDK 2DK ワンルーム");
    expect(f.minSizeSqm).toBe(30);
    expect(f.layouts).toEqual(expect.arrayContaining(["1LDK", "2DK", "1R"]));
  });

  it("地名に含まれる方位語を方位と誤認しない", () => {
    // 西宮の「西」、東広島の「東」を方位にしてはいけない
    expect(parseSmartQuery("西宮市").direction).toBeUndefined();
    expect(parseSmartQuery("東広島").direction).toBeUndefined();
    expect(parseSmartQuery("西宮 南西").direction).toBe("南西");
    expect(parseSmartQuery("西 方面で探す").direction).toBe("西");
    expect(parseSmartQuery("南側").direction).toBe("南");
  });

  it("大吉のみはステータス、吉方位のみは凶の除外", () => {
    expect(parseSmartQuery("大吉のみ").status).toBe("OPTIMAL");
    expect(parseSmartQuery("凶を避けたい").luckyOnly).toBe(true);
    expect(parseSmartQuery("凶方位除外").luckyOnly).toBe(true);
  });

  it("純粋な自然文は構造なしと判定される（LLM 側へ回す判断材料）", () => {
    const f = parseSmartQuery("静かで広めの部屋がいい");
    expect(hasStructuredFilters(f)).toBe(false);
    expect(f.keywords.length).toBeGreaterThan(0);
  });
});

describe("normalizeLayout", () => {
  it("ワンルームと小文字を正規化する", () => {
    expect(normalizeLayout("ワンルーム")).toBe("1R");
    expect(normalizeLayout("2ldk")).toBe("2LDK");
  });
});

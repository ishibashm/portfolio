import { describe, expect, it } from "vitest";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { PREF_REGION, prefNameByCode } from "@/lib/prefContent";

/**
 * llms.txt / llms-full.txt に地域ページが載っていること。
 *
 * Search Console の実測では表示の付くクエリのほぼ全部が
 * 「地名 家賃相場」なのに、AI クローラ向けの案内には**都道府県ページも
 * 市区町村ページも 1 つも載っていなかった**（機能の一覧・ガイド・記事だけ）。
 * 手で書いた 47 県ぶんの文章が、いちばん引かれる経路から抜けていた。
 *
 * ここでは route の中身そのものではなく、**生成の材料が揃っているか**を
 * 固定する。route は fetch と DB を触るのでテストから直接叩けない。
 */

describe("llms.txt に出す地域の材料", () => {
  it("47 県ぶんある", () => {
    expect(Object.keys(PREF_EDITORIAL)).toHaveLength(47);
  });

  it("どの県も、地方名と県名の両方が引ける", () => {
    /* 片方でも欠けると llms-full.txt の行が黙って落ちる */
    const missing: string[] = [];
    for (const code of Object.keys(PREF_EDITORIAL)) {
      if (!prefNameByCode(code) || !PREF_REGION[code]) missing.push(code);
    }
    expect(missing).toEqual([]);
  });

  it("地方は 9 つで、どれも 1 県以上を持つ", () => {
    const byRegion = new Map<string, number>();
    for (const code of Object.keys(PREF_EDITORIAL)) {
      const r = PREF_REGION[code];
      byRegion.set(r, (byRegion.get(r) ?? 0) + 1);
    }
    expect([...byRegion.keys()].sort()).toEqual(
      [
        "中国",
        "九州・沖縄",
        "北海道",
        "北陸・甲信越",
        "四国",
        "東北",
        "東海",
        "関東",
        "近畿",
      ].sort(),
    );
    for (const [region, n] of byRegion) expect(n, region).toBeGreaterThan(0);
    expect([...byRegion.values()].reduce((a, b) => a + b, 0)).toBe(47);
  });
});

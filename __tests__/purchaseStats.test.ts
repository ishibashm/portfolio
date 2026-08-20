import { describe, expect, it } from "vitest";
import {
  BUILDING_AGE_BUCKETS,
  buildingAgeBucket,
  buildingRatioBand,
  EMPTY_PURCHASE_STATS,
} from "@/utils/purchaseStats";

/**
 * 購入の相場分析の区分。
 *
 * ここで守りたいのは **「分からない」を数字で埋めない**こと。
 * 建築年が欠けている行を「築 0 年」に寄せると新築の中央値が下がり、
 * 「新築は意外と安い」という嘘の結論が出る。null で返して集計から
 * 外すのが正しい。
 */

describe("築年数の区分", () => {
  it("成約年と建築年から区分を出す", () => {
    expect(buildingAgeBucket(2025, 2024)?.label).toBe("新築・築5年以内");
    expect(buildingAgeBucket(2025, 2020)?.label).toBe("新築・築5年以内");
    expect(buildingAgeBucket(2025, 2019)?.label).toBe("築6〜10年");
    expect(buildingAgeBucket(2025, 2015)?.label).toBe("築6〜10年");
    expect(buildingAgeBucket(2025, 2014)?.label).toBe("築11〜20年");
    expect(buildingAgeBucket(2025, 1995)?.label).toBe("築21〜30年"); // 築30年
    expect(buildingAgeBucket(2025, 1994)?.label).toBe("築31〜40年"); // 築31年
    expect(buildingAgeBucket(2025, 1985)?.label).toBe("築31〜40年"); // 築40年
    expect(buildingAgeBucket(2025, 1980)?.label).toBe("築41年以上");
  });

  it("**どちらかが欠けていれば null。**0 で埋めない", () => {
    // 0 で埋めると「築 0 年（新築）」になり、新築の中央値が狂う。
    expect(buildingAgeBucket(2025, null)).toBeNull();
    expect(buildingAgeBucket(null, 2020)).toBeNull();
    expect(buildingAgeBucket(undefined, undefined)).toBeNull();
    expect(buildingAgeBucket(2025, NaN)).toBeNull();
  });

  it("壊れた建築年を弾く（国交省のデータに 0 や 9999 が混ざる）", () => {
    for (const y of [0, 1, 999, 9999, 3000]) {
      expect(buildingAgeBucket(2025, y), `建築年 ${y}`).toBeNull();
    }
  });

  it("築年数が負でも捨てず、新築側へ寄せる（青田売り・記載の揺れ）", () => {
    // 建築年 > 成約年 の行は実データにある。「負の築年数」の区分は作らない。
    expect(buildingAgeBucket(2024, 2026)?.label).toBe("新築・築5年以内");
    expect(buildingAgeBucket(2024, 2026)?.order).toBe(0);
  });

  it("区分は order で順序を持つ（文字列の並びに依存しない）", () => {
    const orders = BUILDING_AGE_BUCKETS.map((b) => b.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("どの築年数でも必ずどれかの区分に入る（取りこぼしが無い）", () => {
    for (let age = 0; age <= 120; age++) {
      const got = buildingAgeBucket(2025, 2025 - age);
      expect(got, `築 ${age} 年`).not.toBeNull();
    }
  });
});

describe("建物比率の区分", () => {
  it("0〜1 を 5 段に落とす", () => {
    expect(buildingRatioBand(0.1)?.label).toBe("ほぼ土地代（建物 20% 未満）");
    expect(buildingRatioBand(0.3)?.label).toBe("土地寄り（建物 20〜40%）");
    expect(buildingRatioBand(0.5)?.label).toBe("半々（建物 40〜60%）");
    expect(buildingRatioBand(0.7)?.label).toBe("建物寄り（建物 60〜80%）");
    expect(buildingRatioBand(0.9)?.label).toBe("ほぼ建物代（建物 80% 以上）");
  });

  it("境目は下の区分に入れる（20% ちょうどは「土地寄り」）", () => {
    expect(buildingRatioBand(0.2)?.order).toBe(1);
    expect(buildingRatioBand(0.4)?.order).toBe(2);
    expect(buildingRatioBand(0.6)?.order).toBe(3);
    expect(buildingRatioBand(0.8)?.order).toBe(4);
  });

  it("両端（0 と 1）も区分に入る", () => {
    expect(buildingRatioBand(0)?.order).toBe(0);
    expect(buildingRatioBand(1)?.order).toBe(4);
  });

  it("範囲外・欠損は null", () => {
    for (const v of [null, undefined, NaN, -0.1, 1.1, Infinity]) {
      expect(buildingRatioBand(v as number), String(v)).toBeNull();
    }
  });
});

describe("集計前の雛形", () => {
  it("generatedAt が null（ページはこれで準備中を出す）", () => {
    expect(EMPTY_PURCHASE_STATS.generatedAt).toBeNull();
  });

  it("配列は空で、undefined にしない（描画側で ?. を増やさないため）", () => {
    const n = EMPTY_PURCHASE_STATS.national;
    for (const [key, value] of Object.entries(n)) {
      expect(Array.isArray(value), key).toBe(true);
      expect((value as unknown[]).length, key).toBe(0);
    }
    expect(EMPTY_PURCHASE_STATS.prefectures).toEqual([]);
    expect(EMPTY_PURCHASE_STATS.yearly).toEqual([]);
  });
});

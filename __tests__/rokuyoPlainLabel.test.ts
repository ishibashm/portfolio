import { describe, expect, it } from "vitest";
import { ROKUYO, getRokuyo, plainRokuyo } from "@/utils/lunar";

/**
 * 六曜の札から、ローマ字の併記を落とす所を 1 つにする。
 *
 * `ROKUYO` は `"大安 (Taian)"` の形で持っている。**内部はこのままでよい** —
 * `rokuyo.includes("大安")` で判定している所が複数あり、日本語の部分だけを
 * 見ているので壊れない。
 *
 * 困るのは**画面に出すとき**で、日本語の画面に「(Taian)」が付いて出る。
 * 落とす式は `lib/monthlyCalendar` が自前で持っていたが、同じことを
 * 2 か所に書かないという方針（docs/site-spec.md）に従って、`ROKUYO` の
 * 持ち主である `utils/lunar` へ寄せた。
 *
 * ここで固定するのは 3 つ。
 *
 *   1. 6 つとも日本語だけになること（1 つでも落とし損ねたら落ちる）
 *   2. 落としたあとも `includes("大安")` の判定が通ること
 *   3. 何度掛けても同じ（すでに落ちている値を壊さない）
 */
describe("plainRokuyo", () => {
  it("6 つとも括弧の中を落とす", () => {
    const plain = ROKUYO.map(plainRokuyo);
    expect(plain).toEqual(["大安", "赤口", "先勝", "友引", "先負", "仏滅"]);
    /* 括弧が 1 つも残っていない（この検査自体が空回りしていないこと） */
    expect(ROKUYO.some((r) => r.includes("("))).toBe(true);
    expect(plain.some((r) => r.includes("("))).toBe(false);
  });

  it("落としたあとも「大安」の判定は通る", () => {
    expect(plainRokuyo(ROKUYO[0]).includes("大安")).toBe(true);
  });

  it("何度掛けても同じ", () => {
    for (const r of ROKUYO) {
      expect(plainRokuyo(plainRokuyo(r))).toBe(plainRokuyo(r));
    }
  });

  it("空文字と、括弧の無い値をそのまま返す", () => {
    expect(plainRokuyo("")).toBe("");
    expect(plainRokuyo("大安")).toBe("大安");
  });

  it("実際の日付から引いた値にも効く", () => {
    /* 2026-09-20 の正午（日本時間） */
    const raw = getRokuyo(new Date(Date.UTC(2026, 8, 20, 3, 0)));
    expect(raw).toContain("(");
    expect(plainRokuyo(raw)).not.toContain("(");
  });
});

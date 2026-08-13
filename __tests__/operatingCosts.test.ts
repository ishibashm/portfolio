import { describe, expect, it } from "vitest";
import {
  FIXED_COSTS,
  perUnitYen,
  totalMonthlyYen,
  unsetItems,
  type CostItem,
} from "@/lib/operatingCosts";

/**
 * 運用経費の集計。
 *
 * 気にしているのは 1 つだけ。**未設定を 0 として扱わないこと。**
 *
 * 一部だけ埋まった状態で足すと、実際より小さい額が「合計」として画面に
 * 出る。経費は「割に合っているか」を判断するための数字なので、小さく出る
 * のが一番まずい。分からないものは分からないと出す。
 *
 * 市区町村の所得で、存在しない項目を読んで NaN を出していた件（#231）と
 * 同じ筋。もっともらしい数字を出すくらいなら出さないほうがよい。
 */

const item = (key: string, monthlyYen: number | null): CostItem => ({
  key,
  label: key,
  monthlyYen,
  note: "",
});

describe("運用経費の集計", () => {
  it("全部埋まっていれば合計が出る", () => {
    expect(totalMonthlyYen([item("a", 1000), item("b", 2500)])).toBe(3500);
  });

  it("1 つでも未設定なら合計を出さない", () => {
    // 1000 と足して 1000 を「合計」として出さない。
    expect(totalMonthlyYen([item("a", 1000), item("b", null)])).toBeNull();
  });

  it("全部未設定でも 0 と言わない", () => {
    expect(totalMonthlyYen([item("a", null), item("b", null)])).toBeNull();
  });

  it("項目が無ければ 0（未設定ではない）", () => {
    expect(totalMonthlyYen([])).toBe(0);
  });

  it("未設定の項目を数えられる", () => {
    const items = [item("a", 0), item("b", null), item("c", null)];
    expect(unsetItems(items).map((i) => i.key)).toEqual(["b", "c"]);
  });

  it("0 円と未設定を混同しない", () => {
    // 無料枠に収まって 0 円、は確かめた事実。未設定は「調べていない」。
    expect(totalMonthlyYen([item("a", 0), item("b", 0)])).toBe(0);
    expect(unsetItems([item("a", 0)])).toHaveLength(0);
  });

  it("単価は分母が 0 なら出さない", () => {
    // 登録者 0 人のときに Infinity や NaN を画面に出さない。
    expect(perUnitYen(1000, 0)).toBeNull();
    expect(perUnitYen(1000, -1)).toBeNull();
  });

  it("合計が未設定なら単価も出さない", () => {
    expect(perUnitYen(null, 100)).toBeNull();
  });

  it("1000 件あたりに換算できる", () => {
    expect(perUnitYen(3000, 6000, 1000)).toBe(500);
  });

  it("最初に置いた一覧は、まだ額を埋めていない", () => {
    // 推測の額をコミットしていないことの裏取り。実額を入れたらこの
    // テストは落ちるので、そのとき一緒に直す（意図した変更だと分かる）。
    expect(unsetItems()).toHaveLength(FIXED_COSTS.length);
    expect(totalMonthlyYen()).toBeNull();
  });
});

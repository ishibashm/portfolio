import { describe, expect, it } from "vitest";
import {
  BASIS_YEAR,
  INCENTIVE_DISCLAIMER,
  PROPERTY_TAX_EXTRA_YEARS,
  acquisitionTaxAdvantage,
  certifiedAdvantage,
  loanDeduction,
} from "@/utils/housingIncentive";

/**
 * 認定住宅の優遇額を固定する。
 *
 * **税制の数字がそのまま画面に出る。**変えると利用者の見る金額が変わるので、
 * 期待値をここに書いて、制度改正のとき必ずここが落ちるようにする。
 */

describe("借入限度額と控除の上限", () => {
  it("認定住宅・子育て世帯・新築は 5,000 万円が上限", () => {
    const r = loanDeduction({
      year: BASIS_YEAR,
      grade: "certified",
      household: "childRearing",
      isNewBuild: true,
    });
    expect(r?.loanLimit).toBe(50_000_000);
    expect(r?.years).toBe(13);
    // 5,000万 × 0.7% × 13年
    expect(r?.maxDeduction).toBe(4_550_000);
  });

  it("認定住宅・一般世帯・新築は 4,500 万円", () => {
    const r = loanDeduction({
      year: BASIS_YEAR,
      grade: "certified",
      household: "general",
      isNewBuild: true,
    });
    expect(r?.loanLimit).toBe(45_000_000);
  });

  it("省エネ基準を満たさない新築は 0（控除そのものが無い）", () => {
    const r = loanDeduction({
      year: BASIS_YEAR,
      grade: "none",
      household: "childRearing",
      isNewBuild: true,
    });
    expect(r?.loanLimit).toBe(0);
    expect(r?.maxDeduction).toBe(0);
  });

  it("中古は世帯で変わらず、年数も 10 年", () => {
    const child = loanDeduction({
      year: BASIS_YEAR,
      grade: "certified",
      household: "childRearing",
      isNewBuild: false,
    });
    const general = loanDeduction({
      year: BASIS_YEAR,
      grade: "certified",
      household: "general",
      isNewBuild: false,
    });
    expect(child?.loanLimit).toBe(30_000_000);
    expect(general?.loanLimit).toBe(30_000_000);
    expect(child?.years).toBe(10);
  });

  it("表と違う年なら null（古い数字を黙って使わない）", () => {
    const r = loanDeduction({
      year: BASIS_YEAR + 1,
      grade: "certified",
      household: "general",
      isNewBuild: true,
    });
    expect(r).toBeNull();
  });
});

describe("認定を取っていない場合との差", () => {
  it("比べる相手は省エネ基準の住宅（控除 0 の none とは比べない）", () => {
    /*
      2024 年以降の新築は省エネ基準を満たさないと控除が 0 になる。
      none と比べると差が大きく出すぎて実態と合わない。
      いま流通している新築は少なくとも省エネ基準は満たしている。
    */
    const diff = certifiedAdvantage("childRearing", true);
    // 5,000万 − 4,000万 = 1,000万 → × 0.7% × 13年 = 91万
    expect(diff).toBe(910_000);
  });

  it("一般世帯の新築は差がもっと大きい", () => {
    // 4,500万 − 3,000万 = 1,500万 → × 0.7% × 13年 = 136.5万
    expect(certifiedAdvantage("general", true)).toBe(1_365_000);
  });

  it("中古は認定でも省エネでも枠が同じなので、差が出ない", () => {
    expect(certifiedAdvantage("general", false)).toBe(0);
    expect(certifiedAdvantage("childRearing", false)).toBe(0);
  });

  it("表と違う年なら null", () => {
    expect(certifiedAdvantage("general", true, BASIS_YEAR + 1)).toBeNull();
  });
});

describe("そのほかの優遇", () => {
  it("不動産取得税の差は 3 万円（100 万円 × 3%）", () => {
    /*
      小さい。これだけを理由に認定物件を選ぶ話にはならない。
      そう分かるように、隠さず出す。
    */
    expect(acquisitionTaxAdvantage()).toBe(30_000);
  });

  it("固定資産税の減額は 2 年延びる", () => {
    expect(PROPERTY_TAX_EXTRA_YEARS).toBe(2);
  });
});

describe("断り書き", () => {
  it("「上限であって戻る額ではない」ことが書いてある", () => {
    const joined = INCENTIVE_DISCLAIMER.join("\n");
    expect(joined).toContain("上限");
    expect(joined).toContain("戻ってくる額ではありません");
  });

  it("前提の年度が書いてある", () => {
    expect(INCENTIVE_DISCLAIMER.join("\n")).toContain(String(BASIS_YEAR));
  });

  it("一次情報で確認するよう書いてある", () => {
    expect(INCENTIVE_DISCLAIMER.join("\n")).toContain("国税庁");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildScanCounts,
  truncationNotice,
  type ScanCounts,
} from "../src/lib/arbitrageCounts";

/**
 * 走査の件数表示の組み立て。
 *
 * 数字そのものは API が出すので、ここで固定するのは**どの数字を出して
 * どの数字を出さないか**の規則。取り違えると、実際より多い件数を
 * 「物件数」として画面に出す。
 */
describe("buildScanCounts", () => {
  it("名寄せ後の件数と評価件数を取り出す", () => {
    const c = buildScanCounts({
      uniqueCount: 12345,
      totalAnalyzed: 500,
      limit: 500,
      duplicatesHidden: 320,
      staleHidden: 40,
      maxSeenDays: 30,
    });
    expect(c.matched).toBe(12345);
    expect(c.analyzed).toBe(500);
    expect(c.duplicatesHidden).toBe(320);
    expect(c.staleHidden).toBe(40);
    expect(c.staleDays).toBe(30);
  });

  it("uniqueCount が無いときは matched を null にする（totalCount で代用しない）", () => {
    // 生の行数（totalCount）は同じ部屋の別掲載も数えているので、
    // 代用すると実際より多い数を物件数として出すことになる。
    const c = buildScanCounts({
      totalAnalyzed: 500,
      limit: 500,
      // uniqueCount を持たない古い応答を想定して totalCount だけ渡す
      ...({ totalCount: 99999 } as Record<string, unknown>),
    });
    expect(c.matched).toBeNull();
  });

  it("上限まで取れていて、一致件数がそれより多いなら打ち切り", () => {
    const c = buildScanCounts({
      uniqueCount: 12345,
      totalAnalyzed: 500,
      limit: 500,
    });
    expect(c.truncated).toBe(true);
  });

  it("ちょうど上限と同じ件数しか無いなら打ち切りではない", () => {
    // 「上限まで取れた」だけで打ち切りと出すと、全部見たのに
    // 「一覧の外にもっとある」と断ることになる。
    const c = buildScanCounts({
      uniqueCount: 500,
      totalAnalyzed: 500,
      limit: 500,
    });
    expect(c.truncated).toBe(false);
  });

  it("上限に届いていなければ打ち切りではない", () => {
    const c = buildScanCounts({
      uniqueCount: 12345,
      totalAnalyzed: 120,
      limit: 500,
    });
    expect(c.truncated).toBe(false);
  });

  it("一致件数が分からないまま上限まで取れていたら打ち切りとして扱う", () => {
    // 分からない側に倒して「全部見た順位」と読まれるほうが害が大きい。
    const c = buildScanCounts({ totalAnalyzed: 500, limit: 500 });
    expect(c.truncated).toBe(true);
  });

  it("metadata が無くても落ちない", () => {
    const c = buildScanCounts(null);
    expect(c).toEqual({
      matched: null,
      analyzed: 0,
      truncated: false,
      duplicatesHidden: 0,
      staleHidden: 0,
      staleDays: null,
    });
    expect(buildScanCounts(undefined).analyzed).toBe(0);
  });

  it("数値でない値・負の値は無いものとして扱う", () => {
    const c = buildScanCounts({
      uniqueCount: "12345",
      totalAnalyzed: NaN,
      limit: -1,
      duplicatesHidden: null,
      staleHidden: undefined,
      maxSeenDays: 0,
    });
    expect(c.matched).toBeNull();
    expect(c.analyzed).toBe(0);
    expect(c.truncated).toBe(false);
    expect(c.duplicatesHidden).toBe(0);
    expect(c.staleHidden).toBe(0);
    // maxSeenDays=0 は「鮮度で絞らない」の意味。日数として出さない。
    expect(c.staleDays).toBeNull();
  });

  it("0 件の応答をそのまま通す", () => {
    const c = buildScanCounts({
      uniqueCount: 0,
      totalAnalyzed: 0,
      limit: 500,
      staleHidden: 12,
      maxSeenDays: 30,
    });
    expect(c.matched).toBe(0);
    expect(c.truncated).toBe(false);
    // 0 件でも「鮮度で 12 件除いた」は出す。減った理由が分かる。
    expect(c.staleHidden).toBe(12);
  });
});

describe("窓に当たったときの断り", () => {
  const counts = (over: Partial<ScanCounts>): ScanCounts => ({
    matched: null,
    analyzed: 0,
    truncated: false,
    duplicatesHidden: 0,
    staleHidden: 0,
    staleDays: null,
    ...over,
  });

  it("打ち切られていないなら出さない", () => {
    /* その N は全部なので、断りを足すとかえって迷わせる */
    expect(
      truncationNotice(counts({ matched: 201, analyzed: 201 })),
    ).toBeNull();
  });

  it("打ち切られていたら、範囲の総数と窓の大きさを渡す", () => {
    const n = truncationNotice(
      counts({ matched: 12345, analyzed: 500, truncated: true }),
    );
    expect(n).toEqual({ rangeTotal: 12345, analyzed: 500 });
  });

  it("総数が分からなくても、窓に当たったことは出す", () => {
    /* 数を言えないからといって黙ると、空白が「無い」と読まれる。
       そこが今回の実害だった */
    const n = truncationNotice(counts({ analyzed: 500, truncated: true }));
    expect(n).not.toBeNull();
    expect(n?.rangeTotal).toBeNull();
    expect(n?.analyzed).toBe(500);
  });

  it("窓の大きさを 500 で決め打ちしていない", () => {
    /* limit は API の引数で変わる。画面に 500 と書くと嘘になる */
    const n = truncationNotice(
      counts({ matched: 900, analyzed: 200, truncated: true }),
    );
    expect(n?.analyzed).toBe(200);
  });
});

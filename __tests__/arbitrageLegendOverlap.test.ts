import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 物件検索の地図は、右側に**上から伸びるもの**（操作の列）と
 * **下から伸びるもの**（方位の吉凶の凡例）を同時に置いている。
 * 用途地域の凡例（13 区分）を列の末尾に足したところ、画面が短いときに
 * 列が下の凡例へ被さった（利用者の指摘、実機の画面）。
 *
 * 見張るのは 2 つ。
 *
 *   1. 凡例を出しているあいだ、列は下の凡例のぶんを空ける
 *   2. スクロールする器を入れ子にしない（どちらが動くのか分からなくなる）
 *
 * 字面で見るのは、この重なりが**描かないと分からない種類の崩れ**で、
 * jsdom には高さが無いため。同じ理由で mapStackingContext も字面で見て
 * いる。
 */

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "components", "ArbitrageMapInner.tsx"),
  "utf-8",
);

describe("右側の凡例が重ならない", () => {
  it("用途地域の凡例を出すあいだ、操作の列は下の凡例のぶんを空ける", () => {
    expect(SRC).toContain("max-h-[max(8rem,calc(100%-17rem))]");
  });

  it("器が低くても列が消えない（負の calc を max() で止める）", () => {
    /* max() を外すと calc が負になり、max-height: 0 に丸められて
       列ごと見えなくなる。下限があることを固定する */
    const reserved = SRC.match(/max-h-\[max\(([^,]+),calc\(100%-[^)]+\)\)\]/);
    expect(reserved?.[1]).toBe("8rem");
  });

  it("用途地域の凡例の器に、列とは別のスクロールを持たせない", () => {
    const legendWrapper = SRC.match(/<div className="w-56[^"]*"/);
    expect(legendWrapper).not.toBeNull();
    expect(legendWrapper?.[0]).not.toContain("overflow-y-auto");
    expect(legendWrapper?.[0]).not.toContain("max-h-");
  });
});

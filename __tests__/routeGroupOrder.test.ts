import { describe, expect, it } from "vitest";
import { CORE_ROUTES, ROUTE_GROUPS } from "@/lib/siteStructure";

/**
 * 群の並び順。**サイドバーとホームはここだけを見る。**
 *
 * 「いつ」を先に出す（利用者の指示、2026-09-06）。引越しは時期のほうが
 * 先に決まっていることが多く、方位はその中から選ぶ。名前の並びが
 * 「どこへ・いつ・いくら」なのは問いの言い回しで、開く順とは別。
 *
 * 順序は見た目の話なので、変えても型検査にも他の検査にも出ない。
 * **戻したときに気付けるように**ここで固定する。
 */
describe("群の並び", () => {
  it("いつ → どこへ → いくら の順", () => {
    expect(ROUTE_GROUPS.map((g) => g.key)).toEqual([
      "timing",
      "direction",
      "market",
    ]);
  });

  it("すべての中核ルートが、どれかの群に入っている", () => {
    const keys = new Set(ROUTE_GROUPS.map((g) => g.key));
    const orphans = CORE_ROUTES.filter((r) => !keys.has(r.group));
    expect(orphans.map((r) => r.href)).toEqual([]);
  });

  it("空の群を作らない（見出しだけ出て中身が無い状態にしない）", () => {
    for (const g of ROUTE_GROUPS) {
      expect(
        CORE_ROUTES.filter((r) => r.group === g.key).length,
        `${g.label} が空`,
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * `CORE_ROUTES[0]` は**代表の入口**として名指しで使われている
 * （ホームの主ボタン、llms.txt の案内文）。群の並びを変えるついでに
 * この配列を並べ替えると、**出す先が黙って変わる。**
 */
describe("代表の入口", () => {
  it("先頭は「物件を方位で探す」のまま", () => {
    expect(CORE_ROUTES[0].href).toBe("/relocation/arbitrage");
  });
});

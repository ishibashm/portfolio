import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wedgeOutlineOnly, type WedgeUnderlay } from "@/lib/wedgeOverlay";

/**
 * 扇形の下に意味のある色があるときは、塗らずに境界線だけにする。
 *
 * ## なぜ（2026-09-05、利用者の要望）
 *
 * 「扇形を出したまま重ねられるようにしたい」「用途地域も見たい」
 *
 * 規則そのものは #147 からあった。下に別の意味の色があると 2 枚が
 * 混ざって読めなくなるので、塗りを外して境界線とラベルだけ残す。
 * ところが条件式が `ArbitrageMapInner` に直接書いてあり、**後から
 * 足した用途地域とハザードが入っていなかった。**
 *
 *     const outlineOnly = isOverview || showHeatmap;   // 旧
 *
 * 用途地域は 13 色、ハザードは浸水深の色で、どちらも扇形の 8 色と
 * 同じくらい強い。出すと **#147 が防ぐはずだった状態がそのまま
 * 起きていた。**
 */
const NONE: WedgeUnderlay = {
  isOverview: false,
  showHeatmap: false,
  zoningOn: false,
  hazardOn: false,
};

/** 旧実装。戻したら落ちることを示すために写してある。 */
const oldOutlineOnly = (u: WedgeUnderlay) => u.isOverview || u.showHeatmap;

describe("扇形の塗りを外す条件", () => {
  it("下に何も無ければ塗る", () => {
    expect(wedgeOutlineOnly(NONE)).toBe(false);
  });

  it("俯瞰と件数バブルでは境界線だけ（従来どおり）", () => {
    expect(wedgeOutlineOnly({ ...NONE, isOverview: true })).toBe(true);
    expect(wedgeOutlineOnly({ ...NONE, showHeatmap: true })).toBe(true);
  });

  it("用途地域とハザードでも境界線だけ（ここが直したところ）", () => {
    expect(wedgeOutlineOnly({ ...NONE, zoningOn: true })).toBe(true);
    expect(wedgeOutlineOnly({ ...NONE, hazardOn: true })).toBe(true);
  });

  it("旧実装に戻すと、用途地域とハザードを取りこぼす", () => {
    /* **これが言えないと、直したことにならない。**旧の規則では
       用途地域を出しても塗ったままで、色が 2 枚重なる。 */
    expect(oldOutlineOnly({ ...NONE, zoningOn: true })).toBe(false);
    expect(oldOutlineOnly({ ...NONE, hazardOn: true })).toBe(false);
    /* 俯瞰と件数バブルは旧でも新でも同じ（挙動を変えていない証拠） */
    for (const key of ["isOverview", "showHeatmap"] as const) {
      const u = { ...NONE, [key]: true };
      expect(oldOutlineOnly(u)).toBe(wedgeOutlineOnly(u));
    }
  });

  it("条件式を画面側に書き戻していない", () => {
    /* 条件を 2 か所に持つと、また層を足したときに片方だけ直る。
       画面側は lib の関数を呼ぶだけにする。 */
    const inner = readFileSync("src/components/ArbitrageMapInner.tsx", "utf8");
    expect(inner).toContain("wedgeOutlineOnly({");
    expect(/outlineOnly = isOverview \|\| showHeatmap/.test(inner)).toBe(false);
  });

  it("切り替えたときに扇形を描き直す（依存に入っている）", () => {
    /* useMemo の依存に足し忘れると、用途地域を出しても扇形が塗った
       ままになる。字面で固定する。 */
    const inner = readFileSync("src/components/ArbitrageMapInner.tsx", "utf8");
    const memo = inner.slice(
      inner.indexOf("const sectorLayers = useMemo("),
      inner.indexOf("if (!mounted)"),
    );
    expect(memo).toContain("zoningOn,");
    expect(memo).toContain("hazardTab,");
  });
});

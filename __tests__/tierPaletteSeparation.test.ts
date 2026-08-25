/**
 * 段階の色が隣どうし見分けられることを固定する。
 *
 * `docs/site-spec.md` 3.4 に、S と A が実測 ΔE 5.4（下限 15）で、
 * 文字ラベルの無い塗り（地図の扇形）では区別できなかった、と書いてある。
 * 直したあとも「色を変えるときは必ず検証スクリプトに掛ける」という規則
 * だけが残っていて、**掛ける先がリポジトリに無かった**（
 * `scripts/validate_palette.js` は履歴を遡っても存在しない）。
 *
 * 規則を人手に頼らず、ここで自動的に回す。
 *
 * 見るのは隣り合う段だけ。段階は順序があるので、離れた段は元々別の色に
 * なっている。「大吉と吉が同じ色に見える」が起きるのは常に隣どうし。
 */
import { describe, expect, it } from "vitest";

import {
  CVD_DELTA_E_FLOOR,
  NORMAL_DELTA_E_FLOOR,
  checkAdjacent,
  deltaE,
} from "@/lib/paletteChecks";
import { TIER_FILL, TIER_BORDER } from "@/utils/tierDisplay";

/** 良いほうから悪いほうへ並べた段階。色の検査はこの順で見る。 */
const TIER_ORDER = ["S", "A", "B", "C", "D", "X"] as const;

const fills = TIER_ORDER.map((t) => TIER_FILL[t]);
const borders = TIER_ORDER.map((t) => TIER_BORDER[t]);

describe("段階の塗りは隣どうし見分けられる", () => {
  it("通常の視覚で ΔE 15 以上、色覚多様性で 8 以上", () => {
    const bad = checkAdjacent(fills)
      .map((c, i) => ({ ...c, pair: `${TIER_ORDER[i]}→${TIER_ORDER[i + 1]}` }))
      .filter((c) => !c.ok)
      .map(
        (c) =>
          `${c.pair} ${c.from}→${c.to} 通常=${c.normal.toFixed(1)} 色覚=${c.cvd.toFixed(1)}`,
      );
    expect(bad).toEqual([]);
  });

  /**
   * 空回りするテストにしないための固定。
   *
   * site-spec に載っている**直す前の**S と A（緑と青緑）を入れると落ちる。
   * ここが落ちなくなったら、この検査は何も見ていない。
   */
  it("直す前の S / A の組は下限を割る", () => {
    // #10b981（emerald-500）と #14b8a6（teal-500）。site-spec 3.4 の実測 5.4
    const before = deltaE("#10b981", "#14b8a6");
    expect(before).toBeLessThan(NORMAL_DELTA_E_FLOOR);
    expect(before).toBeCloseTo(5.4, 0);
  });

  /**
   * ピンの縁取りは**いまは下限を割っている。直さずに現状を固定する**
   * （#548 と同じ扱い）。
   *
   * site-spec 3.4 は「塗りだけ直すとピンの縁とバッジが取り残される」と
   * 書いていて、まさにその取り残しが残っている。とくに D（凶）と
   * X（大凶）は ΔE 3.4 で、**縁だけを見ると同じ色**。
   *
   * ただし縁は必ず塗りと重なって描かれ、塗りのほうは下限を満たしている
   * ので、「凶と大凶が見分けられない」まではいかない。直すと地図の
   * ピン・凡例・バッジの見え方が変わるため、判定の見え方を変える手順
   * （CLAUDE.md 3 節）を踏んで別に出す。
   *
   * ここに数字を残しておくと、直したときに何がどう変わったかを
   * この差分で示せる。
   */
  it("ピンの縁取りの現状（下限を割っている組がある）", () => {
    const measured = checkAdjacent(borders).map(
      (c, i) =>
        `${TIER_ORDER[i]}→${TIER_ORDER[i + 1]} 通常=${c.normal.toFixed(1)} 色覚=${c.cvd.toFixed(1)}`,
    );
    expect(measured).toEqual([
      "S→A 通常=17.4 色覚=17.0",
      "A→B 通常=7.9 色覚=7.7",
      "B→C 通常=12.3 色覚=6.3",
      "C→D 通常=11.5 色覚=7.5",
      "D→X 通常=3.4 色覚=1.6",
    ]);
  });

  /**
   * 下限そのものが動いていないことも見ておく。閾値を下げて通すのは
   * 「色を直した」ではなく「検査をやめた」なので、変えるなら意図的に。
   */
  it("下限は 15 / 8", () => {
    expect(NORMAL_DELTA_E_FLOOR).toBe(15);
    expect(CVD_DELTA_E_FLOOR).toBe(8);
  });
});

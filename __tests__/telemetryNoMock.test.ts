import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 履歴のグラフ（6. 履歴タブ）が数字を作らないこと。
 *
 * 以前は /api/telemetry/history が空を返すか失敗すると、**黙って
 * Math.random() の作り物に差し替えて描いていた**。画面には作り物である
 * ことが一切出ず、利用者は自分の記録として乱数のグラフを見ていた。
 * 九星（yearStar / monthStar / dayStar）まで乱数だったので、明らかに
 * 嘘の数字が出ていた。CSV の書き出しも同じ乱数をそのまま出すため、
 * 手元に作り物のデータが残る状態だった。
 *
 * 「見方が分からない」という指摘で見つかった。読み方の説明が無いのも
 * 問題だったが、そもそも意味のあるものが描かれていなかった。
 *
 * 同じことが再発しないよう、**表示側が乱数を持たないこと**を固定する。
 * 記録が無いときは「無い」と出す（空と失敗を別の文言で出す）。
 */

const SRC = readFileSync(
  join(process.cwd(), "src", "components", "TelemetryChart.tsx"),
  "utf8",
);

/**
 * 注釈を落とした本体。**経緯を書いた注釈で引っかからないようにする。**
 * 何が起きたかは残しておきたいので、消すのではなく検査の側で外す。
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("履歴のグラフ", () => {
  it("乱数を持っていない（記録の代わりに数字を作らない）", () => {
    expect(CODE).not.toContain("Math.random");
  });

  it("作り物への差し替えが残っていない", () => {
    expect(CODE).not.toContain("mockData");
    expect(CODE.toLowerCase()).not.toContain("fallback to full mock");
  });

  it("記録が無いときと取れなかったときを分けている", () => {
    // 同じ文言にすると、巡回が止まっているのか単に貯まっていないのか
    // 利用者にも運用側にも分からない。
    expect(SRC).toContain('"empty"');
    expect(SRC).toContain('"error"');
    expect(SRC).toContain("まだ記録がありません");
    expect(SRC).toContain("記録を読み込めませんでした");
  });

  it("読み込めていないときにグラフと書き出しを出さない", () => {
    // 空のグラフと、空の CSV 書き出しの釦だけが残る状態を避ける。
    expect(SRC).toContain('if (phase !== "ready")');
  });
});

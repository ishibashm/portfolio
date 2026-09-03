import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * 「検索を止めている」ことを画面に出す。
 *
 * ## なぜ
 *
 * 県も半径も未指定でズーム 10 未満のとき、fetchData は要求を投げずに
 * 戻る。全国 45 万行の名寄せ（実測 18.4 秒）を避けるための意図した
 * 打ち切りだが、**その事実が画面のどこにも出ていなかった。**
 *
 * 利用者の報告：「俯瞰からズームしていくのですが、物件が表示されず
 * 0 のままのことが多々ある」。俯瞰（ズーム 5）から段階的に拡大すると、
 * ズーム 10 を越えるまでは検索が走らないので、0 件に見える。**0 件
 * なのではなく、検索していない。**
 *
 * 直したのは伝え方と逃げ道だけで、**判定も検索の条件も変えていない。**
 *
 * - 止めているあいだは理由を出す
 * - それでも検索したい人のために、打ち切りを飛ばす口（force）を置く
 *
 * ## 何を見るか
 *
 * 画面の文言そのものではなく、**壊れると黙って戻る 3 点**を見る。
 * 打ち切りの条件と表示の条件が食い違うと、また「理由の無い 0 件」に
 * 戻るので、両方が同じ 4 つの条件で書かれていることも見る。
 */
const PAGE = readFileSync(
  join(__dirname, "../src/app/relocation/arbitrage/page.tsx"),
  "utf8",
);

describe("俯瞰で検索を止めているとき、その理由を出す", () => {
  it("fetchData は force で打ち切りを飛ばせる", () => {
    expect(PAGE).toMatch(
      /const fetchData = async \(isDateChange = false, force = false\)/,
    );
    /* 打ち切りの入口に !force が無いと、押しても何も起きない */
    expect(PAGE).toMatch(/if \(\s*!force &&\s*prefecture === "all" &&/);
  });

  it("止めている状態を画面へ出す派生値がある", () => {
    expect(PAGE).toMatch(/const scanPaused =/);
    /* 打ち切りと同じ 4 条件。どちらかだけ変えると食い違う */
    expect(PAGE).toMatch(
      /const scanPaused =\s*prefecture === "all" &&\s*radiusKm === "all" &&\s*mapBounds !== null &&\s*mapBounds\.zoom < 10;/,
    );
  });

  it("止めているあいだ、理由と検索の口を描く", () => {
    expect(PAGE).toMatch(/\{scanPaused && !loading && \(/);
    expect(PAGE).toContain("この倍率では物件を検索していません");
    /* 逃げ道。force を渡していないと打ち切られて何も起きない */
    expect(PAGE).toMatch(/onClick=\{\(\) => fetchData\(false, true\)\}/);
  });

  it("打ち切りの条件そのものは変えていない（負荷を上げない）", () => {
    /* 全国 45 万行の走査に落ちる組み合わせは今までどおり止める。
       force を渡すのは利用者が明示的に押したときだけ */
    expect(PAGE).toMatch(
      /mapBounds\.zoom < 10\s*\)\s*\{\s*setLoading\(false\)/,
    );
    /* force を渡している呼び出し（第 2 引数がある形）は 1 か所だけ。
       fetchData(true) は日付変更の呼び出しなので数えない */
    const forced = PAGE.match(/fetchData\([^)]*,\s*true\)/g) ?? [];
    expect(forced).toEqual(["fetchData(false, true)"]);
  });
});

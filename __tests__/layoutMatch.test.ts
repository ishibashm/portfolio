import { describe, expect, it } from "vitest";

import {
  expandLayoutSelection,
  expandLayoutSelections,
  matchesLayoutSelection,
} from "@/lib/layoutMatch";

/**
 * 間取りの一致。
 *
 * 変更前は選択値の部分一致そのままで、`2LDK` を選ぶと `2SLDK`（納戸つき）が
 * 落ちていた。納戸があるだけで居室の数は同じなので、候補から外れる理由が
 * 無い。「S 無しを選んだら S 付きも含める」の一方向だけ広げる。
 *
 * 逆向き（`2SLDK` を選んで `2LDK` を拾う）はしない。「納戸あり」を指定
 * したのに無い物件が混ざる。下の 2 件がその境目を押さえている。
 */
describe("expandLayoutSelection", () => {
  it("S 無しを選んだら S 付きも突き合わせる", () => {
    expect(expandLayoutSelection("2LDK")).toEqual(["2LDK", "2SLDK"]);
    expect(expandLayoutSelection("1DK")).toEqual(["1DK", "1SDK"]);
    expect(expandLayoutSelection("3K")).toEqual(["3K", "3SK"]);
  });

  it("ワンルームは広げない。納戸つきの表記が無い", () => {
    expect(expandLayoutSelection("1R")).toEqual(["1R"]);
  });

  it("既に S 付きなら広げない。狭い側へは寄せない", () => {
    expect(expandLayoutSelection("2SLDK")).toEqual(["2SLDK"]);
  });

  it("小文字・前後の空白を揃える", () => {
    expect(expandLayoutSelection(" 2ldk ")).toEqual(["2LDK", "2SLDK"]);
  });

  it("読めない値はそのまま 1 つとして扱う", () => {
    expect(expandLayoutSelection("メゾネット")).toEqual(["メゾネット"]);
    expect(expandLayoutSelection("")).toEqual([]);
  });

  it("重複は畳む", () => {
    expect(expandLayoutSelections(["2LDK", "2SLDK"])).toEqual([
      "2LDK",
      "2SLDK",
    ]);
  });
});

describe("matchesLayoutSelection", () => {
  it("2LDK を選ぶと 2SLDK も当たる（変更したところ）", () => {
    expect(matchesLayoutSelection("2SLDK", ["2LDK"])).toBe(true);
    expect(matchesLayoutSelection("2LDK", ["2LDK"])).toBe(true);
  });

  it("2SLDK を選んだら 2LDK は当たらない", () => {
    expect(matchesLayoutSelection("2LDK", ["2SLDK"])).toBe(false);
  });

  it("居室の数が違うものは当たらない", () => {
    expect(matchesLayoutSelection("3LDK", ["2LDK"])).toBe(false);
    expect(matchesLayoutSelection("1LDK", ["2LDK"])).toBe(false);
  });

  it("部分一致のまま。前方一致にすると表記ゆれを落とす", () => {
    expect(matchesLayoutSelection("ワンルーム2LDK", ["2LDK"])).toBe(true);
  });

  it("選択が空なら全部通す", () => {
    expect(matchesLayoutSelection("2LDK", [])).toBe(true);
    expect(matchesLayoutSelection(null, [])).toBe(true);
  });

  it("間取りが未取得の物件は、選択があるときは落とす", () => {
    expect(matchesLayoutSelection(null, ["2LDK"])).toBe(false);
    expect(matchesLayoutSelection("", ["2LDK"])).toBe(false);
  });
});

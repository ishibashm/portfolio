import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { emptyDirections, findArea } from "@/lib/areaContent";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";

/**
 * 手書きの文章が「市区町村がありません」と言う方位は、**本当に 1 つも
 * 無い**か。
 *
 * ## なぜ要るか（2026-08-31 に実際に起きた）
 *
 * 長崎市の文章は「西・南西・南には市区町村がありません」と書いていた。
 * ところが**南西には 17 ある**（いちばん近い沖縄県名護市で 710km）。
 * 一覧は 5〜150km で切っているので、頁の表からは消えるが「無い」の
 * ではない。
 *
 * 同じ頁で自動表示（#790）は「150km 以内に市区町村が無い方位: 南西」と
 * 出すので、**同じ画面の中で 2 つの記述が食い違っていた。**
 *
 * ## この検査の範囲
 *
 * 「〜には市区町村がありません」「〜には市区町村が 1 つもありません」と
 * 断定している方位だけを見る。「薄い」「数えるほど」のような程度の
 * 表現は数えない（そこまで機械で判定しない）。
 */

/** 「◯・◯には市区町村がありません」の形から方位を取り出す。 */
function assertedEmptyDirections(text: string): string[] {
  const found = new Set<string>();
  /* 「西と南」「西・南西・南」「西、南」のどれでも拾う。区切りを
     1 つしか見ていなかったせいで、下の自己検査が空振りを検出した。 */
  const pattern =
    /([北南東西・、と]+)には市区町村が(?:\s*1\s*つも)?ありません/g;
  for (const m of text.matchAll(pattern)) {
    for (const jp of m[1].split(/[・、と]/)) {
      const dir = (
        Object.keys(DIRECTION_LABELS) as (keyof typeof DIRECTION_LABELS)[]
      ).find((d) => DIRECTION_LABELS[d] === jp);
      if (dir) found.add(dir);
    }
  }
  return [...found];
}

describe("手書きの「市区町村がありません」は実測と合っているか", () => {
  it("断定している方位は、どの距離にも 1 つも無い", () => {
    const wrong: string[] = [];

    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      const area = findArea(code);
      if (!area) continue;
      /* hasBeyondRange が true ＝ 遠くにはある＝「ありません」は言い過ぎ */
      const farOnly = new Set(
        emptyDirections(area)
          .filter((e) => e.hasBeyondRange)
          .map((e) => e.direction),
      );

      for (const paragraph of editorial.intro) {
        for (const dir of assertedEmptyDirections(paragraph)) {
          if (farOnly.has(dir as never)) {
            wrong.push(`${code} ${area.full}: ${dir}`);
          }
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it("取り出しの規則が働いている（空振りしていない）", () => {
    expect(
      assertedEmptyDirections("西と南には市区町村が 1 つもありません。"),
    ).toEqual(expect.arrayContaining(["W", "S"]));
    expect(
      assertedEmptyDirections("西・南西・南には市区町村がありません。"),
    ).toEqual(expect.arrayContaining(["W", "SW", "S"]));
  });
});

import { describe, it, expect } from "vitest";
import {
  parseDirectionFilterMode,
  filterCollisionByMode,
  calculateVectorCollision,
  generateBoard,
  type DirectionFilterMode,
} from "@/utils/ephemerisEngine";

/**
 * 絞り込みの見方（directionFilterMode）の受け取り方。
 *
 * ## 直す前がどうなっていたか
 *
 * 問い合わせ文字列や設定ファイルの値を**検証せずに**エンジンへ流していた。
 * `filterCollisionByMode` は composite / personal_kigaku / personal_bazi を
 * 名前で見て、**残り全部を environmental として扱う。**つまり:
 *
 *   ?directionFilterMode 無し    → composite（絞り込みなし）
 *   ?directionFilterMode=xyz     → environmental（環境の凶だけ残す）
 *
 * **無いときと壊れているときで別の答えが出ていた。**下の「旧挙動」の
 * テストがこれを写してある。`parseDirectionFilterMode` を素通し
 * （`raw ?? "composite"` だけ）に戻すと、その次のテストが落ちる。
 */

/** 直す前の受け取り方。文字列をそのまま流していた。 */
function legacyParse(raw: string | null): string {
  return raw || "composite";
}

describe("parseDirectionFilterMode", () => {
  const valid: DirectionFilterMode[] = [
    "composite",
    "personal_kigaku",
    "personal_bazi",
    "environmental",
  ];

  it("正しい値はそのまま返す（旧挙動と一致する）", () => {
    for (const mode of valid) {
      expect(parseDirectionFilterMode(mode)).toBe(mode);
      expect(parseDirectionFilterMode(mode)).toBe(legacyParse(mode));
    }
  });

  it("無いときは composite", () => {
    expect(parseDirectionFilterMode(null)).toBe("composite");
    expect(parseDirectionFilterMode(undefined)).toBe("composite");
    expect(parseDirectionFilterMode("")).toBe("composite");
  });

  it("知らない値は composite。**ここが旧挙動と変わる**", () => {
    const broken = [
      "xyz",
      "COMPOSITE",
      "personal",
      "environmental ",
      "composite,personal_bazi",
      "0",
      "null",
      "undefined",
      "__proto__",
    ];
    for (const raw of broken) {
      expect(parseDirectionFilterMode(raw)).toBe("composite");
      // 旧実装はこれをそのまま流していた
      expect(legacyParse(raw)).toBe(raw);
    }
  });
});

describe("知らない値の扱いが、受け取り口とエンジンで揃っている", () => {
  /*
    ## 以前

    `parseDirectionFilterMode` は知らない値を composite に落とすのに、
    **エンジンの側は environmental の枝に落としていた。**名前で 3 分岐
    して「残り全部」を environmental にしていたためで、受け取り口を
    通さずに文字列が届くと、値が無いときと壊れているときで別の答えに
    なるという筋の通らない状態だった。

    ## いま

    エンジンは名前ではなく**層**（本命星・環境方位・天中殺）で分岐し、
    知らない値は 3 層すべて＝ composite（素通し）に落ちる。受け取り口と
    同じ規則になったので、どちらを通っても答えが一致する。

    実際の経路はすべて parseDirectionFilterMode を通るので、ここは
    「万一素の文字列が届いても筋が通る」ことの固定。
  */
  const date = new Date("2026-08-23T12:00:00+09:00");
  /* 盤は中央星から決まる。年・月・日で別の盤を使う。 */
  const yearBoard = generateBoard(3);
  const monthBoard = generateBoard(7);
  const dayBoard = generateBoard(5);

  function finalFor(mode: string) {
    const collision = calculateVectorCollision(
      3,
      yearBoard,
      monthBoard,
      dayBoard,
      ["午", "未"],
      null,
      "MIGRATION",
      date,
      135.7,
    );
    return filterCollisionByMode(
      collision,
      3,
      null,
      ["午", "未"],
      mode as DirectionFilterMode,
      yearBoard,
      monthBoard,
      dayBoard,
    ).finalVectors;
  }

  it("壊れた値は composite と同じ答えになる（受け取り口と揃う）", () => {
    expect(finalFor("xyz")).toEqual(finalFor("composite"));
  });

  it("environmental とは別の答えになる（勝手に凶だけの見方へ倒さない）", () => {
    /* ここが旧挙動との違い。倒していたころは一致していた */
    expect(finalFor("xyz")).not.toEqual(finalFor("environmental"));
  });
});

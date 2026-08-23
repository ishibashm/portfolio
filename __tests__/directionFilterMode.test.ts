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

describe("知らない値が environmental として扱われていたこと", () => {
  /*
    上の「筋が通らない」が言葉だけにならないよう、エンジンの側でも
    固定しておく。壊れた文字列をそのまま渡すと、composite（素通し）
    ではなく environmental の枝に落ちる。
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

  it("壊れた値をそのまま渡すと environmental と同じ答えになる", () => {
    expect(finalFor("xyz")).toEqual(finalFor("environmental"));
  });

  it("composite とは別の答えになる（＝素通しではない）", () => {
    // composite は絞り込まずに元の判定をそのまま返す。
    expect(finalFor("xyz")).not.toEqual(finalFor("composite"));
  });
});

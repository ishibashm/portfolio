import { describe, it, expect } from "vitest";
import {
  parseActionIntent,
  calculateVectorCollision,
  generateBoard,
  type ActionIntent,
} from "@/utils/ephemerisEngine";

/**
 * 用途（actionIntent）の受け取り方。
 *
 * ## directionFilterMode（#540）とは性質が違う
 *
 * あちらは**知らない値の扱いが変わった**（environmental → composite）。
 * こちらは**変わらない。**判定はどこも `=== "REST"` / `=== "BUSINESS"` /
 * `=== "MIGRATION"` で見ていて、それ以外は暗黙の else に落ちる。つまり
 * 知らない文字列は**今も DEFAULT と同じ扱い**になっている。型を付けて
 * それを明示するだけで、答えは動かない。
 *
 * 下の「エンジン側」のテストがその裏付け。
 */
describe("parseActionIntent", () => {
  const valid: ActionIntent[] = ["DEFAULT", "REST", "BUSINESS", "MIGRATION"];

  it("正しい値はそのまま返す", () => {
    for (const intent of valid) {
      expect(parseActionIntent(intent)).toBe(intent);
    }
  });

  it("知らない値は DEFAULT", () => {
    for (const raw of ["TRAVEL", "migration", "xyz", "0", "__proto__"]) {
      expect(parseActionIntent(raw)).toBe("DEFAULT");
    }
  });

  it("値が無いときの既定は呼ぶ側が決める", () => {
    // 一覧は MIGRATION、履歴は DEFAULT を既定にしている。
    expect(parseActionIntent(null)).toBe("DEFAULT");
    expect(parseActionIntent(null, "MIGRATION")).toBe("MIGRATION");
    expect(parseActionIntent(undefined, "MIGRATION")).toBe("MIGRATION");
    expect(parseActionIntent("", "MIGRATION")).toBe("MIGRATION");
  });

  it("知らない値は既定に落とさない。**DEFAULT に落とす**", () => {
    /*
      ここを一緒にすると、壊れた値が MIGRATION に化けて答えが変わる。
      いまのエンジンは知らない値を DEFAULT として扱っているので、
      それに合わせないと挙動が動く。
    */
    expect(parseActionIntent("TRAVEL", "MIGRATION")).toBe("DEFAULT");
  });
});

describe("エンジンは知らない用途を DEFAULT として扱っている", () => {
  const date = new Date("2026-08-23T12:00:00+09:00");
  const yearBoard = generateBoard(3);
  const monthBoard = generateBoard(7);
  const dayBoard = generateBoard(5);

  function finalFor(intent: string) {
    return calculateVectorCollision(
      3,
      yearBoard,
      monthBoard,
      dayBoard,
      ["午", "未"],
      null,
      intent as ActionIntent,
      date,
      135.7,
    ).finalVectors;
  }

  it("知らない用途は DEFAULT と同じ答えになる", () => {
    expect(finalFor("TRAVEL")).toEqual(finalFor("DEFAULT"));
    expect(finalFor("xyz")).toEqual(finalFor("DEFAULT"));
  });

  it("MIGRATION とは別の答えになる（＝用途は効いている）", () => {
    expect(finalFor("DEFAULT")).not.toEqual(finalFor("MIGRATION"));
  });
});

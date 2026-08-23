import { describe, it, expect } from "vitest";
import {
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
} from "@/utils/ephemerisEngine";

/**
 * 立春をまたぐときの年盤・月盤・日盤。
 *
 * ## なぜこのテストがあるか
 *
 * `scripts/verify_kyusei.ts` / `verify_month.ts` / `debug_month.ts` の 3 本が
 * 同じことを `console.log` で確かめていた。3 本とも**存在しないモジュール**
 * （`../src/lib/kyusei`）を import していて、走らせた瞬間に落ちる状態で
 * 放置されていた（`scripts/` は tsconfig の exclude に入っていて、
 * `tsc --noEmit` にも CI にも見えていなかった）。
 *
 * 中身の期待値は利用者が確かめたもので、**今のエンジンもその通りに出す。**
 * 消す前にテストへ写して、走る形にした。
 */
describe("立春をまたぐ盤", () => {
  const jst = (s: string) => new Date(s);

  it("2026-01-31 は日盤が六白金星（旧 verify_kyusei.ts の期待値）", () => {
    expect(getClassicalDayStar(jst("2026-01-31T12:00:00+09:00"))).toBe(6);
  });

  it("2026-01-31 は月盤が九紫火星（旧 verify_month.ts の期待値）", () => {
    expect(getClassicalMonthStar(jst("2026-01-31T12:00:00+09:00"))).toBe(9);
  });

  it("立春の前後で年盤が変わる（旧 debug_month.ts が見ていたもの）", () => {
    // 2026 年の立春は 2 月 4 日。その前日は前の年の盤。
    expect(getClassicalYearStar(jst("2026-02-01T12:00:00+09:00"))).toBe(2);
    expect(getClassicalYearStar(jst("2026-02-05T12:00:00+09:00"))).toBe(1);
  });

  it("立春の前後で月盤も変わる", () => {
    expect(getClassicalMonthStar(jst("2026-02-01T12:00:00+09:00"))).toBe(9);
    expect(getClassicalMonthStar(jst("2026-02-05T12:00:00+09:00"))).toBe(8);
  });
});

/**
 * **年盤と月盤で切り替わる時刻が違う。**
 *
 * 立春は「年の境目」であると同時に「寅月の節入り」でもあるので、本来は
 * 同じ瞬間に両方が変わるはず。ところが実装は別々の基準で動いている。
 *
 *   年盤 … lunar-javascript の `getYearNineStar()`。**立春の日の 0 時**
 *   月盤 … 太陽黄経が 315 度を越えた**瞬間**
 *
 * 実測（2020〜2030 年）のずれは **248 分〜1,439 分**（4〜24 時間）。
 *
 *   2026  年盤 02-04 00:00 JST / 月盤 02-04 05:01 JST  → 302 分
 *   2021  年盤 02-03 00:00 JST / 月盤 02-03 23:58 JST  → 1,439 分
 *
 * この間、**年盤は新しい年なのに月盤はまだ前の節月**になる。
 *
 * どちらに揃えるかは決めごと（日単位か時刻単位か）で、直すと利用者の
 * 答えが変わる。**いまの挙動をここに固定しておく。**揃える PR を出す
 * ときは、このテストが落ちることが「何を変えたか」の説明になる。
 */
describe("年盤と月盤で切り替わる時刻が違う（現状の固定）", () => {
  it("2026-02-04 の 2 時は、年盤が新年・月盤が前の節月", () => {
    const inGap = new Date("2026-02-04T02:00:00+09:00");
    expect(getClassicalYearStar(inGap)).toBe(1); // 立春を過ぎた扱い
    expect(getClassicalMonthStar(inGap)).toBe(9); // まだ丑月の盤
  });

  it("同じ日の 12 時には月盤も切り替わっている", () => {
    const after = new Date("2026-02-04T12:00:00+09:00");
    expect(getClassicalYearStar(after)).toBe(1);
    expect(getClassicalMonthStar(after)).toBe(8);
  });
});

import { describe, it, expect } from "vitest";
import { Solar } from "lunar-javascript";
import {
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  AstroEngine,
} from "@/utils/ephemerisEngine";
import { getZonedDateTimeFields } from "@/utils/solarTime";

/**
 * 立春をまたぐときの年盤・月盤・日盤。
 *
 * ## なぜこのテストがあるか
 *
 * `scripts/verify_kyusei.ts` / `verify_month.ts` / `debug_month.ts` の 3 本が
 * 同じことを `console.log` で確かめていた。3 本とも存在しないモジュールを
 * import していて、走らせた瞬間に落ちる状態だった（#548 でテストに写した）。
 *
 * その過程で**年盤と月盤で切り替わる時刻が違う**ことが分かり、利用者の
 * 判断で**時刻単位に揃えた**。下の「新旧の差」がその記録。
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
    expect(getClassicalYearStar(jst("2026-02-01T12:00:00+09:00"))).toBe(2);
    expect(getClassicalYearStar(jst("2026-02-05T12:00:00+09:00"))).toBe(1);
  });

  it("立春の前後で月盤も変わる", () => {
    expect(getClassicalMonthStar(jst("2026-02-01T12:00:00+09:00"))).toBe(9);
    expect(getClassicalMonthStar(jst("2026-02-05T12:00:00+09:00"))).toBe(8);
  });
});

/**
 * 直す前の年盤。日付をそのまま lunar-javascript に渡していた。
 * あちらは**立春の日の 0 時**で年を切り替える（日単位）。
 */
function legacyClassicalYearStar(date: Date): number {
  const f = getZonedDateTimeFields(date, 9);
  const solar = Solar.fromYmdHms(
    f.year,
    f.month,
    f.day,
    f.hours,
    f.minutes,
    f.seconds,
  );
  return solar.getLunar().getYearNineStar().getIndex() + 1;
}

/** 条件が false→true に変わる時刻を分単位まで詰める。 */
function flipMoment(lo: number, hi: number, pred: (t: number) => boolean) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (pred(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

describe("年盤を節入りの時刻で切り替える（#548 の判断 B）", () => {
  it("立春の日以外では新旧が一致する", () => {
    /*
      変えたのは「立春の日の切り替わり時刻」だけで、それ以外の日の答えは
      1 つも動かない。ここが崩れたら、意図した範囲を超えて変えている。
    */
    let compared = 0;
    for (let y = 1950; y <= 2050; y++) {
      for (const md of ["01-01", "03-15", "06-01", "09-10", "12-20"]) {
        const d = new Date(`${y}-${md}T12:00:00+09:00`);
        expect(getClassicalYearStar(d)).toBe(legacyClassicalYearStar(d));
        compared++;
      }
    }
    expect(compared).toBe(505);
  });

  it("立春の日は新旧が食い違う。**ここが変えたところ**", () => {
    // 2026 年の節入りは 2 月 4 日 05:01 JST。その前は前年の盤。
    const before = new Date("2026-02-04T02:00:00+09:00");
    expect(legacyClassicalYearStar(before)).toBe(1); // 旧: 日付が立春なら新年
    expect(getClassicalYearStar(before)).toBe(2); // 新: 節入り前なので前年
  });

  it("節入りの瞬間をまたぐと切り替わる", () => {
    const t = (s: string) => new Date(`2026-02-04T${s}:00+09:00`);
    // 黄経 315 度を越えるのは 05:01 JST（AstroEngine の実測）。
    expect(AstroEngine.getSolarLongitude(t("05:00"))).toBeLessThan(315);
    expect(AstroEngine.getSolarLongitude(t("06:00"))).toBeGreaterThan(315);

    expect(getClassicalYearStar(t("05:00"))).toBe(2);
    expect(getClassicalYearStar(t("06:00"))).toBe(1);
  });

  it("年盤と月盤が同じ瞬間に切り替わる（2020〜2035 年）", () => {
    /*
      これが本題。以前は年盤が「立春の日の 0 時」、月盤が「節入りの瞬間」で
      切り替わり、実測で 248〜1,439 分ずれていた。同じ出来事なので揃える。

      **2030 → 2035 に広げた**（2026-08-31 の監査）。境界を二分探索で
      実際に出したところ、16 年ぶん**すべて差 0.0 分**で、4 年周期の形
      （毎年およそ 5 時間 50 分ずつ遅れ、閏年で 1 日戻る）も崩れていない。

          2020 02/04 18:03   2024 02/04 17:26   2028 02/04 16:31
          2021 02/03 23:58   2025 02/03 23:10   2029 02/03 22:20
          2022 02/04 05:50   2026 02/04 05:01   2030 02/04 04:08
          2023 02/04 11:42   2027 02/04 10:46   2031 02/04 09:58

      成り立っている範囲を狭く固定しておく理由が無いので、確かめた
      ぶんだけ広げる。年盤の期限（yearBoardValidUntil）が先の年を
      指すようになったときに、ここが先に落ちる。
    */
    for (let y = 2020; y <= 2035; y++) {
      const lo = Date.parse(`${y}-02-02T00:00:00+09:00`);
      const hi = Date.parse(`${y}-02-06T00:00:00+09:00`);
      const yearBefore = getClassicalYearStar(new Date(lo));
      const monthBefore = getClassicalMonthStar(new Date(lo));

      const yearFlip = flipMoment(
        lo,
        hi,
        (t) => getClassicalYearStar(new Date(t)) !== yearBefore,
      );
      const monthFlip = flipMoment(
        lo,
        hi,
        (t) => getClassicalMonthStar(new Date(t)) !== monthBefore,
      );

      // 分単位で一致していれば揃っている（二分探索の誤差を吸収する）
      expect(Math.abs(monthFlip - yearFlip)).toBeLessThan(60_000);
    }
  });

  it("本命星も節入りで決まる（立春の日に生まれた人）", () => {
    /*
      getClassicalYearStar は getHonmeiStar().classical の実装そのもの。
      **立春の日に生まれた人の本命星が変わる。**利用者の判断で時刻基準に
      揃えたので、その結果をここに固定しておく。
    */
    const cases: Array<[string, number, number]> = [
      // 生年月日時（JST）        旧（日単位）  新（時刻単位）
      ["2000-02-04T12:00:00+09:00", 9, 1],
      ["1990-02-04T01:00:00+09:00", 1, 2],
      ["1985-02-04T01:00:00+09:00", 6, 7],
    ];
    for (const [iso, legacy, now] of cases) {
      const d = new Date(iso);
      expect(legacyClassicalYearStar(d)).toBe(legacy);
      expect(getClassicalYearStar(d)).toBe(now);
    }
  });
});

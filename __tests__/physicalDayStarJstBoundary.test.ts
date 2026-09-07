import { describe, expect, it } from "vitest";
import { AstroTime, Ecliptic, GeoVector, Body } from "astronomy-engine";
import { getDayStar, getClassicalDayStar } from "@/utils/ephemerisEngine";

/**
 * 独自モデルの日盤（`getDayStar`）が**日本時間の日**で変わること。
 *
 * ## 何が起きていたか（2026-09-07 に実測）
 *
 * ユリウス日は**世界時の正午**で繰り上がる。素の日時をそのまま渡して
 * いたので、日盤が **21:00 JST** で翌日の星に変わっていた。
 *
 *     2026-09-07 20:59 JST   独自 3 / 古典 1
 *     2026-09-07 21:01 JST   独自 2 / 古典 1   ← 2 は 9/8 の値
 *
 * 古典の日盤は日本時間の日で変わる（#456）ので、**同じ画面の 2 つの盤が
 * 別の日を指す時間帯が毎晩 3 時間あった**。暦ではなく軌道計算の側に
 * 同じ間違いが残っていた形。
 *
 * ## 変わるのは 21〜24 時だけ
 *
 * 0〜21 時の答えは前と同じ。floor(JD) はその範囲では日本時間の正午と
 * 同じ値になる。下でそれを固定する。
 */

/** 直す前の実装。日時をそのまま軌道計算へ渡していた。 */
function legacyDayStar(date: Date): number {
  const jd = new AstroTime(date).ut + 2451545.0;
  const L0 = Ecliptic(GeoVector(Body.Sun, new AstroTime(date), true)).elon;
  const isYinPhase = L0 >= 90 && L0 < 270;
  const cycle = Math.floor(jd) % 9;
  let star = isYinPhase ? 9 - cycle : cycle + 1;
  if (star <= 0) star += 9;
  if (star > 9) star %= 9;
  if (star === 0) star = 9;
  return star;
}

const jst = (s: string) => new Date(`${s}+09:00`);

describe("独自モデルの日盤は日本時間の日で変わる", () => {
  it("1 日の中で変わらない（0 時から 23 時 59 分まで同じ）", () => {
    const day = "2026-09-07T";
    const noon = getDayStar(jst(`${day}12:00:00`));
    for (const h of [
      "00:00",
      "08:59",
      "09:01",
      "17:00",
      "20:59",
      "21:01",
      "23:59",
    ]) {
      expect(getDayStar(jst(`${day}${h}:00`)), h).toBe(noon);
    }
  });

  it("日付が変わると変わる", () => {
    const a = getDayStar(jst("2026-09-07T12:00:00"));
    const b = getDayStar(jst("2026-09-08T12:00:00"));
    expect(a).not.toBe(b);
  });

  it("旧実装は 21 時で翌日の星に飛んでいた（直したことの証拠）", () => {
    expect(legacyDayStar(jst("2026-09-07T20:59:00"))).toBe(3);
    expect(legacyDayStar(jst("2026-09-07T21:01:00"))).toBe(2);
    /* 21:01 に出ていた 2 は、翌日の値そのもの */
    expect(legacyDayStar(jst("2026-09-08T12:00:00"))).toBe(2);
    /* 直したあとは、その時間帯でもその日の星が出る */
    expect(getDayStar(jst("2026-09-07T21:01:00"))).toBe(3);
  });

  it("古典の日盤と同じ日で切り替わる", () => {
    /* 同じ画面に 2 つの盤が出るので、切り替わる時刻が違うと、
       毎晩 3 時間だけ別の日を指す */
    for (const h of ["20:59", "21:01", "23:59"]) {
      const d = jst(`2026-09-07T${h}:00`);
      const noon = jst("2026-09-07T12:00:00");
      expect(getDayStar(d), `独自 ${h}`).toBe(getDayStar(noon));
      expect(getClassicalDayStar(d), `古典 ${h}`).toBe(
        getClassicalDayStar(noon),
      );
    }
  });

  it("0〜21 時の答えは変えていない（1 年ぶんで突き合わせ）", () => {
    /* 直したのは日の切り方だけ。昼間の答えが動いていたら、
       それは別の変更が混ざったということ */
    let checked = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(Date.UTC(2026, 0, 1, 3, 0, 0) + i * 86400000);
      expect(getDayStar(d), d.toISOString()).toBe(legacyDayStar(d));
      checked++;
    }
    expect(checked).toBe(365);
  });

  it("21 時以降だけが変わる。1 年で 365 日ぶん", () => {
    let changed = 0;
    for (let i = 0; i < 365; i++) {
      /* 22:00 JST = 13:00 UTC */
      const d = new Date(Date.UTC(2026, 0, 1, 13, 0, 0) + i * 86400000);
      if (getDayStar(d) !== legacyDayStar(d)) changed++;
    }
    expect(changed).toBe(365);
  });
});

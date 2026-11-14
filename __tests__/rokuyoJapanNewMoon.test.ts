import { SearchMoonPhase } from "astronomy-engine";
import { Solar } from "lunar-javascript";
import { describe, expect, it } from "vitest";
import { getLunarDate, getRokuyo, ROKUYO } from "@/utils/lunar";
import { plainRokuyo } from "@/lib/rokuyoLabel";

/**
 * 六曜の旧暦は日本時間の朔で月を始める（2026-11-14）。
 *
 * 以前は lunar-javascript（中国の暦。朔を北京時間で日に丸める）の月日を
 * そのまま使っていた。朔が日本時間の 0〜1 時に来る月は、中国では前日が
 * 1 日になるので、**その月の全部の日の六曜が 1 つずれていた。**
 *
 * 見たいのは 3 つ。
 *   1. 外部の暦（日本）と照合した日が合うこと（旧実装では落ちる）
 *   2. 2000〜2040 年の全日で、変わったのは「朔が日本時間 0〜1 時の月」だけ
 *   3. 旧暦の日が 1〜30 に収まること
 */

/** 旧実装（2026-11-14 まで）の写し。 */
function oldRokuyo(date: Date): string {
  const f = new Date(date.getTime() + 9 * 3_600_000);
  const lunar = Solar.fromYmdHms(
    f.getUTCFullYear(),
    f.getUTCMonth() + 1,
    f.getUTCDate(),
    f.getUTCHours(),
    f.getUTCMinutes(),
    f.getUTCSeconds(),
  ).getLunar();
  const sum = Math.abs(lunar.getMonth()) + lunar.getDay();
  return ROKUYO[((sum % 6) + 6) % 6];
}

const noonJst = (iso: string) => new Date(`${iso}T12:00:00+09:00`);
const plain = (d: Date) => plainRokuyo(getRokuyo(d));

describe("日本の暦と照合した日", () => {
  // 2026-11-14 に bestcalendar.jp（国立天文台の朔と天保暦の規則で計算）と照合。
  it.each([
    ["2027-02-28", "仏滅"], // 天赦日。旧実装は大安で「引越しに向く日」に入れていた
    ["2026-10-10", "先勝"], // 旧実装は先負
    ["2026-10-11", "先負"],
  ])("%s は %s", (iso, want) => {
    expect(plain(noonJst(iso))).toBe(want);
  });

  it("旧実装はこれらの日を取り違えていた（直した中身が空回りしていない）", () => {
    expect(plainRokuyo(oldRokuyo(noonJst("2027-02-28")))).toBe("大安");
    expect(plainRokuyo(oldRokuyo(noonJst("2026-10-10")))).toBe("先負");
  });

  it("2027 年の旧正月は 2 月 7 日（中国の春節は 2 月 6 日）", () => {
    expect(getLunarDate(noonJst("2027-02-06"))).toEqual({ month: 12, day: 30 });
    expect(getLunarDate(noonJst("2027-02-07"))).toEqual({ month: 1, day: 1 });
  });
});

describe("2000〜2040 年の全日", () => {
  it("変わったのは朔が日本時間 0〜1 時の月だけで、旧暦の日は 1〜30", () => {
    // 朔が日本時間 0 時台に来たときの、その日（日本の 1 日）の通し番号。
    const shiftedMonths: { start: number; end: number }[] = [];
    let t = new Date("1999-12-01T00:00:00Z");
    const stop = new Date("2041-01-01T00:00:00Z");
    const moons: Date[] = [];
    for (;;) {
      const q = SearchMoonPhase(0, t, 40);
      if (!q || q.date > stop) break;
      moons.push(q.date);
      t = new Date(q.date.getTime() + 86_400_000);
    }
    const dayIdx = (d: Date) =>
      Math.floor((d.getTime() + 9 * 3_600_000) / 86_400_000);
    for (let i = 0; i + 1 < moons.length; i++) {
      const jstHour = (moons[i].getUTCHours() + 9) % 24;
      if (jstHour === 0) {
        // 中国の 1 日（前日）から、次の朔の前日まで。
        shiftedMonths.push({
          start: dayIdx(moons[i]) - 1,
          end: dayIdx(moons[i + 1]) - 1,
        });
      }
    }
    expect(shiftedMonths.length).toBeGreaterThan(10);

    let changed = 0;
    const unexpected: string[] = [];
    for (
      let d = Date.UTC(2000, 0, 1);
      d < Date.UTC(2041, 0, 1);
      d += 86_400_000
    ) {
      const date = new Date(d + 3 * 3_600_000); // 12:00 JST
      const idx = dayIdx(date);
      const { day } = getLunarDate(date);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(30);
      const now = getRokuyo(date);
      const before = oldRokuyo(date);
      if (now === before) continue;
      changed++;
      const inShifted = shiftedMonths.some(
        (m) => idx >= m.start && idx <= m.end,
      );
      if (!inShifted) unexpected.push(date.toISOString().slice(0, 10));
    }
    expect(unexpected).toEqual([]);
    expect(changed).toBeGreaterThan(200);
  }, 120_000);
});

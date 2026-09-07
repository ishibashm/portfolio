import { describe, expect, it } from "vitest";
import { AstroTime } from "astronomy-engine";
import { AstroEngine, getHourStar } from "@/utils/ephemerisEngine";

/**
 * 時盤（独自モデル）の**土台になる日のサイクル**が、日本時間の日で
 * 変わること。
 *
 * ## 何が起きていたか
 *
 * `Math.floor(jd + 0.5)` は**世界時の 0 時＝09:00 JST**で繰り上がる。
 * 時盤は 2 時間ごとに動くので段差が紛れて見えないが、朝 9 時に
 * **時刻と関係のない 1 段のずれ**が入っていた。
 *
 * #1073 で日盤を日本時間の日に揃えたので、直す前は**同じ模型の中で
 * 日の切り方が 2 通り**あった（日盤は 0 時、時盤の土台は 9 時）。
 *
 * ## 変わるのは 0〜9 時だけ
 *
 * 9 時以降の答えは前と同じ。下で 1 年ぶん突き合わせて固定する。
 */

const jst = (s: string) => new Date(`${s}+09:00`);
const LON = 139.6917;

/** 直す前の実装。日時をそのまま軌道計算へ渡していた。 */
function legacyHourStar(date: Date, isYinPhase: boolean, lon = LON): number {
  const lst = AstroEngine.getLocalSiderealTime(date, lon);
  const phaseIndex = Math.floor(lst / 2);
  const jd = new AstroTime(date).ut + 2451545.0;
  const dayCycle = Math.floor(jd + 0.5) % 9;
  let star = isYinPhase ? dayCycle - phaseIndex : dayCycle + phaseIndex;
  while (star <= 0) star += 9;
  star %= 9;
  if (star === 0) star = 9;
  return star;
}

/** 星と時間帯から土台を復元する。1 日の中で動かないはずのもの。 */
function baseOf(date: Date, isYinPhase: boolean): number {
  const phaseIndex = Math.floor(
    AstroEngine.getLocalSiderealTime(date, LON) / 2,
  );
  const star = getHourStar(date, isYinPhase, LON);
  const base = isYinPhase ? star + phaseIndex : star - phaseIndex;
  return ((base % 9) + 9) % 9;
}

describe("時盤の土台は日本時間の日で変わる", () => {
  it("1 日の中で動かない（0 時から 23 時まで同じ）", () => {
    for (const yin of [true, false]) {
      const day = "2026-09-07T";
      const noon = baseOf(jst(`${day}12:00:00`), yin);
      for (const h of ["00:30", "06:00", "08:59", "09:01", "15:00", "23:30"]) {
        expect(baseOf(jst(`${day}${h}:00`), yin), `${yin} ${h}`).toBe(noon);
      }
    }
  });

  it("日付が変わると 1 つ進む", () => {
    const a = baseOf(jst("2026-09-07T12:00:00"), false);
    const b = baseOf(jst("2026-09-08T12:00:00"), false);
    expect(b).toBe((a + 1) % 9);
  });

  it("9 時以降の答えは変えていない（1 年ぶん・4 つの時間帯）", () => {
    for (let i = 0; i < 365; i++) {
      for (const hourUtc of [1, 6, 11, 14]) {
        /* 10:00 / 15:00 / 20:00 / 23:00 JST */
        const d = new Date(Date.UTC(2026, 0, 1, hourUtc, 0, 0) + i * 86400000);
        for (const yin of [true, false]) {
          expect(getHourStar(d, yin, LON), d.toISOString()).toBe(
            legacyHourStar(d, yin, LON),
          );
        }
      }
    }
  });

  it("0〜9 時は旧実装と違う（直したことの証拠）", () => {
    /* 旧実装はこの時間帯で前日の土台を使っていた */
    let changed = 0;
    for (let i = 0; i < 365; i++) {
      /* 03:00 JST = 18:00 UTC の前日 */
      const d = new Date(Date.UTC(2026, 0, 1, 18, 0, 0) + i * 86400000);
      if (getHourStar(d, false, LON) !== legacyHourStar(d, false, LON)) {
        changed++;
      }
    }
    expect(changed).toBe(365);
  });
});

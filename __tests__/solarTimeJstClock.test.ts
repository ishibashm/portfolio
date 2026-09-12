import { describe, expect, it } from "vitest";
import {
  calculateSolarTime,
  getDailySolarSchedule,
  getKimonHour,
  getZonedDateTimeFields,
} from "@/utils/solarTime";

/**
 * 時計の真太陽時と 2 時間ごとの刻を、**日本標準時**で出す。
 *
 * 直す前は 3 つの穴があった（2026-09-12 の総点検）。
 *
 * 1. `calculateSolarTime` の既定のタイムゾーンが `Math.round(経度 / 15)`
 *    だった。日本の標準子午線は 135 度で全国が JST を使うのに、
 *    経度 127.5 度未満（石垣・宮古島）は 8、142.5 度以上（帯広・釧路・
 *    根室）は 10 と推測され、**真太陽時が 60 分ずれていた。**盤の評価
 *    時刻（boardInstant）だけは 9 を明示していたが、時計
 *    （SolarTimeClock の setSolarData）は既定のままだった。
 * 2. `getKimonHour` と `getDailySolarSchedule` が `getHours` /
 *    `setHours` で**実行環境のタイムゾーン**の時刻を読んでいた。
 *    日本のブラウザでは JST と一致して見えないが、日本より西の端末と
 *    CI（UTC）では 9 時間ずれた刻が出る（CLAUDE.md 3 節の
 *    `Solar.fromDate` と同じ罠）。
 * 3. 時計は目的地を置くと**目的地の経度**で真太陽時を出していたが、
 *    刻の一覧（getDailySolarSchedule）は出発地の経度で組んでいた。
 *    東京→福岡なら 38 分ずれ、時計の刻と一覧の刻が別の十二支になる
 *    時間帯が毎日ある。頁の説明は「出発地の経度と均時差を補正」。
 *
 * 旧実装を下に写してある。旧挙動に戻すと落ちる。
 */

/** 1. 旧: 経度からタイムゾーンを推測していた */
const legacyDefaultTz = (lon: number) => Math.round(lon / 15);

/** 2. 旧: 実行環境のタイムゾーンで時を読んでいた */
function legacyKimonBranch(solarDt: Date): string {
  const hour = solarDt.getHours();
  const BRANCHES = [
    "子",
    "丑",
    "寅",
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
    "亥",
  ];
  return BRANCHES[Math.floor(((hour + 1) % 24) / 2)];
}

const JST = 9;
const jst = (iso: string) => new Date(`${iso}+09:00`);

describe("真太陽時の既定のタイムゾーンは JST", () => {
  it("石垣・根室でも 135 度を標準子午線にする（旧は 60 分ずれた）", () => {
    const t = jst("2026-06-01T12:00:00");
    for (const lon of [124.16, 125.28, 143.2, 144.38, 145.58]) {
      const now = calculateSolarTime(t, lon);
      const explicit = calculateSolarTime(t, lon, JST);
      expect(now.solarTime.getTime()).toBe(explicit.solarTime.getTime());
      // 旧挙動：8 か 10 と推測して 60 分ずれる
      expect(legacyDefaultTz(lon)).not.toBe(JST);
      const legacy = calculateSolarTime(t, lon, legacyDefaultTz(lon));
      expect(
        Math.abs(legacy.solarTime.getTime() - now.solarTime.getTime()),
      ).toBe(60 * 60000);
    }
  });

  it("本州の経度では旧と同じ（推測が 9 になる範囲）", () => {
    const t = jst("2026-06-01T12:00:00");
    for (const lon of [130.4, 135.0, 139.69, 141.35]) {
      expect(legacyDefaultTz(lon)).toBe(JST);
      expect(calculateSolarTime(t, lon).solarTime.getTime()).toBe(
        calculateSolarTime(t, lon, legacyDefaultTz(lon)).solarTime.getTime(),
      );
    }
  });
});

describe("刻は日本時間で切る", () => {
  it("getKimonHour は実行環境のタイムゾーンに依らない", () => {
    // JST 23:30 = 子の刻。UTC で読むと 14:30 = 未
    const t = jst("2026-06-01T23:30:00");
    expect(getKimonHour(t).japanese).toBe("子");
    // 旧実装は実行環境で答えが変わる。JST でない環境では別の刻になる
    const offsetMin = t.getTimezoneOffset();
    if (offsetMin !== -540) {
      expect(legacyKimonBranch(t)).not.toBe("子");
    }
  });

  it("1 年ぶんの毎時、JST の時刻から引いた十二支と一致する", () => {
    const BRANCHES = [
      "子",
      "丑",
      "寅",
      "卯",
      "辰",
      "巳",
      "午",
      "未",
      "申",
      "酉",
      "戌",
      "亥",
    ];
    const start = jst("2026-01-01T00:30:00").getTime();
    for (let i = 0; i < 365 * 24; i++) {
      const t = new Date(start + i * 3600000);
      const h = getZonedDateTimeFields(t, JST).hours;
      expect(getKimonHour(t).japanese).toBe(
        BRANCHES[Math.floor(((h + 1) % 24) / 2)],
      );
    }
  });

  it("一覧の各刻は、その日の JST の 2 時間枠に補正を足したものになる", () => {
    for (const lon of [124.16, 135.0, 139.69, 145.58]) {
      for (const day of ["2026-01-15", "2026-06-15", "2026-11-05"]) {
        const d = jst(`${day}T03:00:00`);
        const sched = getDailySolarSchedule(d, lon);
        expect(sched).toHaveLength(12);
        const noonCorr = calculateSolarTime(
          jst(`${day}T12:00:00`),
          lon,
          JST,
        ).totalCorrection;
        sched.forEach((item, i) => {
          const solarStartHour = -1 + 2 * i;
          const expectedStart =
            jst(`${day}T00:00:00`).getTime() +
            solarStartHour * 3600000 -
            noonCorr * 60000;
          expect(item.startStandard.getTime()).toBeCloseTo(expectedStart, -3);
          expect(
            item.endStandard.getTime() - item.startStandard.getTime(),
          ).toBe(2 * 3600000);
        });
        // 午の刻の開始は JST 11 時前後（補正は ±1 時間に収まる）
        const uma = sched[6];
        expect(uma.japanese).toBe("午");
        const f = getZonedDateTimeFields(uma.startStandard, JST);
        expect(f.hours).toBeGreaterThanOrEqual(10);
        expect(f.hours).toBeLessThanOrEqual(11);
      }
    }
  });

  it("時計の刻と一覧の刻が、同じ出発地・同じ瞬間で一致する", () => {
    // 境目から 3 分以内だけは、時計（その瞬間の均時差）と一覧（正午の
    // 均時差）の差で隣にずれうる。均時差は 1 日 0.5 分未満しか動かない。
    let mismatchFarFromEdge = 0;
    let checked = 0;
    for (const lon of [124.16, 139.69, 145.58]) {
      const start = jst("2026-01-01T00:00:00").getTime();
      for (let m = 0; m < 366 * 24 * 60; m += 13) {
        const t = new Date(start + m * 60000);
        const clock = getKimonHour(
          calculateSolarTime(t, lon).solarTime,
        ).japanese;
        const sched = getDailySolarSchedule(t, lon);
        const hit = sched.find(
          (s) => t >= s.startStandard && t < s.endStandard,
        );
        if (!hit) continue; // 子の刻の前半は前日の一覧に載る
        checked++;
        if (hit.japanese !== clock) {
          const edge = Math.min(
            Math.abs(t.getTime() - hit.startStandard.getTime()),
            Math.abs(t.getTime() - hit.endStandard.getTime()),
          );
          if (edge > 3 * 60000) mismatchFarFromEdge++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100000);
    expect(mismatchFarFromEdge).toBe(0);
  });
});

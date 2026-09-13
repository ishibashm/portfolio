import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getCurrentEnvironmentalFrequencies } from "@/utils/ephemerisEngine";
import { calculateSolarTime } from "@/utils/solarTime";
import { directionBoardInstant } from "@/utils/boardInstant";

/**
 * 「盤の内訳」（ConsultPanel）と「タイミング」（SolarTimeTable）に出す
 * 年盤・月盤・日盤を、地図・スコアと同じ**正午の盤**にする。
 *
 * 直す前は、この 2 つの画面だけ `env`（時計の現在時刻を真太陽時に
 * 直した瞬間）から年月日の星を出していた。盤は日本時間の暦日で
 * 変わる（CLAUDE.md 3 節）が、真太陽時に直した瞬間は東京で 4〜35 分
 * 進むので、**毎晩 23:25〜23:56 ごろから 0 時までは翌日の日盤**を
 * 出していた。同じ画面の地図（boardEnv。#1240 までに正午に固定）は
 * まだ当日の盤なので、タブを切り替えると日盤の数字が食い違う。
 *
 * 時盤（hourStar）と天体の黄経（raw）は時刻そのものが要るので、
 * 従来どおり現在時刻から出す。
 */

const LON = 139.6917;
const jst = (iso: string) => new Date(`${iso}+09:00`);

/** 直す前：現在時刻を真太陽時に直した瞬間で盤を引いていた */
const legacyEnv = (t: Date) =>
  getCurrentEnvironmentalFrequencies(
    calculateSolarTime(t, LON, 9).solarTime,
    LON,
  );
/** 直した後：正午に固定した瞬間（地図・スコアと同じ） */
const boardEnv = (t: Date) =>
  getCurrentEnvironmentalFrequencies(directionBoardInstant(t, 0, LON), LON);

describe("盤の内訳・タイミングの年月日盤は正午の盤", () => {
  it("23:50 JST の旧実装は翌日の日盤を出す（正午の盤と食い違う）", () => {
    const t = jst("2026-06-15T23:50:00");
    const legacy = legacyEnv(t);
    const board = boardEnv(t);
    // 正午の盤は当日の日盤
    const tomorrow = boardEnv(jst("2026-06-16T12:00:00"));
    expect(legacy.classicalDayStar).toBe(tomorrow.classicalDayStar);
    expect(legacy.classicalDayStar).not.toBe(board.classicalDayStar);
    expect(legacy.dayStar).not.toBe(board.dayStar);
  });

  it("週に 1 日ずつ 1 年を見て、旧実装はほぼ毎晩 0 時前にずれる。正午の盤は 1 日を通して同じ", () => {
    // 毎分・毎日を回すと天体計算が重すぎる（100 秒超）ので、週に 1 日、
    // 23:20〜24:00 を 2 分刻みで見る。
    let daysWithDrift = 0;
    let sampledDays = 0;
    for (let d = 0; d < 365; d += 7) {
      const day0 = jst("2026-01-01T00:00:00").getTime() + d * 86400000;
      const noonBoard = boardEnv(new Date(day0 + 12 * 3600000));
      let drift = 0;
      for (let m = 23 * 60 + 20; m < 24 * 60; m += 2) {
        const t = new Date(day0 + m * 60000);
        expect(boardEnv(t).classicalDayStar).toBe(noonBoard.classicalDayStar);
        if (legacyEnv(t).classicalDayStar !== noonBoard.classicalDayStar)
          drift++;
      }
      sampledDays++;
      if (drift >= 2) daysWithDrift++;
    }
    // 東京の補正は +4〜+35 分。4 分未満の日（均時差が最も負の 2 月ごろ）
    // を除き、ほぼ全ての夜で 0 時前に翌日の日盤に変わっていた
    expect(sampledDays).toBe(53);
    expect(daysWithDrift).toBeGreaterThanOrEqual(45);
  });

  it("画面には displayEnv を渡す（env を直に渡す経路が戻っていない）", () => {
    const code = readFileSync("src/components/SolarTimeClock.tsx", "utf8");
    expect(code).toMatch(/envData=\{displayEnv\}/);
    expect(code).toMatch(/<ConsultPanel[\s\S]{0,200}env=\{displayEnv\}/);
    expect(code).not.toMatch(/envData=\{env\}/);
    expect(code).not.toMatch(/<ConsultPanel[\s\S]{0,200}\senv=\{env\}/);
    // displayEnv は盤（正午）と時盤・黄経（現在時刻）の合成
    expect(code).toMatch(
      /displayEnv[\s\S]{0,400}\.\.\.boardEnv[\s\S]{0,200}hourStar: env\.hourStar/,
    );
  });
});

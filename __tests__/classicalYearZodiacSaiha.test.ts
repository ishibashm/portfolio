import { describe, it, expect } from "vitest";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  getCurrentZodiac,
} from "@/utils/ephemerisEngine";

/**
 * 年支（→歳破・天中殺の「年」判定）が古典の定義どおり立春で切り替わる
 * ことを固定する。
 *
 * 変更前の実装は年支を**木星黄経の 12 分割**で出していた。木星は約 1 年で
 * 1 区画進むが、区画を跨ぐのは立春ではなく**年の途中**（2026 年は夏に
 * 午→未）。その結果、
 *
 * - 歳破の方位が年の途中で動く（2026 年は 北 → 北東）
 * - /houi の年別頁（6 月 1 日を代表点に生成）とツール（今日の日付で計算）が
 *   同じ年の歳破で食い違う
 * - 二黒土星では、古典の歳破（北）がツール上で「吉方位」と表示される
 *
 * が実際に起きていた（2026-08-27 に発見）。サイトが公開している定義
 * （/houi の用語説明・記事）はすべて「その**年**の十二支の正反対」で、
 * 年は立春区切りなので、年支も立春（の瞬間）で切り替える。
 *
 * あわせて、破（歳破・月破・日破）を層に当てるときの**上書き**も固定する。
 * 変更前は無条件に NOISE_HA で上書きしており、同じ枡に重なった五黄殺・
 * 暗剣殺（NOISE_PRIORITY で破より重い）が破のラベルに隠れていた。
 * noiseSeverity の順序（サイト全体でただ一つの定義）で畳む。
 */

const ZHI = [
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
/** 西暦 Y 年（立春〜翌年立春の前）の十二支。2026 → 午。 */
const zhiOfYear = (y: number) => ZHI[(((y - 4) % 12) + 12) % 12];

function collisionOn(iso: string, star: number) {
  const d = new Date(iso);
  return calculateVectorCollision(
    star as never,
    generateBoard(getClassicalYearStar(d)),
    generateBoard(getClassicalMonthStar(d)),
    generateBoard(getClassicalDayStar(d)),
    [],
    null,
    "MIGRATION",
    d,
  );
}

describe("年支は立春で切り替わる（木星黄経ではない）", () => {
  it("1950〜2049 年の 6 月 1 日は西暦年の支、1 月 15 日は前年の支", () => {
    for (let y = 1950; y <= 2049; y++) {
      expect(
        getCurrentZodiac(new Date(`${y}-06-01T03:00:00Z`)).yearZodiac,
        `${y}-06-01`,
      ).toBe(zhiOfYear(y));
      expect(
        getCurrentZodiac(new Date(`${y}-01-15T03:00:00Z`)).yearZodiac,
        `${y}-01-15`,
      ).toBe(zhiOfYear(y - 1));
    }
  });

  it("立春の瞬間の前後で切り替わる（2026 は 2/4 5時1分ごろ、2027 は 2/4 10時46分ごろ）", () => {
    expect(
      getCurrentZodiac(new Date("2026-02-04T04:00:00+09:00")).yearZodiac,
    ).toBe("巳");
    expect(
      getCurrentZodiac(new Date("2026-02-04T06:00:00+09:00")).yearZodiac,
    ).toBe("午");
    expect(
      getCurrentZodiac(new Date("2027-02-04T09:00:00+09:00")).yearZodiac,
    ).toBe("午");
    expect(
      getCurrentZodiac(new Date("2027-02-04T12:00:00+09:00")).yearZodiac,
    ).toBe("未");
  });
});

describe("歳破は年の途中で動かない", () => {
  it("2026 年（午）の歳破は北。二黒土星の北は年内どの日でも吉にならない", () => {
    // 変更前は 2026 年の夏以降、歳破が北東へ移り、空いた北（六白＝二黒の
    // 相性星）が OPTIMAL と表示されていた。古典の歳破方位を吉と勧める表示。
    // 2026 年の北は暗剣殺とも重なるので、表示としては暗剣殺になる（下の
    // describe）。ここで固定したいのは「北が凶であり続けること」と
    // 「北東に歳破が現れないこと」。
    for (const iso of [
      "2026-03-01T03:00:00Z",
      "2026-06-01T03:00:00Z",
      "2026-09-01T03:00:00Z",
      "2026-12-15T03:00:00Z",
      "2027-01-20T03:00:00Z",
    ]) {
      const c = collisionOn(iso, 2);
      expect(c.yearLayer.N, `${iso} N`).toBe("NOISE_ANKEN");
      expect(c.yearLayer.NE, `${iso} NE`).not.toBe("NOISE_HA");
    }
  });

  it("2027 年（未）の歳破は北東に出る（重なる凶が無い枡では歳破と表示）", () => {
    for (const iso of ["2027-03-01T03:00:00Z", "2027-11-01T03:00:00Z"]) {
      const c = collisionOn(iso, 1);
      expect(c.yearLayer.NE, `${iso} NE`).toBe("NOISE_HA");
    }
  });
});

describe("破は自分より重い凶を隠さない（NOISE_PRIORITY で畳む）", () => {
  it("2026 年の北は歳破と暗剣殺の重なり。表示は重いほうの暗剣殺", () => {
    // 五黄が南に居るので北は暗剣殺。年支 午の歳破も北。
    // 変更前は歳破の上書きが後勝ちで、北が「歳破」と表示されていた
    // （/houi/2026 の全星の頁がこの表示だった）。
    const c = collisionOn("2026-06-01T00:00:00Z", 6);
    expect(c.yearLayer.N).toBe("NOISE_ANKEN");
    expect(c.yearLayer.S).toBe("NOISE_GOU");
  });

  it("月盤・日盤でも、破は五黄殺・暗剣殺を上書きしない", () => {
    // 2026-01〜2027-12 の毎月 15 日で走査。層ごとに、盤の五黄の枡は
    // 必ず五黄殺、その向かいは必ず暗剣殺であること（破が来ても隠れない）。
    const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
    const OPP: Record<string, string> = {
      N: "S",
      S: "N",
      E: "W",
      W: "E",
      NE: "SW",
      SW: "NE",
      SE: "NW",
      NW: "SE",
    };
    let checked = 0;
    for (let y = 2026; y <= 2027; y++) {
      for (let m = 1; m <= 12; m++) {
        const iso = `${y}-${String(m).padStart(2, "0")}-15T03:00:00Z`;
        const d = new Date(iso);
        const boards = {
          yearLayer: generateBoard(getClassicalYearStar(d)),
          monthLayer: generateBoard(getClassicalMonthStar(d)),
          dayLayer: generateBoard(getClassicalDayStar(d)),
        };
        const c = collisionOn(iso, 1);
        for (const layer of ["yearLayer", "monthLayer", "dayLayer"] as const) {
          const board = boards[layer];
          const gouDir = DIRS.find((dir) => board[dir] === 5);
          if (!gouDir) continue; // 五黄が中宮の盤には五黄殺・暗剣殺が無い
          expect(c[layer][gouDir], `${iso} ${layer} ${gouDir}`).toBe(
            "NOISE_GOU",
          );
          expect(
            c[layer][OPP[gouDir] as (typeof DIRS)[number]],
            `${iso} ${layer} ${OPP[gouDir]}`,
          ).toBe("NOISE_ANKEN");
          checked++;
        }
      }
    }
    // 走査が空回りしていないこと（五黄が中宮でない盤が十分あること）
    expect(checked).toBeGreaterThan(30);
  });
});

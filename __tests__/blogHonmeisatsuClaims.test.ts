import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getYearDirections, statusInfo, STAR_NAMES } from "@/lib/kigakuContent";
import { judgeDayAllDirections } from "@/utils/auspiciousDays";
import { generateBoard, getClassicalYearStar } from "@/utils/ephemerisEngine";

/**
 * 公開記事の数値をエンジンと照合する。
 *
 * 記事 honmeisatsu-year-board-next-move は、2026 年の年盤・星ごとの座と
 * 表示・2027-02-04 からの表示を**具体的な値**で載せている。エンジン側の
 * 修正で値が変わったのに記事が古いまま、という食い違いが実際に起きた
 * （歳破の不具合 #656 の修正で、四緑木星の行が「歳破」→「本命殺」に
 * 変わった。#657 で訂正）。記事は utf-8 の散文なので tsc も lint も
 * 守ってくれない。ここで機械的に照合し、エンジンと記事のどちらかを
 * 変えたら必ずもう片方も直すことを強制する。
 *
 * 対象はこの記事の**表**だけ（散文の言い回しまでは追わない）。
 * 記事を書き換えて表の形が変わったら、このテストも一緒に直すこと。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/honmeisatsu-year-board-next-move.md"),
  "utf-8",
);

const DIR_BY_JP: Record<string, string> = {
  北: "N",
  北東: "NE",
  東: "E",
  南東: "SE",
  南: "S",
  南西: "SW",
  西: "W",
  北西: "NW",
};

/** エンジンの状態コード → 記事の表の語彙 */
function toArticleWord(status: string): string {
  if (status === "OPTIMAL" || status === "OPTIMAL_REGULAR") return "吉";
  if (status === "SAFE") return "平";
  return statusInfo(status).label; // 本命殺・五黄殺・暗剣殺・歳破・月交点など
}

describe("記事: 2026 年の年盤の表", () => {
  it("北〜北西の 8 枡がエンジンの盤と一致する", () => {
    // | 6 | 4 | 8 | 9 | 5 | 7 | 3 | 2 | の行（北, 北東, 東, 南東, 南, 南西, 西, 北西）
    const m = md.match(
      /\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|\s*(\d)\s*\|/,
    );
    expect(m, "年盤の数字の行が記事に見つからない").toBeTruthy();
    const board = generateBoard(
      getClassicalYearStar(new Date("2026-06-01T03:00:00Z")),
    ) as Record<string, number>;
    const order = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    order.forEach((dir, i) => {
      expect(Number(m![i + 1]), `2026 年盤 ${dir}`).toBe(board[dir]);
    });
  });

  it("年盤の期限（2027-02-03 まで 2026 の盤）が正しい", () => {
    expect(md).toContain("2027年2月3日");
    const star2026 = getClassicalYearStar(new Date("2026-06-01T03:00:00Z"));
    expect(getClassicalYearStar(new Date("2027-02-03T12:00:00+09:00"))).toBe(
      star2026,
    );
    expect(
      getClassicalYearStar(new Date("2027-02-04T12:00:00+09:00")),
    ).not.toBe(star2026);
  });
});

describe("記事: 星別の表（座・2026 年の表示・2027-02-04 からの表示）", () => {
  // | 二黒土星 | 北西 | 本命殺 | 平 | の形の行を全部拾う
  const rowRe =
    /\|\s*(一白水星|二黒土星|三碧木星|四緑木星|五黄土星|六白金星|七赤金星|八白土星|九紫火星)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  const rows = [...md.matchAll(rowRe)].map((m) => ({
    starName: m[1],
    seat: m[2].replace(/\*/g, "").trim(),
    label2026: m[3].replace(/\*/g, "").trim(),
    labelFeb4: m[4].replace(/\*/g, "").trim(),
  }));

  it("9 星ぶんの行が揃っている", () => {
    expect(rows.map((r) => r.starName).sort()).toEqual(
      Object.values(STAR_NAMES).sort(),
    );
  });

  const starOfName = (name: string) =>
    Number(Object.entries(STAR_NAMES).find(([, v]) => v === name)![0]);

  for (const row of rows) {
    it(`${row.starName}: 座=${row.seat} / 2026=${row.label2026} / 2/4〜=${row.labelFeb4}`, () => {
      const star = starOfName(row.starName);
      const { verdicts } = getYearDirections(2026, star, "classical");
      const seat = verdicts.find((v) => v.star === star);

      if (row.seat.includes("中宮")) {
        expect(seat, "中宮の年なのに座が方位にある").toBeUndefined();
        return;
      }
      expect(seat, "座が見つからない").toBeTruthy();
      expect(DIR_BY_JP[row.seat], `方位名 ${row.seat}`).toBe(seat!.direction);

      // 2026 年の表示（/houi の年別頁と同じ計算）
      expect(toArticleWord(seat!.status)).toBe(row.label2026);

      // 2027-02-04 からの表示（記事と同じ方法: 実日付でツールの年層を引く）
      const feb4 = judgeDayAllDirections(
        new Date("2027-02-04T12:00:00+09:00"),
        {
          honmeiStar: star as never,
          voidZodiacs: [],
          lon: 139.6917,
          tenchusatsuMode: "MODERATE" as never,
        },
      );
      expect(toArticleWord(feb4[seat!.direction].yearLayer)).toBe(
        row.labelFeb4,
      );
    });
  }
});

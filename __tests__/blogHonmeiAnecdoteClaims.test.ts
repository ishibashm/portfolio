import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { generateBoard, getClassicalYearStar } from "@/utils/ephemerisEngine";
import { STAR_NAMES } from "@/lib/kigakuContent";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

/**
 * 公開記事 honmeisatsu-anecdotes-and-life-impact の表をエンジンと照合する。
 *
 * この記事は「本命殺・的殺の方位は毎年入れ替わる」という主張を、
 * 三碧木星の 2024〜2027 年の**具体的な方位**で示している。年盤の
 * 計算が変われば記事だけ古くなるので、機械的に突き合わせる
 * （blogHonmeisatsuClaims・blogFengShuiClaims と同じ考え方）。
 *
 * 対象は表だけ。散文の言い回しは追わない。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/honmeisatsu-anecdotes-and-life-impact.md"),
  "utf-8",
);

const STAR = 7; // 七赤金星
const OPPOSITE: Record<string, string> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
  NE: "SW",
  SW: "NE",
  NW: "SE",
  SE: "NW",
};

/** その年の年盤で、三碧木星の座・本命殺・本命的殺を出す。 */
function expectedRow(year: number) {
  /* 年盤は立春で切り替わる。年の途中（6 月 1 日）を代表点にする。
     honmeisatsu-year-board-next-move の検査と同じ引き方。 */
  const chuguu = getClassicalYearStar(new Date(`${year}-06-01T03:00:00Z`));
  const board = generateBoard(chuguu) as Record<string, number>;
  const seat = Object.keys(OPPOSITE).find((d) => board[d] === STAR);
  return {
    chuguu: STAR_NAMES[chuguu],
    seat: seat
      ? DIRECTION_LABELS[seat as keyof typeof DIRECTION_LABELS]
      : "中宮",
    honmeisatsu: seat
      ? DIRECTION_LABELS[seat as keyof typeof DIRECTION_LABELS]
      : "**盤上に無い**",
    tekisatsu: seat
      ? DIRECTION_LABELS[OPPOSITE[seat] as keyof typeof DIRECTION_LABELS]
      : "**盤上に無い**",
  };
}

/** 記事の表から、その年の行を拾う。 */
function rowFor(year: number): string[] {
  const line = md.split("\n").find((l) => l.startsWith(`| ${year} |`));
  expect(line, `${year} 年の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

describe("記事: 本命殺・本命的殺の逸話", () => {
  for (const year of [2024, 2025, 2026, 2027, 2028, 2029]) {
    it(`${year} 年の行が年盤と一致する`, () => {
      const [y, chuguu, seat, honmeisatsu, tekisatsu] = rowFor(year);
      const want = expectedRow(year);
      expect(Number(y)).toBe(year);
      expect(chuguu).toBe(want.chuguu);
      expect(seat).toBe(want.seat);
      expect(honmeisatsu).toBe(want.honmeisatsu);
      expect(tekisatsu).toBe(want.tekisatsu);
    });
  }

  it("空回りしていない（4 年のうち方位が入れ替わっている）", () => {
    /* 記事の主張は「毎年入れ替わる」。全部同じなら主張が成り立たない。 */
    const seats = [2024, 2025, 2026, 2027, 2028].map(
      (y) => expectedRow(y).seat,
    );
    expect(new Set(seats).size).toBe(5);
  });

  it("本命星が中宮に入る年は盤上から消える（2029）", () => {
    expect(expectedRow(2029).honmeisatsu).toBe("**盤上に無い**");
  });
});

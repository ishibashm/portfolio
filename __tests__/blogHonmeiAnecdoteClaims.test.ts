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
 * **9 星ぶんの具体的な方位**で示している。年盤の計算が変われば記事だけ
 * 古くなるので、機械的に突き合わせる（blogHonmeisatsuClaims・
 * blogFengShuiClaims と同じ考え方）。
 *
 * ## なぜ 9 星ぶんか
 *
 * 以前は七赤金星 1 つを例に 2024〜2029 年を並べていた。**利用者の指摘で、
 * サイトの記事が軒並み七赤金星を例にしていて、他の星の人には自分の行が
 * どこにも無いと分かった。**単一の例を替えても別の星が同じ目に遭うので、
 * 9 星を並べる形にした。この検査はその形を保つためにもある。
 *
 * 対象は表だけ。散文の言い回しは追わない。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/honmeisatsu-anecdotes-and-life-impact.md"),
  "utf-8",
);

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

const label = (dir: string) =>
  DIRECTION_LABELS[dir as keyof typeof DIRECTION_LABELS];

/** その年の年盤で、その星が回座する方位。中宮なら undefined。 */
function seatOf(year: number, star: number): string | undefined {
  /* 年盤は立春で切り替わる。年の途中（6 月 1 日）を代表点にする。
     honmeisatsuClaims の検査と同じ引き方。 */
  const chuguu = getClassicalYearStar(new Date(`${year}-06-01T03:00:00Z`));
  const board = generateBoard(chuguu) as Record<string, number>;
  return Object.keys(OPPOSITE).find((d) => board[d] === star);
}

/** 記事の「本命殺 / 的殺」欄の期待値。 */
function cellFor(year: number, star: number): string {
  const seat = seatOf(year, star);
  return seat ? `${label(seat)} / ${label(OPPOSITE[seat])}` : "盤上に無い";
}

/** その星が中宮に入る最初の年（記事の「盤上から消える年」）。 */
function chuguuYearOf(star: number): number {
  for (let y = 2024; y <= 2035; y++) {
    if (seatOf(y, star) === undefined) return y;
  }
  throw new Error(`${star} が中宮に入る年が 2024〜2035 に無い`);
}

/** 記事の表から、その星の行を拾う。 */
function rowFor(star: number): string[] {
  const name = STAR_NAMES[star];
  const line = md.split("\n").find((l) => l.startsWith(`| ${name} `));
  expect(line, `${name} の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

describe("記事: 本命殺・本命的殺の逸話", () => {
  it("9 星ぶんの行が揃っている（どの星の人にも自分の行がある）", () => {
    for (let star = 1; star <= 9; star++) {
      expect(rowFor(star).length, `${STAR_NAMES[star]} の列数`).toBe(4);
    }
  });

  for (let star = 1; star <= 9; star++) {
    it(`${STAR_NAMES[star]} の行が年盤と一致する`, () => {
      const [name, y2026, y2027, chuguu] = rowFor(star);
      expect(name).toBe(STAR_NAMES[star]);
      expect(y2026).toBe(cellFor(2026, star));
      expect(y2027).toBe(cellFor(2027, star));
      expect(Number(chuguu)).toBe(chuguuYearOf(star));
    });
  }

  it("空回りしていない（2026 と 2027 で方位が動く星がある）", () => {
    /* 記事の主張は「どの星も 1 年で別の方位に移る」。全部同じなら
       主張が成り立たない。中宮の年を除いて、全星で座が変わること。 */
    let moved = 0;
    for (let star = 1; star <= 9; star++) {
      const a = seatOf(2026, star);
      const b = seatOf(2027, star);
      if (a !== b) moved++;
    }
    expect(moved).toBe(9);
  });

  it("散文が挙げる三碧木星の例が、表と一致する", () => {
    /* 「三碧木星なら 2026 年に東だった的殺が 2027 年には南西へ」。
       表から機械的に導けることを確かめる（散文だけ古くなるのを防ぐ）。 */
    expect(cellFor(2026, 3)).toBe("西 / 東");
    expect(cellFor(2027, 3)).toBe("北東 / 南西");
    expect(md).toContain(
      "たとえば三碧木星なら、2026 年に東だった本命的殺は 2027 年には南西へ動きます",
    );
  });

  it("中宮に入る年の例（九紫火星 2027・一白水星 2026）が正しい", () => {
    expect(chuguuYearOf(9)).toBe(2027);
    expect(chuguuYearOf(1)).toBe(2026);
  });
});

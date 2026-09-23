import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalMonthStar,
  getClassicalYearStar,
  type BoardLayout,
} from "@/utils/ephemerisEngine";
import { STAR_NAMES } from "@/lib/kigakuContent";

/**
 * 記事「なぜ星は9つで、なぜあの並びなのか」の数の主張を、計算とエンジンに
 * 突き合わせる（2026-09-24 の監査。数値主張の照合テストがまだ無かった記事）。
 *
 * この記事は「このサイトの判定は 1〜4 の構造をそのまま計算しているだけ」と
 * 書いている。**記事の盤と判定の盤が同じもの**であることを、ここで固定する。
 * 記事の表を書き換えるか、盤の組み方（generateBoard）を変えると落ちる。
 *
 * 見ているもの
 *   1. 洛書 4 9 2 / 3 5 7 / 8 1 6 はどの列も 15
 *   2. 9! = 362,880 通り、魔方陣は 8 通り、回転・反転で同一視すると 1 種類。
 *      中央はどれも 5
 *   3. 数 → 方位の表（後天定位）が、中央 5 のときのエンジンの盤と一致する。
 *      記事の 3 行 3 列は南を上・東を左に描いた盤と一致する
 *   4. 星の色と五行の表が、判定に使う星の名前（STAR_NAMES）と一致する
 *   5. 年盤の中央は毎年 1 つずつ減り、1 の次は 9。月盤も同じ向き。
 *      月盤の始まり（寅月）の星は年によって変わる
 *   6. 五黄殺の正反対が暗剣殺（中央 5 以外のどの盤でも）
 */

const MD = readFileSync(
  join(process.cwd(), "content/blog/why-nine-stars-and-that-order.md"),
  "utf8",
);

const KANJI = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 記事冒頭のコードブロック（3 行 3 列）を読む。 */
function articleGrid(): number[][] {
  const m = MD.match(/```\n(\d \d \d)\n(\d \d \d)\n(\d \d \d)\n```/);
  expect(m, "記事の 3 行 3 列が見つからない").not.toBeNull();
  return [m![1], m![2], m![3]].map((r) => r.split(" ").map(Number));
}

/** 表の行（`| a | b | … |`）を列に割る。見出しと区切りの行は除く。 */
function tableRows(header: string): string[][] {
  const start = MD.indexOf(header);
  expect(start, `表「${header}」が見つからない`).toBeGreaterThanOrEqual(0);
  const lines = MD.slice(start).split("\n");
  const rows: string[][] = [];
  for (const line of lines.slice(2)) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  }
  return rows;
}

function lines3x3(g: number[][]): number[] {
  const sums: number[] = [];
  for (let i = 0; i < 3; i++) {
    sums.push(g[i][0] + g[i][1] + g[i][2]);
    sums.push(g[0][i] + g[1][i] + g[2][i]);
  }
  sums.push(g[0][0] + g[1][1] + g[2][2]);
  sums.push(g[0][2] + g[1][1] + g[2][0]);
  return sums;
}

/** 1〜9 の並べ方をすべて作る（9! 通り）。 */
function* permutations(xs: number[]): Generator<number[]> {
  if (xs.length <= 1) {
    yield xs;
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutations(rest)) yield [xs[i], ...p];
  }
}

const toGrid = (p: number[]) => [p.slice(0, 3), p.slice(3, 6), p.slice(6, 9)];
const rotate = (g: number[][]) =>
  g[0].map((_, c) => g.map((row) => row[c]).reverse());
const mirror = (g: number[][]) => g.map((row) => [...row].reverse());
const key = (g: number[][]) => g.flat().join("");

/** 回転 4 × 鏡像 2 のうち辞書順で最小のものを代表にする。 */
function canonical(g: number[][]): string {
  const keys: string[] = [];
  let cur = g;
  for (let i = 0; i < 4; i++) {
    keys.push(key(cur), key(mirror(cur)));
    cur = rotate(cur);
  }
  return keys.sort()[0];
}

describe("記事: 洛書の魔方陣", () => {
  it("記事の 3 行 3 列は、縦・横・斜めのどの列も 15", () => {
    const sums = lines3x3(articleGrid());
    expect(sums).toHaveLength(8);
    expect(new Set(sums)).toEqual(new Set([15]));
  });

  it("並べ方は 362,880 通り、魔方陣は 8 通り、同一視すると 1 種類で中央は 5", () => {
    let all = 0;
    const magic: number[][][] = [];
    for (const p of permutations([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      all++;
      const g = toGrid(p);
      if (lines3x3(g).every((s) => s === 15)) magic.push(g);
    }
    expect(all).toBe(362_880);
    expect(magic).toHaveLength(8);
    expect(new Set(magic.map(canonical)).size).toBe(1);
    expect(new Set(magic.map((g) => g[1][1]))).toEqual(new Set([5]));
    /* 記事の表の数字と同じ */
    const table = Object.fromEntries(
      tableRows("| 性質").map(([k, v]) => [k, v]),
    );
    expect(table["1〜9 の並べ方"]).toBe("362,880 通り");
    expect(table["和が等しくなる並べ方"]).toBe("8 通り");
    expect(table["回転・反転を同一視した種類"]).toBe("1 種類");
    expect(table["どの列の和も"]).toBe("15");
  });
});

describe("記事: 数と方位（後天定位）は判定の盤と同じ", () => {
  const board = generateBoard(5);
  const LABEL_TO_DIR: Record<string, keyof BoardLayout> = {
    北: "N",
    北東: "NE",
    東: "E",
    南東: "SE",
    南: "S",
    南西: "SW",
    西: "W",
    北西: "NW",
    中央: "CENTER",
  };

  it("表の 9 行が、中央 5 の盤の位置と一致する", () => {
    const rows = tableRows("| 数  | 方位");
    expect(rows).toHaveLength(9);
    for (const [num, label] of rows) {
      const n = KANJI.indexOf(num);
      expect(n, num).toBeGreaterThan(0);
      expect(board[LABEL_TO_DIR[label]], `${num} → ${label}`).toBe(n);
    }
  });

  it("冒頭の 3 行 3 列は、南を上・東を左に描いた同じ盤", () => {
    const southUp = [
      [board.SE, board.S, board.SW],
      [board.E, board.CENTER, board.W],
      [board.NE, board.N, board.NW],
    ];
    expect(articleGrid()).toEqual(southUp);
  });
});

describe("記事: 星の色と五行", () => {
  it("表の色・五行が、判定に使う星の名前（例: 一白水星）と一致する", () => {
    const rows = tableRows("| 星   | 色");
    expect(rows).toHaveLength(9);
    for (const [star, color, element] of rows) {
      const n = KANJI.indexOf(star[0]);
      const name = STAR_NAMES[n];
      expect(name, star).toBe(`${star}${element}星`);
      expect(star[1], star).toBe(color);
    }
  });
});

describe("記事: 盤は逆に回る", () => {
  /* 気学の年の真ん中（立春を跨がない）。1950〜2060 年 */
  const years = Array.from({ length: 111 }, (_, i) => 1950 + i);
  const mid = (y: number) => new Date(`${y}-07-01T03:00:00Z`);

  it("年盤の中央は毎年 1 つずつ減り、1 の次は 9", () => {
    for (const y of years.slice(0, -1)) {
      const a = getClassicalYearStar(mid(y));
      const b = getClassicalYearStar(mid(y + 1));
      expect(b, `${y}→${y + 1}`).toBe(a === 1 ? 9 : a - 1);
    }
  });

  it("月盤も同じ向き（節月ごとに 1 つずつ減る）", () => {
    for (const y of [2024, 2025, 2026]) {
      for (let m = 1; m <= 12; m++) {
        /* 節入りは月の 4〜8 日ごろ。15 日なら同じ節月の中ほど */
        const a = getClassicalMonthStar(new Date(Date.UTC(y, m - 1, 15, 3)));
        const b = getClassicalMonthStar(new Date(Date.UTC(y, m, 15, 3)));
        expect(b, `${y}-${m}`).toBe(a === 1 ? 9 : a - 1);
      }
    }
  });

  it("月盤の始まり（寅月）の星は年によって変わる", () => {
    const starts = new Set(
      years.map((y) => getClassicalMonthStar(new Date(`${y}-02-20T03:00:00Z`))),
    );
    expect(starts.size).toBeGreaterThan(1);
  });
});

describe("記事: 五黄殺と暗剣殺は必ず正反対", () => {
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

  it("中央 5 以外のどの年盤でも、5 の座る方位の対面が暗剣殺", () => {
    for (const center of [1, 2, 3, 4, 6, 7, 8, 9] as const) {
      const board = generateBoard(center);
      const gou = Object.keys(OPPOSITE).find(
        (d) => board[d as keyof BoardLayout] === 5,
      )!;
      /* 本命殺・的殺が重ならない星を本命にする。本命が五黄・暗剣のどちらかに
         座ると、的殺がもう片方に重なる */
      const personal = ([1, 2, 3, 4, 6, 7, 8, 9] as const).find(
        (s) =>
          s !== center &&
          board[gou as keyof BoardLayout] !== s &&
          board[OPPOSITE[gou] as keyof BoardLayout] !== s,
      )!;
      const c = calculateVectorCollision(
        personal,
        board,
        generateBoard(center),
        generateBoard(center),
      );
      expect(
        c.yearLayer[gou as keyof typeof c.yearLayer],
        `中央${center}`,
      ).toBe("NOISE_GOU");
      expect(
        c.yearLayer[OPPOSITE[gou] as keyof typeof c.yearLayer],
        `中央${center}`,
      ).toBe("NOISE_ANKEN");
    }
  });
});

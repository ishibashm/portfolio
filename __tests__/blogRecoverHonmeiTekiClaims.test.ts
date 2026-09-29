import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { judgeDayAllDirections } from "@/utils/auspiciousDays";
import { generateBoard, getClassicalYearStar } from "@/utils/ephemerisEngine";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { directionLabelName } from "@/lib/directionLabels";

/**
 * 公開記事 can-you-recover-from-honmei-teki の数字をエンジンと照合する。
 *
 * ## 照合していなかった記事で、2 つ食い違っていた（2026-09-30 の監査）
 *
 * - 2028 年盤の表で、北東を「歳破」と書いていた。エンジンと画面は
 *   **暗剣殺**を出す（五黄殺が南西に来る年は北東が暗剣殺で、同じ所の
 *   歳破より重い名前が出る）
 * - 「三盤とも吉になったのは全体の 0.2% 程度」と書いていた。同じ走査
 *   （本命星 9 通り × 730 日 × 8 方位）で数え直すと **1.467%**
 *   （52,560 のうち 771）。天中殺の支を 6 通り入れても 0.871〜1.383% で、
 *   どの設定でも 0.2% にはならない。三盤吉の条件を締めた（year-board-
 *   blocks-a-whole-year の検査の註）より前の数字でもなく、出どころが
 *   分からない。記事は天中殺を入れない数字（約 1.5%）に直し、入れると
 *   減ることを書いた
 *
 * 散文の言い回しは追わない。表と数字だけ。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/can-you-recover-from-honmei-teki.md"),
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

/** 記事の前提（本文の例）: 本命七赤金星。 */
const STAR = 7;

/** その年の年盤で、その星が回座する方位。中宮なら undefined。 */
function seatOf(year: number, star: number): string | undefined {
  /* 年盤は立春で替わる。年の途中（6 月 1 日）を代表点にする
     （blogHonmeiAnecdoteClaims と同じ引き方） */
  const chuguu = getClassicalYearStar(new Date(`${year}-06-01T03:00:00Z`));
  const board = generateBoard(chuguu) as Record<string, number>;
  return Object.keys(OPPOSITE).find((d) => board[d] === star);
}

/** 記事の表の行（| a | b | … |）を、先頭の列で拾う。 */
function row(first: string): string[] {
  const line = md.split("\n").find((l) => l.startsWith(`| ${first} `));
  expect(line, `「${first}」の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim().replace(/\*\*/g, ""))
    .filter((c) => c.length > 0);
}

describe("記事: 本命的殺へ引っ越してしまった", () => {
  it("七赤の本命殺・本命的殺は 2026〜2028 年で表のとおりに動き、2029 年は盤上に無い", () => {
    for (const year of [2026, 2027, 2028]) {
      const seat = seatOf(year, STAR);
      expect(seat, `${year}`).toBeDefined();
      expect(row(`${year}年`).slice(1), `${year}`).toEqual([
        label(seat!),
        label(OPPOSITE[seat!]),
      ]);
    }
    expect(seatOf(2029, STAR)).toBeUndefined();
    expect(row("2029年").slice(1)).toEqual(["—", "—"]);
    /* 結論の段にも同じ並びが書いてある */
    expect(md).toContain(
      "七赤金星なら 2026 年は北東、2027 年は西、2028 年は北西",
    );
    expect(md).toContain("七赤金星なら 2029 年");
  });

  it("2028 年盤の表が、画面に出る年盤の判定と一致する", () => {
    /* 年盤は時刻に依らない。経度・天中殺は判定に入らないよう空にする */
    const verdicts = judgeDayAllDirections(
      new Date("2028-06-01T12:00:00+09:00"),
      {
        honmeiStar: STAR as never,
        voidZodiacs: [],
        lon: 135.7,
        tenchusatsuMode: "strict",
      },
    );
    const nameOf = (dir: string) => {
      const status = verdicts[dir].yearLayer;
      /* 年盤の破は歳破（札は 歳破/月破/日破 をまとめて持つ） */
      return status === "NOISE_HA" ? "歳破" : directionLabelName(status);
    };
    for (const dir of ["SE", "NW", "SW", "NE", "W"]) {
      const [, name] = row(label(dir));
      expect(name, label(dir)).toBe(nameOf(dir));
    }
    /* 空回りしていない: 北東は暗剣殺（旧記事の「歳破」では落ちる） */
    expect(nameOf("NE")).toBe("暗剣殺");
  });

  it("三盤とも吉（段階 S）の割合は約 1.5%（天中殺なし・2026-01-01 から 730 日）", () => {
    let total = 0;
    let triple = 0;
    for (let star = 1; star <= 9; star++) {
      for (let d = 0; d < 730; d++) {
        const r = judgeDayAllDirections(new Date(Date.UTC(2026, 0, 1 + d, 3)), {
          honmeiStar: star as never,
          voidZodiacs: [],
          lon: 135.7,
          tenchusatsuMode: "strict",
        });
        for (const v of Object.values(r)) {
          total++;
          if (v.isTripleAuspicious) triple++;
        }
      }
    }
    expect(total).toBe(9 * 730 * 8);
    const pct = (triple / total) * 100;
    expect(pct.toFixed(1)).toBe("1.5");
    expect(md).toContain(
      "三盤とも吉（段階 S）になったのは全体の約 1.5% でした",
    );
    expect(md).not.toContain("0.2%");
  }, 60_000);
});

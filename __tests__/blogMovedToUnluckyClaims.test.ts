import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { judgeDay } from "@/utils/auspiciousDays";
import {
  generateBoard,
  getClassicalDayStar,
  getClassicalMonthStar,
  getClassicalYearStar,
} from "@/utils/ephemerisEngine";
import {
  DIRECTION_LABELS,
  bearingBetween,
  directionFromBearing,
} from "@/utils/directionGeo";
import { STAR_NAMES } from "@/lib/kigakuContent";

/**
 * 公開記事 moved-to-an-unlucky-direction の表をエンジンと照合する
 * （2026-09-30 の監査。どのテストからも参照されていなかった）。
 *
 * 記事は運営者自身の移動（2026-06-26、京都市 → 名古屋市、本命三碧木星、
 * 午未天中殺）を判定に掛けた表を載せている。数え直したら全部一致した。
 * 盤の計算が変わったときに記事だけ古くならないよう、ここで固定する。
 *
 * 方位角だけは記事の住所を持っていないので、公開の代表点（京都市
 * 35.0116 / 135.7681、名古屋市 35.1815 / 136.9066）で測る。代表点では
 * 79.3 度で、記事の 78.3 度とは 1 度違う（出発・到着の地点の差）。
 * どちらも東の範囲の真ん中寄りで、方位は変わらない。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/moved-to-an-unlucky-direction.md"),
  "utf-8",
);

const MOVE = new Date("2026-06-26T12:00:00+09:00");
const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };
const HONMEI = 3;

/** 表の行（| 項目 | 値 |）の値の列。 */
function cell(item: string): string {
  /* 強調（**）は外して比べる（「年盤の判定（東）」の行は太字） */
  const line = md
    .split("\n")
    .map((l) => l.replace(/\*\*/g, ""))
    .find((l) => l.startsWith(`| ${item} |`));
  expect(line, `「${item}」の行が記事に無い`).toBeTruthy();
  return line!
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean)[1];
}

const verdict = () =>
  judgeDay(MOVE, {
    direction: "E",
    honmeiStar: HONMEI as never,
    voidZodiacs: ["午", "未"] as never,
    lon: KYOTO.lon,
    tenchusatsuMode: "strict",
  });

describe("記事: 凶方位へ引っ越してしまったあとに読む話", () => {
  it("京都 → 名古屋は東（記事の 78.3 度も、代表点の方位角も）", () => {
    expect(cell("方位角（真北基準）")).toBe("78.3度 → 東");
    expect(directionFromBearing(78.3)).toBe("E");
    const b = bearingBetween(KYOTO.lat, KYOTO.lon, NAGOYA.lat, NAGOYA.lon);
    expect(directionFromBearing(b)).toBe("E");
    expect(Math.abs(b - 78.3)).toBeLessThan(2);
  });

  it("盤の中宮と、年盤で三碧が回座する方位", () => {
    expect(cell("本命星（立春基準）")).toBe(STAR_NAMES[HONMEI]);
    const y = getClassicalYearStar(MOVE);
    expect(cell("2026年の年盤中宮")).toBe(STAR_NAMES[y]);
    const board = generateBoard(y) as Record<string, number>;
    const seat = Object.keys(board).find((d) => board[d] === HONMEI)!;
    expect(cell("年盤で三碧木星が回座する方位")).toBe(
      DIRECTION_LABELS[seat as keyof typeof DIRECTION_LABELS],
    );
    /* 散文: 月盤は四緑木星中宮、日盤は二黒土星中宮 */
    expect(md).toContain(
      `月盤（${STAR_NAMES[getClassicalMonthStar(MOVE)]}中宮）`,
    );
    expect(md).toContain(
      `日盤（${STAR_NAMES[getClassicalDayStar(MOVE)]}中宮）`,
    );
  });

  it("東の判定は 年: 本命的殺 / 月: 凶殺に当たらない / 日: 吉方", () => {
    const v = verdict();
    expect(v.yearLayer).toBe("NOISE_TEKI");
    expect(cell("年盤の判定（東）")).toBe("本命的殺");
    /* 「凶殺に当たらない」＝ NOISE_* でない */
    expect(v.monthLayer.startsWith("NOISE_")).toBe(false);
    expect(cell("月盤の判定（東）")).toBe("凶殺に当たらない");
    expect(v.dayLayer).toBe("OPTIMAL");
    expect(cell("日盤の判定（東）")).toBe("吉方");
  });

  it("午未天中殺は、年・月・日のすべてに当たる", () => {
    expect(verdict().voidScopes).toEqual({
      year: true,
      month: true,
      day: true,
    });
    expect(cell("本人の天中殺（日柱から算出）")).toBe("午・未");
    expect(cell("2026年の年支")).toBe("午 → 天中殺の年");
    expect(cell("2026年6月の月支")).toBe("午 → 天中殺の月");
    expect(cell("6月26日の日支")).toBe("未 → 天中殺の日");
  });
});

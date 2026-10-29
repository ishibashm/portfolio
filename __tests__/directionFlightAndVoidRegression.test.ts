import { describe, expect, it } from "vitest";
import {
  calculateVectorCollision,
  EIGHT_DIRECTIONS,
  generateBoard,
  getPersonalVoidZodiac,
  type EightDirection,
  type StarFrequency,
} from "@/utils/ephemerisEngine";
import { getKyusei, getKyuseiBoard } from "@/utils/kigaku";
import { tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";

// 後天定位盤を独立した期待値とする。配列は南を上にした表示順。
const gridDirections = [
  "SE",
  "S",
  "SW",
  "E",
  "CENTER",
  "W",
  "NE",
  "N",
  "NW",
] as const;
const homeStars = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const hazards: [StarFrequency, EightDirection | null, EightDirection | null][] =
  [
    [1, "S", "N"],
    [2, "NE", "SW"],
    [3, "W", "E"],
    [4, "NW", "SE"],
    [5, null, null],
    [6, "SE", "NW"],
    [7, "E", "W"],
    [8, "SW", "NE"],
    [9, "N", "S"],
  ];

describe("飛泊順と五黄殺・暗剣殺の回帰検証", () => {
  it.each(hazards)(
    "中宮%iの配置と凶方位は後天定位盤に一致する",
    (center, gou, anken) => {
      const board = generateBoard(center);
      const expected = homeStars.map(
        (star) => ((star + center - 6 + 9) % 9) + 1,
      );
      expect(gridDirections.map((dir) => board[dir])).toEqual(expected);
      expect(
        getKyuseiBoard(getKyusei(center)).map((star) => star.number),
      ).toEqual(expected);
      // 日付由来の土用殺・破や個人の空亡を混ぜず、三盤の回座を検証する。
      const collision = calculateVectorCollision(1, board, board, board);
      for (const layer of [
        collision.yearLayer,
        collision.monthLayer,
        collision.dayLayer,
        collision.finalVectors,
      ]) {
        expect(
          EIGHT_DIRECTIONS.filter((dir) => layer[dir] === "NOISE_GOU"),
        ).toEqual(gou ? [gou] : []);
        expect(
          EIGHT_DIRECTIONS.filter((dir) => layer[dir] === "NOISE_ANKEN"),
        ).toEqual(anken ? [anken] : []);
      }
    },
  );

  it("六白中宮の北西は五黄殺ではなく暗剣殺", () => {
    const board = generateBoard(6);
    expect(board.NW).toBe(7);
    expect(board.SE).toBe(5);
    expect(
      calculateVectorCollision(1, board, board, board).finalVectors.NW,
    ).toBe("NOISE_ANKEN");
  });
});

const voidPairs = [
  ["戌", "亥"],
  ["申", "酉"],
  ["午", "未"],
  ["辰", "巳"],
  ["寅", "卯"],
  ["子", "丑"],
];

describe("日干支の旬による空亡の回帰検証", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "旬%iの10干支すべてが指定の空亡二支を返す",
    (jun) => {
      for (let offset = 0; offset < 10; offset++) {
        const index = jun * 10 + offset;
        // 2000-01-07 は甲子。基準以前も含む二周期で負の剰余と旬境界を検証。
        for (const cycle of [-60, 0]) {
          const date = new Date(Date.UTC(2000, 0, 7 + cycle + index));
          const result = tenchusatsuForCivilDate(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            date.getUTCDate(),
          );
          expect(result.ganZhiIndex).toBe(index);
          expect(result.tenchusatsu.voidBranches).toEqual(voidPairs[jun]);
          // JST 0時・23時とも同じ日柱の旬となる。
          for (const hour of [0, 23]) {
            const instant = new Date(date.getTime() + (hour - 9) * 3_600_000);
            expect(getPersonalVoidZodiac(instant)).toEqual(voidPairs[jun]);
          }
        }
      }
    },
  );
});

import { describe, expect, it } from "vitest";
import {
  ALL_DIRECTIONS,
  gradeVerdict,
  judgeDayAllDirections,
  judgeDayWithBoards,
} from "@/utils/auspiciousDays";
import { generateBoard, type StarFrequency } from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";
import { GET } from "@/app/api/relocation/auspicious-days/route";

/**
 * 三盤の方位盤（/calendar の立体の盤）の材料。
 *
 * 盤に描く九星と、扇形を塗る判定が**同じ 1 回の計算から**出ていることを
 * 固定する。盤を画面側で組み直すと、盤の時刻や立春・節入りの扱いが
 * 2 か所に分かれ、描いた星と判定が別の日を指しうる。
 *
 * - judgeDayWithBoards の判定は judgeDayAllDirections と完全に同じ
 * - 返す盤は洛書の並び（中宮の星から generateBoard で組んだものと一致）
 * - 盤の星と判定が噛み合う: 五黄の入った方位はその盤の層で五黄殺、
 *   その正反対は暗剣殺（中宮に五黄が入る盤は、どちらも出ない）
 * - API の mode=board は同じ値を返す
 */

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as StarFrequency[];
const DATES = [
  "2026-02-03", // 立春の前日
  "2026-02-04", // 立春
  "2026-07-07", // 小暑（節入りの日）
  "2026-09-30",
  "2027-01-15",
];
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

function params(star: StarFrequency) {
  return {
    honmeiStar: star,
    voidZodiacs: ["戌", "亥"],
    lon: 139.69,
    tenchusatsuMode: "strict" as const,
  };
}
const noonOf = (d: string) =>
  new Date(forecastAnchorMs(new Date(`${d}T12:00:00+09:00`)));

describe("judgeDayWithBoards", () => {
  it.each(DATES.flatMap((d) => STARS.map((s) => ({ d, s }))))(
    "$d・本命 $s: 判定は judgeDayAllDirections と同じ",
    ({ d, s }) => {
      const day = noonOf(d);
      const { verdicts } = judgeDayWithBoards(day, params(s));
      expect(verdicts).toEqual(judgeDayAllDirections(day, params(s)));
    },
  );

  it.each(DATES)("%s: 盤は洛書の並びで、星と判定が噛み合う", (d) => {
    const { verdicts, boards } = judgeDayWithBoards(noonOf(d), params(1));
    const layerOf = {
      year: "yearLayer",
      month: "monthLayer",
      day: "dayLayer",
    } as const;
    for (const key of ["year", "month", "day"] as const) {
      const board = boards[key];
      expect(board).toEqual(generateBoard(board.CENTER));
      if (board.CENTER === 5) continue;
      const gou = ALL_DIRECTIONS.find((dir) => board[dir] === 5)!;
      expect(verdicts[gou][layerOf[key]], `${key} の五黄 ${gou}`).toBe(
        "NOISE_GOU",
      );
      expect(
        verdicts[OPPOSITE[gou]][layerOf[key]],
        `${key} の暗剣 ${OPPOSITE[gou]}`,
      ).toBe("NOISE_ANKEN");
    }
  });

  it("空回りしていない: 日盤の中宮は日ごとに動く", () => {
    const centers = new Set(
      ["2026-09-28", "2026-09-29", "2026-09-30"].map(
        (d) => judgeDayWithBoards(noonOf(d), params(1)).boards.day.CENTER,
      ),
    );
    expect(centers.size).toBe(3);
  });
});

describe("API mode=board", () => {
  it("盤と 8 方位の判定・段階を返す", async () => {
    const q = new URLSearchParams({
      mode: "board",
      date: "2026-09-30",
      birthDate: "1990-05-10",
      lon: "139.69",
      tenchusatsuMode: "strict",
    });
    const res = await GET(
      new Request(`http://localhost/api/relocation/auspicious-days?${q}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-09-30");
    expect(Object.keys(body.directions).sort()).toEqual(
      [...ALL_DIRECTIONS].sort(),
    );

    const { verdicts, boards } = judgeDayWithBoards(noonOf("2026-09-30"), {
      honmeiStar: body.honmeiStar,
      voidZodiacs: body.voidZodiacs,
      lon: 139.69,
      tenchusatsuMode: "strict",
      involuntaryMove: false,
      directionFilterMode: "composite",
    });
    expect(body.boards).toEqual(boards);
    for (const dir of ALL_DIRECTIONS) {
      const v = verdicts[dir];
      expect(body.directions[dir]).toEqual({
        yearLayer: v.yearLayer,
        monthLayer: v.monthLayer,
        dayLayer: v.dayLayer,
        finalStatus: v.finalStatus,
        tier: gradeVerdict(v),
        blocked: v.blockedByTenchusatsu,
        doyouSatsu: v.isDoyouSatsu,
        tendo: v.hasTendo,
      });
    }
  });

  it("生年月日が無ければ 400（既定値で盤を作らない）", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/relocation/auspicious-days?mode=board&date=2026-09-30&lon=139.69",
      ),
    );
    expect(res.status).toBe(400);
  });
});

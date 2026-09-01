import { describe, it, expect } from "vitest";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  EIGHT_DIRECTIONS,
} from "@/utils/ephemerisEngine";

/**
 * 年盤の層（yearLayer）は、同じ気学年（立春〜翌立春の前日）の中では
 * **どの日付で計算しても同じ**でなければならない。
 *
 * これが破れていたのが 2026-08-27 に見つかった歳破の不具合
 * （classicalYearZodiacSaiha.test.ts）。年支が木星黄経から出ていたため、
 * 木星が区画を跨ぐ年の途中で歳破の方位が動き、6 月 1 日を代表点に生成する
 * /houi の年別頁と、今日の日付で計算するツールが食い違った。
 *
 * あの修正は「年支」という個別原因を直した。このテストはその**一般形**を
 * 固定する——今後どんな実装変更があっても、年の層に日付依存の量が紛れ
 * 込んだら（原因が何であれ）ここで止まる。
 *
 * 例外は月交点（NOISE_NODE）だけ。月の交点は実際に年の途中で動く天体量
 * なので、比較の前に SAFE に均す。月交点は processLayer で「他に何も無い
 * 枡」にしか付かないため、この均しで他の凶が隠れることはない。
 */

const normalize = (s: string | undefined) =>
  s === "NOISE_NODE" ? "SAFE" : (s ?? "SAFE");

function yearLayerOn(iso: string, star: number) {
  const d = new Date(iso);
  const c = calculateVectorCollision(
    star as never,
    generateBoard(getClassicalYearStar(d)),
    generateBoard(getClassicalMonthStar(d)),
    generateBoard(getClassicalDayStar(d)),
    [],
    null,
    "MIGRATION",
    d,
  );
  return c.yearLayer;
}

describe("年盤の層は、同じ気学年の中で日付に依らない", () => {
  // 立春（2 月 3〜4 日）を跨がない範囲で、年の初め・中・終わりを取る。
  // 1 月は前年の気学年に属するので「終わり」として前年へ入れる。
  const sampleDates = (y: number) => [
    `${y}-03-01T03:00:00Z`,
    `${y}-06-01T03:00:00Z`,
    `${y}-09-01T03:00:00Z`,
    `${y}-12-15T03:00:00Z`,
    `${y + 1}-01-20T03:00:00Z`,
  ];

  /* 2028 → 2030 に広げた（2026-08-31 の監査）。この不変条件は特定の年に
     依らない構造の話で、狭く取る理由が無い。1 年ぶん 9 星 × 8 方位 × 4 比較
     で、実測の増加は 2 年ぶんで 0.3 秒。 */
  for (const year of [2026, 2027, 2028, 2029, 2030]) {
    it(`${year} 年（全 9 星 × 8 方位 × 年内 5 日付）`, () => {
      for (let star = 1; star <= 9; star++) {
        const dates = sampleDates(year);
        const base = yearLayerOn(dates[0], star);
        for (const iso of dates.slice(1)) {
          const layer = yearLayerOn(iso, star);
          for (const dir of EIGHT_DIRECTIONS) {
            expect(
              normalize(layer[dir]),
              `${year} 星${star} ${dir}: ${dates[0]} と ${iso} で年層が違う`,
            ).toBe(normalize(base[dir]));
          }
        }
      }
    });
  }
});

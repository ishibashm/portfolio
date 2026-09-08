import { describe, it, expect } from "vitest";
import {
  calculateVectorCollision,
  generateBoard,
  getClassicalYearStar,
  getClassicalMonthStar,
  getClassicalDayStar,
  EIGHT_DIRECTIONS,
} from "@/utils/ephemerisEngine";
import { contentYears } from "@/lib/kigakuContent";

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
     で、実測の増加は 2 年ぶんで 0.3 秒。

     **固定の一覧だけにしない**（2026-09-08 の監査）。/houi の年別頁が
     出す年は `contentYears()`＝[今年, +1, +2] で、年が進むと固定の一覧の
     外へ出る。2029 年になると記事は 2031 年ぶんを出すのに、この検査は
     2030 で止まっていた。**いちばん新しい記事の年が黙って検査から
     外れる**ので、実際に出している年を必ず混ぜる。過去に固定した年は
     そのまま残す（当時の回帰を外さないため）。 */
  const YEARS = [
    ...new Set([2026, 2027, 2028, 2029, 2030, ...contentYears()]),
  ].sort((a, b) => a - b);

  it("記事が出している年をすべて含んでいる（検査が置いていかれない）", () => {
    /* 上の union が壊れる（import を消す・sort で潰す等）と、この検査だけが
       落ちる。年の一覧そのものを見張るので、固定の一覧が古くなっても
       気付ける。 */
    for (const y of contentYears()) expect(YEARS).toContain(y);
  });

  for (const year of YEARS) {
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

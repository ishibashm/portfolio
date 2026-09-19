import { describe, expect, it } from "vitest";
import {
  EIGHT_DIRECTIONS,
  calculateVectorCollision,
  generateBoard,
  getCurrentEnvironmentalFrequencies,
} from "@/utils/ephemerisEngine";
import { directionBoardInstant } from "@/utils/boardInstant";
import { contentYears, getYearDirections } from "@/lib/kigakuContent";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

/**
 * **年盤には月交点（NOISE_NODE）を入れない**（利用者の判断。2026-09-19）。
 *
 * ## 何が壊れていたか
 *
 * `/houi` の年別頁（`getYearDirections`）は `calculateVectorCollision` に
 * 月交点を `null` で渡し、道具（`auspiciousDays`・`SolarTimeClock`）は
 * `env.raw.lunarNode` を渡していた。**同じエンジンに違う入力を渡していた。**
 *
 * さらにエンジンの「グローバルノイズと最適化の適用」は月交点を吉方位より
 * 先に当てるので、**月交点が吉方位を先取りして潰す。**2027 年の南西が
 * それで、頁が「吉方位」と書く 4 星（一白・二黒・五黄・八白）に対し、
 * 道具の年層は月交点を出していた。**同じサイトの記事と道具が、同じ年の
 * 同じ方位に別の札を出していた。**
 *
 * ## なぜ年盤だけ外すのか
 *
 * 月交点は約 19 年で一巡し、1 年で 19 度ほど進む。**年の途中で八方位の
 * 境目を跨ぐ**ので、年という粒度の盤に混ぜると年盤が日付に依存する。
 * 月盤・日盤・最終判定には今までどおり入れる（月交点をやめる話ではない）。
 *
 * ## 実測（2026-09-19）
 *
 * 2026〜2030 年 × 9 星 × 4 空亡 × 週 1 × 8 方位＝76,320 件で、
 * **段階（S〜X）の分布は変更の前後で完全に同一**だった。
 *
 *     X 64024 / D 4476 / B 3090 / A 2211 / C 1868 / S 651
 *
 * 月交点がある方位は日盤の側でも月交点になるため、年層の月交点は
 * 段階の計算では常に重複していた。**候補日は 1 日も増減していない。**
 * 変わるのは年盤の札の表示と、記事との一致だけ。
 */

const LON = 136.9008;

/** 過去に固定した年は残す。記事が出す年は必ず混ぜる（検査が置いていかれない）。 */
const YEARS = [
  ...new Set([2026, 2027, 2028, 2029, 2030, ...contentYears()]),
].sort((a, b) => a - b);

/** 気学年の中の代表日。立春を跨がない範囲で散らす。 */
const SAMPLE_DAYS = [10, 100, 200, 300];

function layersOn(year: number, dayOffset: number, star: number) {
  const d = new Date(Date.UTC(year, 1, 5) + dayOffset * 86_400_000);
  const instant = directionBoardInstant(d, 0, LON);
  const env = getCurrentEnvironmentalFrequencies(instant, LON, "independent");
  return calculateVectorCollision(
    star as never,
    generateBoard(env.classicalYearStar),
    generateBoard(env.classicalMonthStar),
    generateBoard(env.classicalDayStar),
    [],
    env.raw.lunarNode,
    "MIGRATION",
    instant,
    LON,
    undefined,
    "traditional",
  );
}

describe("年盤に月交点が入らない", () => {
  it("記事が出している年をすべて含んでいる", () => {
    for (const y of contentYears()) expect(YEARS).toContain(y);
  });

  it.each(YEARS)("%s 年: 年層に月交点が 1 件も無い", (year) => {
    for (const day of SAMPLE_DAYS) {
      for (let star = 1; star <= 9; star++) {
        const c = layersOn(year, day, star);
        for (const dir of EIGHT_DIRECTIONS) {
          expect(
            c.yearLayer[dir],
            `${year} 星${star} ${DIRECTION_LABELS[dir]}（+${day}日）に月交点が出た`,
          ).not.toBe("NOISE_NODE");
        }
      }
    }
  });

  it("月盤・日盤には今までどおり出る（月交点をやめたのではない）", () => {
    /* 年盤から外すつもりが全部から外れていた、を防ぐ。ここが 0 件に
       なったら、それは月交点そのものを消してしまったということ。 */
    let month = 0;
    let day = 0;
    for (const year of YEARS) {
      for (const offset of SAMPLE_DAYS) {
        for (let star = 1; star <= 9; star++) {
          const c = layersOn(year, offset, star);
          for (const dir of EIGHT_DIRECTIONS) {
            if (c.monthLayer[dir] === "NOISE_NODE") month++;
            if (c.dayLayer[dir] === "NOISE_NODE") day++;
          }
        }
      }
    }
    expect(month).toBeGreaterThan(0);
    expect(day).toBeGreaterThan(0);
  });
});

describe("年別頁と道具が同じ年盤を出す", () => {
  /*
    この検査がこの変更の芯。`getYearDirections`（記事）と
    `calculateVectorCollision`（道具）は入力が違っていたので、
    月交点の方位だけ別の札になっていた。**旧実装に戻すと必ず落ちる。**
  */
  it.each(YEARS)("%s 年: 9 星 × 8 方位 × 年内 4 日で一致する", (year) => {
    for (let star = 1; star <= 9; star++) {
      const page = getYearDirections(year, star).verdicts;
      for (const day of SAMPLE_DAYS) {
        const tool = layersOn(year, day, star).yearLayer;
        for (const v of page) {
          expect(
            tool[v.direction],
            `${year} 星${star} ${v.jp}（+${day}日）: 記事は ${v.status}、道具は ${tool[v.direction]}`,
          ).toBe(v.status);
        }
      }
    }
  });
});

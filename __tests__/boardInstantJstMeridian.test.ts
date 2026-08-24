/**
 * 盤の太陽時は日本標準時（標準子午線 135 度）で出すこと。
 *
 * `calculateSolarTime` の既定は `Math.round(経度 / 15)` で、経度から
 * タイムゾーンを推測する。出生地が海外のときはそれでよいが、**日本の
 * 出発地に当てると端で 60 分ずれる。**推測が 9 になるのは経度
 * 127.5〜142.5 度のあいだだけで、その外は 8 か 10 になる。
 *
 *   石垣 124.16 / 宮古島 125.28   → 8（標準子午線 120 度）
 *   帯広 143.2 / 釧路 144.38 / 根室 145.58 → 10（同 150 度）
 *
 * どの土地も実際には JST を使っているので、9 が正しい。
 *
 * 盤は正午を基準にするので日はまたがないが、**節入りが正午の前後
 * 60 分に来る日は月星が変わる。**旧実装をそのまま写し、
 *
 *   1. 全国の経度で「tz=9 で出した太陽時」と一致することを固定する
 *   2. 新旧が食い違う日を名指しで固定する
 *   3. 旧実装に戻すと落ちることを確かめる
 *
 * の 3 つを置く。
 */
import { describe, expect, it } from "vitest";
import { directionBoardInstant, forecastAnchorMs } from "@/utils/boardInstant";
import { calculateSolarTime } from "@/utils/solarTime";
import { getCurrentEnvironmentalFrequencies } from "@/utils/ephemerisEngine";

/** 直す前の実装。tz を渡さず、経度から推測させていた。 */
function legacyInstant(base: Date, lon: number): Date {
  return calculateSolarTime(new Date(forecastAnchorMs(base)), lon).solarTime;
}

/** 盤の 3 つの星だけを取り出す（時星は時刻ごとに動くので見ない）。 */
function boardOf(instant: Date, lon: number): string {
  const e = getCurrentEnvironmentalFrequencies(instant, lon, "independent");
  return `${e.classicalYearStar}/${e.classicalMonthStar}/${e.classicalDayStar}`;
}

const jstNoon = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));

/** 端まで含めた日本の経度。127.5 と 142.5 の外側を必ず入れること。 */
const LONS: [string, number][] = [
  ["与那国", 122.94],
  ["石垣", 124.16],
  ["宮古島", 125.28],
  ["那覇", 127.68],
  ["福岡", 130.4],
  ["大阪", 135.5],
  ["東京", 139.69],
  ["帯広", 143.2],
  ["釧路", 144.38],
  ["根室", 145.58],
];

describe("盤の太陽時は日本標準時で出す", () => {
  it("どの経度でも tz=9 で出した太陽時と一致する", () => {
    const bad: string[] = [];
    for (const [name, lon] of LONS) {
      for (let i = 0; i < 40; i++) {
        const base = new Date(jstNoon(2026, 1, 1).getTime() + i * 9 * 86400000);
        const got = directionBoardInstant(base, 0, lon).getTime();
        const want = calculateSolarTime(
          new Date(forecastAnchorMs(base)),
          lon,
          9,
        ).solarTime.getTime();
        if (got !== want) bad.push(`${name} ${base.toISOString()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("推測が 9 にならない経度では、旧実装と 60 分ずれる", () => {
    // ここが 0 分だと、この test 自体が空回りしている。
    const at = jstNoon(2026, 6, 1);
    const gap = (lon: number) =>
      Math.round(
        (legacyInstant(at, lon).getTime() -
          directionBoardInstant(at, 0, lon).getTime()) /
          60000,
      );
    expect(gap(124.16)).toBe(60); // 石垣。推測 8（標準子午線 120 度）
    expect(gap(125.28)).toBe(60); // 宮古島
    expect(gap(143.2)).toBe(-60); // 帯広。推測 10（同 150 度）
    expect(gap(144.38)).toBe(-60); // 釧路
    expect(gap(145.58)).toBe(-60); // 根室
    // 推測が 9 になる範囲では差が出ない。
    expect(gap(127.68)).toBe(0); // 那覇
    expect(gap(139.69)).toBe(0); // 東京
  });

  it("節入りの日に盤が変わる（名指し）", () => {
    // 60 分のずれが効くのは、節入りが正午の前後 60 分に来る日だけ。
    const cases: [string, number, [number, number, number]][] = [
      ["石垣", 124.16, [2026, 12, 7]], // 大雪
      ["石垣", 124.16, [2028, 6, 5]], // 芒種
      ["釧路", 144.38, [2026, 12, 7]],
      ["釧路", 144.38, [2029, 11, 7]], // 立冬
    ];
    for (const [name, lon, [y, m, d]] of cases) {
      const base = jstNoon(y, m, d);
      const now = boardOf(directionBoardInstant(base, 0, lon), lon);
      const before = boardOf(legacyInstant(base, lon), lon);
      expect([name, y, m, d, now === before]).toEqual([name, y, m, d, false]);
    }
  });

  it("食い違うのは 2 年で 1 日だけ（直した範囲が広がっていない）", () => {
    // 全期間を毎回走査すると 20 秒かかるので、ここは 2 年に絞る。
    // 4 年ぶんの内訳（石垣 4 日 / 釧路・帯広・根室 3 日）は上の名指しで見る。
    const counts: Record<string, number> = {};
    for (const [name, lon] of [
      ["石垣", 124.16],
      ["釧路", 144.38],
      ["東京", 139.69],
    ] as [string, number][]) {
      let n = 0;
      for (let i = 0; i < 731; i++) {
        const base = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
        if (
          boardOf(directionBoardInstant(base, 0, lon), lon) !==
          boardOf(legacyInstant(base, lon), lon)
        )
          n++;
      }
      counts[name] = n;
    }
    // 東京は 0。推測が 9 になる範囲なので、そもそも太陽時が同じ。
    expect(counts).toEqual({ 石垣: 1, 釧路: 1, 東京: 0 });
  });
});

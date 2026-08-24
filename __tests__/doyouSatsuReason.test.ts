/**
 * 土用殺の日に「五黄殺」としか出せなかったのを、理由が分かる形にする。
 *
 * 土用殺は年盤・月盤・日盤のどの層にも出ない。`calculateVectorCollision`
 * の最後で**最終だけを NOISE_GOU に上書きする**。NOISE_GOU の見出しは
 * 画面のどこでも「五黄殺」なので、
 *
 *   年盤 大吉 / 月盤 大吉 / 日盤 大吉  なのに  最終 五黄殺・段階 X
 *
 * という日ができる。三盤が全部大吉なのに大凶と言われて、理由が画面から
 * 分からない。
 *
 * 状態そのものを NOISE_GOU から分けると配色と札の対応が全画面に波及する
 * ので、まずは**どの方位が土用殺なのかを持ち回れるように**した。
 * **判定は変えていない。**その固定もここで行う。
 */
import { describe, expect, it } from "vitest";
import {
  ALL_DIRECTIONS,
  gradeVerdict,
  judgeDay,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import {
  DOYOU_SATSU_DIRECTIONS,
  type Direction,
} from "@/utils/ephemerisEngine";

const params = {
  honmeiStar: 7 as const,
  voidZodiacs: ["子", "丑"],
  lon: 135.75,
  tenchusatsuMode: "off" as const,
};

const jstNoon = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));

describe("土用殺の方位が分かる", () => {
  it("三盤とも大吉なのに大凶になる日に、理由の印が付く", () => {
    // 秋土用の北西。2026-10-23。
    const v = judgeDay(jstNoon(2026, 10, 23), { ...params, direction: "NW" });
    expect([v.yearLayer, v.monthLayer, v.dayLayer]).toEqual([
      "OPTIMAL",
      "OPTIMAL",
      "OPTIMAL",
    ]);
    expect(v.finalStatus).toBe("NOISE_GOU");
    expect(gradeVerdict(v)).toBe("X");
    // ここが新しい。以前は「五黄殺」としか言えなかった。
    expect(v.isDoyouSatsu).toBe(true);
  });

  it("同じ日の他の方位には印が付かない", () => {
    const all = judgeDayAllDirections(jstNoon(2026, 10, 23), params);
    const marked = ALL_DIRECTIONS.filter((d) => all[d].isDoyouSatsu);
    expect(marked).toEqual(["NW"]);
  });

  it("土用の期間外は誰にも印が付かない", () => {
    // 6 月中旬。夏土用（7 月下旬〜）にも春土用（4 月中旬〜5 月上旬）にも入らない。
    const all = judgeDayAllDirections(jstNoon(2026, 6, 15), params);
    expect(ALL_DIRECTIONS.filter((d) => all[d].isDoyouSatsu)).toEqual([]);
  });

  it("印が付く方位は必ず土用殺の方位表と一致し、最終も NOISE_GOU", () => {
    // 2 年ぶんを走査して、印と実態が食い違わないことを固定する。
    const seasons = new Set<Direction>(Object.values(DOYOU_SATSU_DIRECTIONS));
    const bad: string[] = [];
    let marked = 0;
    for (let i = 0; i < 730; i++) {
      const d = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
      const all = judgeDayAllDirections(d, params);
      for (const dir of ALL_DIRECTIONS) {
        const v = all[dir];
        if (!v.isDoyouSatsu) continue;
        marked++;
        if (!seasons.has(dir as Direction) || v.finalStatus !== "NOISE_GOU") {
          bad.push(`${v.date} ${dir} ${v.finalStatus}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // 土用は年 4 回 × 約 18 日、間日を除いた日数ぶん。0 でも全日でもない。
    expect(marked).toBeGreaterThan(50);
    expect(marked).toBeLessThan(200);
  });

  it("判定は変えていない（段階と三盤吉は印の有無に依らない）", () => {
    // 印は読み取り用の情報で、どの数字にも入っていないことを固定する。
    let checked = 0;
    for (let i = 0; i < 200; i++) {
      const d = new Date(jstNoon(2026, 9, 1).getTime() + i * 86400000);
      const all = judgeDayAllDirections(d, params);
      for (const dir of ALL_DIRECTIONS) {
        const v = all[dir];
        if (!v.isDoyouSatsu) continue;
        checked++;
        // 土用殺は最終だけを上書きするので、段階は必ず X、三盤吉は必ず false。
        expect(gradeVerdict(v)).toBe("X");
        expect(v.isTripleAuspicious).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("絞り込みモードを変えると土用殺は判定から消える（現状の記録）", () => {
    // filterCollisionByMode は最終を組み直すが、そこで土用殺を当て直して
    // いない。既定（composite）以外では土用殺が効かない。**直していない。**
    // 印はこの実態に合わせてあり、画面と食い違わない。
    const composite = judgeDay(jstNoon(2026, 10, 23), {
      ...params,
      direction: "NW",
      directionFilterMode: "composite",
    });
    const environmental = judgeDay(jstNoon(2026, 10, 23), {
      ...params,
      direction: "NW",
      directionFilterMode: "environmental",
    });
    expect(composite.isDoyouSatsu).toBe(true);
    expect(composite.finalStatus).toBe("NOISE_GOU");
    expect(environmental.isDoyouSatsu).toBe(false);
    expect(environmental.finalStatus).not.toBe("NOISE_GOU");
  });
});

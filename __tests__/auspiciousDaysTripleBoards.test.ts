/**
 * 「三盤吉」は三つとも吉であること。
 *
 * 旧条件は「最終が吉」＋「どの盤にも凶が無い」だった。移転の最終判定は
 * `criticalLayers = [年, 月]` だけを見るので、**年か月のどちらか 1 枚が
 * 吉なら最終は吉になる。**結果として、3 枚のうち 1 枚しか吉でない日まで
 * 「三盤吉」として数えていた。
 *
 * 同じ理由で段階 A（吉2盤・凶なし）は 1 件も出なかった。吉が 2 枚あれば
 * 年か月が必ず含まれるので、A に落ちる前に S を取ってしまうため。
 *
 * ここでは旧条件をそのまま写し、
 *
 *   1. 新条件が「三盤とも吉」であることを、広い範囲で固定する
 *   2. 旧 S がどこへ振り分け直されたかを実数で固定する
 *   3. 旧条件に戻すとどれも落ちることを確かめる
 *
 * の 3 つを置く。
 */
import { describe, it, expect } from "vitest";
import {
  ALL_DIRECTIONS,
  gradeVerdict,
  isAuspicious,
  isInauspicious,
  judgeDay,
  judgeDayAllDirections,
  type DayVerdict,
} from "@/utils/auspiciousDays";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";

// 三碧木星・午未天中殺。既存のテストと同じ人。
const BIRTH = new Date("1997-06-15T04:26:00+09:00");
const NAGOYA_LON = 136.9008;

const base = {
  honmeiStar: getHonmeiStar(BIRTH).classical,
  voidZodiacs: getPersonalVoidZodiac(BIRTH),
  lon: NAGOYA_LON,
  tenchusatsuMode: "off" as const,
};

/** 日本時間のその日の正午（実行環境のタイムゾーンに依らない）。 */
const jstNoon = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));

/** 直す前の条件。最終が吉で、どの盤にも凶が無ければ「三盤吉」だった。 */
function legacyTripleAuspicious(v: DayVerdict): boolean {
  return (
    isAuspicious(v.finalStatus) &&
    !isInauspicious(v.yearLayer) &&
    !isInauspicious(v.monthLayer) &&
    !isInauspicious(v.dayLayer)
  );
}

const auspiciousBoards = (v: DayVerdict) =>
  [v.yearLayer, v.monthLayer, v.dayLayer].filter(isAuspicious).length;

describe("三盤吉は三つとも吉であること", () => {
  it("isTripleAuspicious の日は、年・月・日がすべて吉", () => {
    const bad: string[] = [];
    for (let i = 0; i < 730; i++) {
      const d = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
      const all = judgeDayAllDirections(d, base);
      for (const dir of ALL_DIRECTIONS) {
        const v = all[dir];
        if (!v.isTripleAuspicious) continue;
        if (auspiciousBoards(v) !== 3) {
          bad.push(
            `${v.date} ${dir} 年=${v.yearLayer} 月=${v.monthLayer} 日=${v.dayLayer}`,
          );
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("旧条件で三盤吉だった日の振り分け（2026〜2027 の 2 年・全方位）", () => {
    // 実数で固定する。旧条件に戻すと 309/309/0/0 になって落ちる。
    let legacy = 0;
    let now = 0;
    let toA = 0;
    let toB = 0;
    for (let i = 0; i < 730; i++) {
      const d = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
      const all = judgeDayAllDirections(d, base);
      for (const dir of ALL_DIRECTIONS) {
        const v = all[dir];
        const was = legacyTripleAuspicious(v);
        if (was) legacy++;
        if (v.isTripleAuspicious) now++;
        if (was && !v.isTripleAuspicious) {
          const t = gradeVerdict(v);
          if (t === "A") toA++;
          else if (t === "B") toB++;
        }
      }
    }
    expect({ legacy, now, toA, toB }).toEqual({
      legacy: 309,
      now: 14,
      toA: 101,
      toB: 194,
    });
    // 旧 S は「新 S ＋ A ＋ B」に過不足なく割れる。取りこぼしも増えもしない。
    expect(now + toA + toB).toBe(legacy);
  });

  it("段階 A（吉2盤・凶なし）が実際に出るようになる", () => {
    // 直す前は本命星 9 通り × 730 日 × 8 方位 = 52,560 通りを走査して
    // **0 件**だった。構造上ありえない段階をラベルだけ用意していた。
    let a = 0;
    for (let i = 0; i < 730; i++) {
      const d = new Date(jstNoon(2026, 1, 1).getTime() + i * 86400000);
      const all = judgeDayAllDirections(d, base);
      for (const dir of ALL_DIRECTIONS) {
        if (gradeVerdict(all[dir]) === "A") a++;
      }
    }
    expect(a).toBe(101);
  });

  it("名指しの例：吉が何枚かで段階が変わる", () => {
    const at = (y: number, m: number, d: number, dir: string) =>
      judgeDayAllDirections(jstNoon(y, m, d), base)[dir];

    // 年だけ吉。旧条件では「三盤吉」だった。
    const one = at(2026, 1, 6, "E");
    expect([one.yearLayer, one.monthLayer, one.dayLayer]).toEqual([
      "OPTIMAL",
      "SAFE",
      "SAFE",
    ]);
    expect(one.finalStatus).toBe("OPTIMAL");
    expect(legacyTripleAuspicious(one)).toBe(true);
    expect(one.isTripleAuspicious).toBe(false);
    expect(gradeVerdict(one)).toBe("B");

    // 年と日が吉。旧条件では「三盤吉」だった。
    const two = at(2026, 1, 9, "E");
    expect([two.yearLayer, two.monthLayer, two.dayLayer]).toEqual([
      "OPTIMAL",
      "SAFE",
      "OPTIMAL",
    ]);
    expect(legacyTripleAuspicious(two)).toBe(true);
    expect(two.isTripleAuspicious).toBe(false);
    expect(gradeVerdict(two)).toBe("A");

    // 三つとも吉。ここだけが三盤吉。
    const three = at(2026, 9, 16, "SE");
    expect([three.yearLayer, three.monthLayer, three.dayLayer]).toEqual([
      "OPTIMAL",
      "OPTIMAL",
      "OPTIMAL",
    ]);
    expect(three.isTripleAuspicious).toBe(true);
    expect(gradeVerdict(three)).toBe("S");
  });

  it("土用殺の日は三盤吉に混ざらない（最終の判定を外さない）", () => {
    // 土用殺は年・月・日のどの層にも出ず、`calculateVectorCollision` の
    // 最後に最終だけを NOISE_GOU に上書きする。条件から最終を落とすと、
    // 三盤とも OPTIMAL のこの日が三盤吉に混ざってしまう。
    //
    // 上の人（三碧・午未空亡）には 2026〜2027 年に該当日が無いので、
    // ここだけ別の人で見る（七赤・子丑空亡・明石）。秋土用の北西。
    const v = judgeDay(jstNoon(2026, 10, 23), {
      honmeiStar: 7,
      voidZodiacs: ["子", "丑"],
      lon: 135.75,
      direction: "NW",
      tenchusatsuMode: "off",
    });
    expect([v.yearLayer, v.monthLayer, v.dayLayer]).toEqual([
      "OPTIMAL",
      "OPTIMAL",
      "OPTIMAL",
    ]);
    expect(v.finalStatus).toBe("NOISE_GOU");
    expect(v.isTripleAuspicious).toBe(false);
    expect(gradeVerdict(v)).toBe("X");
  });
});

/**
 * 地（空間）の点に、同行者の人数ぶんの一律 60 点が混ざっていた件を固定する。
 *
 * 旧実装は歩みのループの**内側**で
 *
 *     members.forEach((m) => {
 *       const mBirth = parseSafeDate(m.birthDate);
 *       const mStar = getClassicalYearStar(mBirth);  // ← 使わずに捨てていた
 *       totalScore += 60;
 *       count++;
 *     });
 *
 * としていた。同行者の本命星を計算しておきながら結果を読んでいないので、
 * **誰を連れて行っても点は動かない。**動くのは人数だけで、点が一律 60 に
 * 引き寄せられる。しかも歩みのループの内側なので、入る個数は
 * 歩み × 人数。
 *
 * 地の点は総合点の 6 割を占め（`spaceMetrics.score * 0.6`）、40 以下で
 * 「地が低い」の注意が出る。**大凶の歩みでも同行者を 2 人足すと 40 を
 * 超えて注意が消えていた。**
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  rateToPoints,
  spaceScoreFromRatings,
} from "@/components/nba/TenChiJinEvaluation";

/** 旧実装。同行者 1 人につき 60 点を歩みごとに足していた。 */
function legacySpaceScore(ratings: string[], memberCount: number): number {
  let total = 0;
  let count = 0;
  for (const r of ratings) {
    total += rateToPoints(r);
    count++;
    for (let i = 0; i < memberCount; i++) {
      total += 60;
      count++;
    }
  }
  return count > 0 ? Math.round(total / count) : 60;
}

const RATINGS = ["大吉", "吉", "普通", "凶", "大凶"];

describe("地の点は歩みの見立てだけで決まる", () => {
  it("同行者を増やしても、旧実装だけが 60 点へ寄っていく", () => {
    // 60 点そのものの「普通」だけは仮置きと同じ値なので動かない。
    for (const r of RATINGS.filter((x) => x !== "普通")) {
      const now = spaceScoreFromRatings([r]);
      let prev = now;
      for (const n of [1, 2, 4, 8]) {
        const legacy = legacySpaceScore([r], n);
        // 人数が増えるほど 60 に近づく
        expect(Math.abs(60 - legacy)).toBeLessThan(Math.abs(60 - prev));
        prev = legacy;
      }
    }
  });

  it("見立てをそのまま点にして平均する", () => {
    expect(spaceScoreFromRatings(["大吉"])).toBe(100);
    expect(spaceScoreFromRatings(["大凶"])).toBe(0);
    expect(spaceScoreFromRatings(["大吉", "大凶"])).toBe(50);
    expect(spaceScoreFromRatings(["吉", "凶"])).toBe(50);
    // 歩みが 1 つも評価されていないときは従来どおり 60
    expect(spaceScoreFromRatings([])).toBe(60);
  });

  /**
   * 空回りするテストにしないための固定。
   * 旧実装に戻すと、下の表のとおり同行者の人数で点が動く。
   */
  it("旧実装は同行者の人数だけで点が動いていた", () => {
    const shifts: string[] = [];
    for (const r of RATINGS) {
      for (const n of [1, 2, 4]) {
        const legacy = legacySpaceScore([r], n);
        const now = spaceScoreFromRatings([r]);
        if (legacy !== now)
          shifts.push(`${r} 同行者${n}人 旧=${legacy} 新=${now}`);
      }
    }
    expect(shifts).toEqual([
      "大吉 同行者1人 旧=80 新=100",
      "大吉 同行者2人 旧=73 新=100",
      "大吉 同行者4人 旧=68 新=100",
      "吉 同行者1人 旧=70 新=80",
      "吉 同行者2人 旧=67 新=80",
      "吉 同行者4人 旧=64 新=80",
      "凶 同行者1人 旧=40 新=20",
      "凶 同行者2人 旧=47 新=20",
      "凶 同行者4人 旧=52 新=20",
      "大凶 同行者1人 旧=30 新=0",
      "大凶 同行者2人 旧=40 新=0",
      "大凶 同行者4人 旧=48 新=0",
    ]);
    // 「普通」は 60 点なので、仮置きの 60 と同じで動かなかった
    expect(legacySpaceScore(["普通"], 4)).toBe(60);
  });

  /**
   * 「地が低い」の注意は 40 以下で出る（`isChiLow`）。旧実装では
   * 大凶の歩みでも同行者 2 人で 40 を超えて注意が消えていた。
   */
  it("大凶の歩みは同行者が何人いても注意が出る", () => {
    const isChiLow = (score: number) => score <= 40;
    // 新実装は同行者を受け取らないので、人数に関わらずこの 1 つ
    expect(isChiLow(spaceScoreFromRatings(["大凶"]))).toBe(true);
    // 旧実装では 3 人以上で消えていた
    expect(isChiLow(legacySpaceScore(["大凶"], 2))).toBe(true);
    expect(isChiLow(legacySpaceScore(["大凶"], 3))).toBe(false);
  });

  /**
   * 仮置きは歩みのループの**内側**にあったので、歩みが増えると
   * 混ざる個数も掛け算で増えていた。
   */
  it("歩みが複数あると仮置きは歩み × 人数ぶん入っていた", () => {
    // 3 歩すべて大吉、同行者 2 人 → 実点 3 個 + 仮置き 6 個
    expect(legacySpaceScore(["大吉", "大吉", "大吉"], 2)).toBe(
      Math.round((100 * 3 + 60 * 6) / 9),
    );
    expect(spaceScoreFromRatings(["大吉", "大吉", "大吉"])).toBe(100);
  });

  /**
   * 上の検証は切り出した純関数だけを見るので、**画面側で仮置きが戻っても
   * 気付けない。**`spaceMetrics` が同行者を見ていないことを実物で確かめる。
   *
   * 戻すと `members` が useMemo の依存に必要になり、ここが落ちる。
   */
  it("画面側の spaceMetrics は同行者を読んでいない", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/nba/TenChiJinEvaluation.tsx"),
      "utf8",
    );
    const start = src.indexOf("const spaceMetrics = useMemo(");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("// 3. CALCULATE JIN", start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);

    expect(block).not.toContain("members");
    // 依存配列も見る。members が入っていれば読んでいる証拠。
    expect(block).toContain("}, [mode, steps, singleStepIndex]);");
  });
});

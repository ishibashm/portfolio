import { describe, expect, it } from "vitest";
import {
  adviseTargetDate,
  tierRank,
  type TimelineDay,
} from "@/utils/targetDateRationale";

/**
 * 目標日の助言。
 *
 * ここは**判定を作らない層**で、timeline が返した段階を読んで並べ替える
 * だけ。だからテストも段階を直接与えて、選び方（いちばん近い日・前優先・
 * 天中殺は候補にしない）だけを固定する。
 */

function day(
  date: string,
  tiers: Record<string, string>,
  extra: Partial<TimelineDay> = {},
): TimelineDay {
  return {
    date,
    weekday: 0,
    rokuyo: "先勝",
    tags: [],
    blocked: false,
    tiers,
    ...extra,
  };
}

describe("段階の強さ", () => {
  it("S がいちばん良く、X がいちばん悪い", () => {
    expect(tierRank("S")).toBeLessThan(tierRank("A"));
    expect(tierRank("D")).toBeLessThan(tierRank("X"));
  });

  it("知らない値は X より下に落とす（黙って良い側に紛れない）", () => {
    expect(tierRank("Z")).toBeGreaterThan(tierRank("X"));
  });
});

describe("目標日が範囲に無いとき", () => {
  it("助言を出さないことが分かる形で返る", () => {
    const days = [day("2026-09-01", { N: "S" })];
    const r = adviseTargetDate(days, "2026-10-01");
    expect(r.targetInRange).toBe(false);
    expect(r.target).toBeNull();
  });
});

describe("もっと良い日を探す", () => {
  const days = [
    day("2026-09-01", { N: "C", S: "S" }),
    day("2026-09-02", { N: "B", S: "A" }),
    day("2026-09-03", { N: "C", S: "C" }), // 目標日
    day("2026-09-04", { N: "A", S: "D" }),
    day("2026-09-10", { N: "S", S: "S" }),
  ];

  it("目標日の段階をそのまま返す", () => {
    const r = adviseTargetDate(days, "2026-09-03");
    expect(r.targetInRange).toBe(true);
    const north = r.advice.find((a) => a.direction === "N");
    expect(north?.tier).toBe("C");
  });

  it("より良い日のうち、いちばん近いものを出す", () => {
    const r = adviseTargetDate(days, "2026-09-03");
    const north = r.advice.find((a) => a.direction === "N");
    // 9/2 の B と 9/4 の A はどちらも 1 日違い。同着なら前を採る。
    expect(north?.better?.date).toBe("2026-09-02");
    expect(north?.better?.daysAway).toBe(1);
    expect(north?.better?.daysFromTarget).toBe(-1);
  });

  it("いちばん良い日は距離に関係なく最良の段階から選ぶ", () => {
    const r = adviseTargetDate(days, "2026-09-03");
    const north = r.advice.find((a) => a.direction === "N");
    expect(north?.best?.date).toBe("2026-09-10");
    expect(north?.best?.tier).toBe("S");
  });

  it("目標日より悪い日は「より良い日」に出ない", () => {
    const r = adviseTargetDate(days, "2026-09-03");
    const south = r.advice.find((a) => a.direction === "S");
    // 南は 9/3 が C。9/4 の D は候補外、9/1 の S と 9/2 の A が候補。
    expect(south?.better?.date).toBe("2026-09-02");
  });

  it("既に最良なら「より良い日」は無い", () => {
    const r = adviseTargetDate(days, "2026-09-10");
    const north = r.advice.find((a) => a.direction === "N");
    expect(north?.tier).toBe("S");
    expect(north?.better).toBeNull();
  });
});

describe("天中殺", () => {
  it("塞がった日は候補にしない（S でも動けないため）", () => {
    const days = [
      day("2026-09-02", { N: "S" }, { blocked: true }),
      day("2026-09-03", { N: "C" }),
      day("2026-09-05", { N: "B" }),
    ];
    const r = adviseTargetDate(days, "2026-09-03");
    const north = r.advice.find((a) => a.direction === "N");
    expect(north?.better?.date).toBe("2026-09-05");
    expect(north?.best?.date).toBe("2026-09-05");
  });

  it("目標日が塞がっていれば、動ける日はすべて「より良い日」", () => {
    /*
      段階だけで比べると、塞がった日の S より低い日は候補から外れて
      しまい、「もっと良い日はありません」と出る。動けない日を基準に
      するのが誤りなので、塞がっているときは段階で切らない。
    */
    const days = [
      day("2026-09-03", { N: "S" }, { blocked: true }),
      day("2026-09-04", { N: "D" }),
    ];
    const r = adviseTargetDate(days, "2026-09-03");
    const north = r.advice.find((a) => a.direction === "N");
    expect(north?.blocked).toBe(true);
    expect(north?.better?.date).toBe("2026-09-04");
  });
});

describe("並び", () => {
  it("目標日の段階が良い方位から並ぶ", () => {
    const days = [day("2026-09-03", { N: "D", E: "S", S: "B" })];
    const r = adviseTargetDate(days, "2026-09-03");
    expect(r.advice.map((a) => a.direction)).toEqual(["E", "S", "N"]);
  });

  it("方位の日本語名が付く", () => {
    const days = [day("2026-09-03", { NE: "C" })];
    const r = adviseTargetDate(days, "2026-09-03");
    expect(r.advice[0].directionLabel).toBe("北東");
  });
});

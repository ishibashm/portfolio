import { describe, expect, it } from "vitest";
import { ringsFor } from "@/lib/distanceRings";
import { DIRECTION_UNSTABLE_KM } from "@/lib/directionDistance";

/**
 * 距離の輪は「目盛り」であって、吉凶の帯ではない。
 *
 * 距離で作用の強弱を変えるかは流派差があり、`improvement-backlog` の
 * E で「決まるまで実装しない」としている。輪に意味を持たせると、
 * 決めていないものを決めたことになる。
 *
 * 例外は 5km だけ。`DIRECTION_UNSTABLE_KM` は既に実装にある閾値で、
 * **判定の強弱ではなく判定の当てにならなさ**を言う。
 */
describe("距離の輪", () => {
  it("画面に入らない輪は出さない", () => {
    expect(ringsFor(3).every((r) => r.km <= 3 * 1.2)).toBe(true);
    expect(ringsFor(0)).toEqual([]);
    expect(ringsFor(Number.NaN)).toEqual([]);
  });

  it("多くても 3 本（輪だらけにしない）", () => {
    for (const r of [10, 100, 1000, 5000]) {
      expect(ringsFor(r).length).toBeLessThanOrEqual(3);
    }
  });

  it("縮尺が広がると外側の輪に入れ替わる", () => {
    const near = ringsFor(30).map((r) => r.km);
    const far = ringsFor(600).map((r) => r.km);
    expect(Math.max(...far)).toBeGreaterThan(Math.max(...near));
  });

  it("内側から外側の順に並ぶ", () => {
    const km = ringsFor(600).map((r) => r.km);
    expect([...km].sort((a, b) => a - b)).toEqual(km);
  });

  it("5km だけが意味を持ち、他は目盛り", () => {
    const rings = ringsFor(8);
    const unstable = rings.find((r) => r.km === DIRECTION_UNSTABLE_KM);
    expect(unstable?.meaning).toBe("この内側は方位が定まりません");
    for (const r of rings) {
      if (r.km !== DIRECTION_UNSTABLE_KM) expect(r.meaning).toBeNull();
    }
  });

  it("吉凶を思わせる語を輪に付けていない", () => {
    /* 「吉」「凶」「強」「弱」を輪の文言に入れない。距離で強弱を
       変えていないので、書くと嘘になる。 */
    for (const r of [8, 60, 400, 2000]) {
      for (const ring of ringsFor(r)) {
        if (!ring.meaning) continue;
        expect(/[吉凶]|強|弱/.test(ring.meaning)).toBe(false);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  calculateVectorCollision,
  generateBoard,
} from "../src/utils/ephemerisEngine";

/**
 * 土用殺の方位が、1 年を通して変わらないこと。
 *
 * `calculateVectorCollision` の中で、土用殺の向きを引く 1 行が
 *
 *     doyouSatsuDirections[doyouState.doyouType]   // doyouType は null を取りうる
 *
 * となっていた。`doyouState: any` だったので通っていたが、型を付けると
 * null で添字を引いていることが露見する。JS では `obj[null]` は
 * `obj["null"]` すなわち undefined になり、直後の `if` で落ちていたので
 * 実害は無い（= 到達しない枝）。三項に書き換えて型を通したが、
 * **書き換えで結果が変わっていないこと**をここで固定する。
 *
 * 到達しないことの根拠:
 *   isDoyouHazard = inDoyou && !isMabi
 *   inDoyou       = doyouType !== null
 * したがって isDoyouHazard が true のとき doyouType は必ず非 null。
 *
 * 1 年 365 日を総当たりして、土用殺が刻まれる方位が季節の対応表どおりで
 * あること、土用でない日には刻まれないことを見る。
 */

/** 季節ごとの土用殺の向き。実装（doyouSatsuDirections）と同じ表。 */
const EXPECTED: Record<string, string> = {
  SPRING: "SE",
  SUMMER: "SW",
  AUTUMN: "NW",
  WINTER: "NE",
};

/** 盤の影響を混ぜないよう、年月日とも中宮一白で固定する。 */
function collisionFor(date: Date) {
  return calculateVectorCollision(
    3,
    generateBoard(1),
    generateBoard(1),
    generateBoard(1),
    [],
    null,
    "DEFAULT",
    date,
    139.6917,
  );
}

describe("土用殺の方位は季節の対応表どおり", () => {
  const days: Date[] = [];
  for (let i = 0; i < 365; i++) {
    days.push(new Date(Date.UTC(2026, 0, 1, 3) + i * 24 * 60 * 60 * 1000));
  }

  it("土用の日には、その季節の方位に土用殺が刻まれる", () => {
    let hazardDays = 0;
    for (const date of days) {
      const c = collisionFor(date);
      if (!c.doyouState?.isDoyouHazard) continue;
      hazardDays++;

      const type = c.doyouState.doyouType;
      // 到達しない枝（null）に入っていないこと。
      expect(type, `${date.toISOString()} の doyouType が null`).not.toBeNull();

      const dir = EXPECTED[type as string];
      expect(
        c.finalVectors[dir as keyof typeof c.finalVectors],
        `${date.toISOString()}（${type}）の ${dir}`,
      ).toBe("NOISE_GOU");
    }

    // 空回りしていないこと。土用は年 4 回・各 18 日前後あり、
    // そこから間日を除くので、100 日前後は該当する。
    expect(hazardDays).toBeGreaterThan(40);
  });

  it("四季すべてが 1 年の走査に出てくる", () => {
    const seen = new Set<string>();
    for (const date of days) {
      const s = collisionFor(date).doyouState;
      if (s?.isDoyouHazard && s.doyouType) seen.add(s.doyouType);
    }
    expect([...seen].sort()).toEqual(["AUTUMN", "SPRING", "SUMMER", "WINTER"]);
  });

  it("isDoyouHazard が立つ日の doyouType は必ず非 null", () => {
    // 書き換えた三項の偽側（doyouType が null）に入らないことの根拠。
    // ここが崩れたら、旧実装の doyouSatsuDirections[null] も
    // undefined を返していたので、土用殺が静かに刻まれなくなる。
    for (const date of days) {
      const s = collisionFor(date).doyouState;
      if (!s) continue;
      expect(s.isDoyouHazard && s.doyouType === null, date.toISOString()).toBe(
        false,
      );
      // inDoyou と doyouType の対応も、上の論証の前提なので見ておく。
      expect(s.inDoyou, date.toISOString()).toBe(s.doyouType !== null);
    }
  });
});

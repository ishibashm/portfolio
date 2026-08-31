import { describe, expect, it } from "vitest";
import {
  COMPASS_DIRECTIONS,
  directionAngleRange,
  directionFromBearing,
  normalizeBearing,
} from "@/utils/directionGeo";

/**
 * 方位の境目は 1 か所からしか出さない。
 *
 * ## 旧実装（シミュレータが持っていた表）
 *
 * 推奨ゾーンの多角形を描くために、`getDirAngleRanges` が
 *
 *     N: [345, 15], NE: [15, 75], ...        （伝統区分）
 *     N: [337.5, 22.5], NE: [22.5, 67.5], ... （45 度等分）
 *
 * という表を自前で持っていた。**区切りの定義が 2 か所にある**状態で、
 * 片方だけ動かせば「ゾーンの中にあるのに別の方位と判定される」帯が
 * できる。扇形で実際に起きた（#776）。
 *
 * この検証は 2 つを固定する。
 *
 * 1. 新実装が旧の表と**同じ数字**を返す（意味を変えていない）
 * 2. 返した境目が directionFromBearing の区切りと**一致する**
 *    （表とではなく、判定そのものと突き合わせる）
 */

/** 旧実装。**戻さないこと。**新実装と一致することの照合用に写した。 */
const OLD_RANGES: Record<string, Record<string, [number, number]>> = {
  traditional: {
    N: [345, 15],
    NE: [15, 75],
    E: [75, 105],
    SE: [105, 165],
    S: [165, 195],
    SW: [195, 255],
    W: [255, 285],
    NW: [285, 345],
  },
  physical: {
    N: [337.5, 22.5],
    NE: [22.5, 67.5],
    E: [67.5, 112.5],
    SE: [112.5, 157.5],
    S: [157.5, 202.5],
    SW: [202.5, 247.5],
    W: [247.5, 292.5],
    NW: [292.5, 337.5],
  },
};

describe("directionAngleRange", () => {
  it("旧実装の表と同じ数字を返す（伝統区分）", () => {
    for (const dir of COMPASS_DIRECTIONS) {
      expect(directionAngleRange(dir, "traditional")).toEqual(
        OLD_RANGES.traditional[dir],
      );
    }
  });

  it("旧実装の表と同じ数字を返す（45 度等分）", () => {
    for (const dir of COMPASS_DIRECTIONS) {
      expect(directionAngleRange(dir, "physical")).toEqual(
        OLD_RANGES.physical[dir],
      );
    }
  });

  it("境目の内側は、その方位として判定される", () => {
    for (const mode of ["traditional", "physical"] as const) {
      for (const dir of COMPASS_DIRECTIONS) {
        const [start, end] = directionAngleRange(dir, mode);
        /* 境目そのものは丸めでどちらに転ぶか決まらないので、
           0.01 度だけ内側を見る */
        expect(directionFromBearing(normalizeBearing(start + 0.01), mode)).toBe(
          dir,
        );
        expect(directionFromBearing(normalizeBearing(end - 0.01), mode)).toBe(
          dir,
        );
      }
    }
  });

  it("境目の外側は、隣の方位として判定される", () => {
    for (const mode of ["traditional", "physical"] as const) {
      for (const dir of COMPASS_DIRECTIONS) {
        const [start, end] = directionAngleRange(dir, mode);
        expect(
          directionFromBearing(normalizeBearing(start - 0.01), mode),
        ).not.toBe(dir);
        expect(
          directionFromBearing(normalizeBearing(end + 0.01), mode),
        ).not.toBe(dir);
      }
    }
  });

  it("八方位で 360 度を隙間なく覆う", () => {
    for (const mode of ["traditional", "physical"] as const) {
      const total = COMPASS_DIRECTIONS.reduce((sum, dir) => {
        const [start, end] = directionAngleRange(dir, mode);
        return sum + normalizeBearing(end - start);
      }, 0);
      expect(total).toBeCloseTo(360, 6);
    }
  });
});

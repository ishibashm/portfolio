import { describe, expect, it } from "vitest";
import { distanceKmBetween } from "@/utils/directionGeo";

/**
 * 距離の計算も 1 か所に寄せた。**旧実装と 1m も食い違わないこと**を固定する。
 *
 * 同じハーバサインの式が 2 か所（api/municipalities-wealth・
 * api/rentals/arbitrage）に写されていた。方位角のときと同じ形で、
 * 式は同一・書き方だけ違う（`Math.sin(x) * Math.sin(x)` と `x ** 2`）。
 *
 * 距離は「5km 未満は方位を出さない」「半径 N km で絞る」に効くので、
 * ここがずれると**一覧に出る物件の集合が変わる。**
 */

/** 旧実装（2 か所に写されていた形）。**戻さないこと。** */
function oldDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

describe("distanceKmBetween", () => {
  it("全国の格子で旧実装と一致する", () => {
    for (let lat1 = 26; lat1 <= 45; lat1 += 1.5) {
      for (let lon1 = 128; lon1 <= 145; lon1 += 1.5) {
        for (let lat2 = 26; lat2 <= 45; lat2 += 3.5) {
          for (let lon2 = 128; lon2 <= 145; lon2 += 3.5) {
            expect(distanceKmBetween(lat1, lon1, lat2, lon2)).toBeCloseTo(
              oldDistance(lat1, lon1, lat2, lon2),
              9,
            );
          }
        }
      }
    }
  });

  it("同じ地点は 0", () => {
    expect(distanceKmBetween(35.6895, 139.6917, 35.6895, 139.6917)).toBe(0);
  });

  it("近距離でも一致する（5km の境目の判定に効く）", () => {
    /* 東京駅から北へおよそ 4.9km / 5.1km */
    const near = distanceKmBetween(35.6812, 139.7671, 35.7253, 139.7671);
    expect(near).toBeCloseTo(
      oldDistance(35.6812, 139.7671, 35.7253, 139.7671),
      9,
    );
    expect(near).toBeGreaterThan(4);
    expect(near).toBeLessThan(6);
  });
});

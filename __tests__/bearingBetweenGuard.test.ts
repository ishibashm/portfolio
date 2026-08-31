import { describe, expect, it } from "vitest";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";
import { getKigakuSector } from "@/utils/kigakuUtils";

/**
 * 方位角の計算を 1 つに寄せるための土台。
 *
 * ## 何が散らばっていたか（2026-08-31 の実測）
 *
 * 同じ大圏方位角の式が **6 か所**に写されていた。
 *
 *     api/rentals/arbitrage          api/municipalities-wealth
 *     api/relocation/history         api/rentals/arbitrage/timeline
 *     relocation/simulator           nba/TenChiJinEvaluation
 *
 * 式はどれも同じだが、**守りが 1 か所にしか無かった。**シミュレータの
 * 写しだけが NaN・null を 0（北）に倒し、残り 5 か所は NaN をそのまま
 * 返していた。方位そのものはどちらも「北」になる（getKigakuSector が
 * NaN を北に倒すため）が、**方位角を数字で出す画面では「NaN 度」**に
 * なる。
 *
 * ## この検証が固定すること
 *
 * 1. 壊れた入力は 0（北）。サイトの規則「NaN は北に倒す」に合わせる
 * 2. **まともな入力では、旧実装（守り無しの式）と 1 度も食い違わない**
 *    ─ 全国の広い範囲で突き合わせる
 */

/** 旧実装（5 か所に写されていた形）。**戻さないこと。** */
function oldBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = (theta * 180) / Math.PI;
  return (bearing + 360) % 360;
}

describe("bearingBetween の守り", () => {
  it("壊れた入力は 0（北）に倒す", () => {
    expect(bearingBetween(NaN, 139, 35, 140)).toBe(0);
    expect(bearingBetween(35, NaN, 35, 140)).toBe(0);
    expect(bearingBetween(35, 139, NaN, 140)).toBe(0);
    expect(bearingBetween(35, 139, 35, NaN)).toBe(0);
    expect(bearingBetween(Infinity, 139, 35, 140)).toBe(0);
  });

  it("旧実装は NaN を返していた（この検証が空回りしていない証拠）", () => {
    expect(Number.isNaN(oldBearing(NaN, 139, 35, 140))).toBe(true);
  });

  it("倒した先は、方位としても北になる（規則と揃っている）", () => {
    const b = bearingBetween(NaN, 139, 35, 140);
    expect(directionFromBearing(b, "traditional")).toBe("N");
    expect(directionFromBearing(b, "physical")).toBe("N");
    expect(getKigakuSector(b, true)).toBe("N");
  });

  it("まともな入力では旧実装と 1 度も食い違わない", () => {
    for (let lat1 = 26; lat1 <= 45; lat1 += 1.5) {
      for (let lon1 = 128; lon1 <= 145; lon1 += 1.5) {
        for (let lat2 = 26; lat2 <= 45; lat2 += 3.5) {
          for (let lon2 = 128; lon2 <= 145; lon2 += 3.5) {
            expect(bearingBetween(lat1, lon1, lat2, lon2)).toBeCloseTo(
              oldBearing(lat1, lon1, lat2, lon2),
              10,
            );
          }
        }
      }
    }
  });

  it("同じ地点は 0（式の上でも守りの上でも北）", () => {
    expect(bearingBetween(35.6895, 139.6917, 35.6895, 139.6917)).toBe(0);
  });
});

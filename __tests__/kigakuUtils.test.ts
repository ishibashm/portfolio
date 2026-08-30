import { describe, it, expect } from "vitest";
import { getKigakuSector } from "@/utils/kigakuUtils";
import { directionFromBearing } from "@/utils/directionGeo";
import type { Direction } from "@/utils/ephemerisEngine";

/**
 * getKigakuSector は directionGeo の実装へ寄せた薄い層。区切りが 1 度でも
 * ずれると、移動履歴（api/relocation/history）とシミュレータの方位が
 * 地図・物件判定とずれる。寄せる前の実装と同じ答えを返すことを、
 * 0〜360 度を細かく刻んで確かめる。
 */

/** 寄せる前の実装。ここでの比較対象としてだけ残す。 */
function legacyGetKigakuSector(
  bearing: number,
  useClassical: boolean = false,
): Direction {
  if (isNaN(bearing)) return "N";
  const b = ((bearing % 360) + 360) % 360;

  if (useClassical) {
    if (b >= 345 || b < 15) return "N";
    if (b >= 15 && b < 75) return "NE";
    if (b >= 75 && b < 105) return "E";
    if (b >= 105 && b < 165) return "SE";
    if (b >= 165 && b < 195) return "S";
    if (b >= 195 && b < 255) return "SW";
    if (b >= 255 && b < 285) return "W";
    return "NW";
  } else {
    const index = Math.floor(((b + 22.5) % 360) / 45);
    const dirs: Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[index];
  }
}

describe("getKigakuSector（directionGeo への集約）", () => {
  it.each([true, false])(
    "useClassical=%s: 0〜360 度を 0.25 度刻みで、寄せる前と同じ答えを返す",
    (useClassical) => {
      const mismatches: string[] = [];
      for (let b = 0; b < 360; b += 0.25) {
        const now = getKigakuSector(b, useClassical);
        const before = legacyGetKigakuSector(b, useClassical);
        if (now !== before) mismatches.push(`${b}: ${before} → ${now}`);
      }
      expect(mismatches).toEqual([]);
    },
  );

  it.each([true, false])(
    "useClassical=%s: 区切りのちょうど上でも一致する",
    (useClassical) => {
      const boundaries = [
        0, 15, 22.5, 45, 67.5, 75, 90, 105, 112.5, 135, 157.5, 165, 180, 195,
        202.5, 225, 247.5, 255, 270, 285, 292.5, 315, 337.5, 345, 359.999,
      ];
      for (const b of boundaries) {
        expect(getKigakuSector(b, useClassical)).toBe(
          legacyGetKigakuSector(b, useClassical),
        );
      }
    },
  );

  it("360 度をまたいでも壊れない", () => {
    for (const b of [-360, -180, -15, -0.1, 360, 540, 725]) {
      for (const useClassical of [true, false]) {
        expect(getKigakuSector(b, useClassical)).toBe(
          legacyGetKigakuSector(b, useClassical),
        );
      }
    }
  });

  it("NaN は北に倒す（#740 で directionGeo 側も同じ規則になった）", () => {
    expect(getKigakuSector(NaN, true)).toBe("N");
    expect(getKigakuSector(NaN, false)).toBe("N");
    // 以前は寄せ先をそのまま呼ぶと NW（traditional）/ undefined（physical）
    // で、この差を吸収するために getKigakuSector 側でガードしていた。
    // #740 で寄せ先も「NaN は北」に揃えたので、どちらを呼んでも同じ。
    expect(directionFromBearing(NaN, "traditional")).toBe("N");
    expect(directionFromBearing(NaN, "physical")).toBe("N");
  });

  it("useClassical を省くと 45 度の等分（既定は directionGeo と逆）", () => {
    // directionFromBearing の既定は traditional。呼び名が同じでも既定が
    // 違うので、引数を省いたときの答えが入れ替わらないことを固定する。
    //
    // 方位角 20 度は、45 度等分なら N（337.5〜22.5）、伝統区分なら
    // NE（15〜75）。既定を取り違えると同じ地点が別の方位になる。
    expect(getKigakuSector(20)).toBe("N");
    expect(getKigakuSector(20, true)).toBe("NE");
    expect(directionFromBearing(20)).toBe("NE");

    expect(getKigakuSector(340)).toBe("N");
    expect(directionFromBearing(340)).toBe("NW");
  });
});

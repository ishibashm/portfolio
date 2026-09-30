import { describe, expect, it } from "vitest";
import {
  buildCompassModel,
  declinationText,
  magneticBearingOf,
} from "@/lib/compassModel";
import {
  destinationAtBearing,
  directionFromBearing,
  normalizeBearing,
  type NodeMapping,
} from "@/utils/directionGeo";

/**
 * 羅盤（利用者の依頼「他の 3D の案も」、2026-09-30）。判定は真北、磁北は
 * 「方位磁針で測るとずれる」注意としてだけ出す（CLAUDE.md 3 節）。
 *
 * - 盤の扇形は判定と同じ真北の境目
 * - 薄く重ねる「磁北で切った境目」は、方位磁針で測った人が見る方位と一致
 * - 目的地の真北・磁北の方位は、ホームや地図と同じ directionForDestination
 */

const TOKYO = { name: "東京", lat: 35.6895, lon: 139.6917 };
const D = -7.94; // 東京の偏角（WMM 2026）

function inRange(b: number, a: number, e: number) {
  let p = normalizeBearing(b);
  while (p < a) p += 360;
  return p <= e;
}

describe("磁針", () => {
  it("西偏の土地では、磁針は真北より西（352 度あたり）を指す", () => {
    const m = buildCompassModel(TOKYO, D, null);
    expect(m.needleDeg).toBeCloseTo(360 + D, 9);
    expect(m.declinationKnown).toBe(true);
  });

  it("方位磁針で測った値は、真北から偏角を引いたもの", () => {
    // 真北で 0 度の点は、磁北（西へ 7.94 度）から見ると東へ 7.94 度
    expect(magneticBearingOf(0, D)).toBeCloseTo(7.94, 9);
    expect(magneticBearingOf(90, D)).toBeCloseTo(97.94, 9);
  });

  it("偏角が引けないときは 0（東京の値で埋めない）", () => {
    const m = buildCompassModel(TOKYO, null, {
      name: "x",
      ...destinationAtBearing(TOKYO.lat, TOKYO.lon, 14.9, 50),
    });
    expect(m.declination).toBe(0);
    expect(m.declinationKnown).toBe(false);
    expect(m.target!.differs).toBe(false);
  });
});

describe.each<NodeMapping>(["traditional", "physical"])("%s", (mapping) => {
  const sweep = Array.from({ length: 720 }, (_, i) => i * 0.5);

  it("目的地の方位は判定と同じ（真北）", () => {
    for (const b of sweep) {
      const p = destinationAtBearing(TOKYO.lat, TOKYO.lon, b, 120);
      const m = buildCompassModel(TOKYO, D, { name: "x", ...p }, mapping);
      // 0 度のまわりは 359.99… と 0 に分かれるので、角度の差で見る
      const diff = normalizeBearing(m.target!.trueBearing - b + 180) - 180;
      expect(diff).toBeCloseTo(0, 6);
      expect(m.target!.trueDirection).toBe(
        directionFromBearing(m.target!.trueBearing, mapping),
      );
    }
  });

  it("磁北で切った境目の中に、磁北で読んだ方位がある（盤に重ねた薄い輪が正しい）", () => {
    for (const b of sweep) {
      const p = destinationAtBearing(TOKYO.lat, TOKYO.lon, b, 120);
      const m = buildCompassModel(TOKYO, D, { name: "x", ...p }, mapping);
      const t = m.target!;
      // 境目の真上（0.01 度以内）は丸めでどちらにも転ぶので除く
      const sec = m.sectors.find((s) => s.direction === t.magneticDirection)!;
      const nearEdge =
        Math.abs(normalizeBearing(t.trueBearing - sec.magStartDeg)) < 0.01 ||
        Math.abs(normalizeBearing(t.trueBearing - sec.magEndDeg)) < 0.01;
      if (nearEdge) continue;
      expect(
        inRange(t.trueBearing, sec.magStartDeg, sec.magEndDeg),
        `${b}`,
      ).toBe(true);
      // 磁北の方位は、方位磁針で測った値を判定の区切りに当てたもの
      expect(t.magneticDirection).toBe(
        directionFromBearing(t.magneticBearing, mapping),
      );
    }
  });

  it("食い違うのは境目から偏角の幅の帯だけ", () => {
    let differs = 0;
    for (const b of sweep) {
      const p = destinationAtBearing(TOKYO.lat, TOKYO.lon, b, 120);
      const t = buildCompassModel(
        TOKYO,
        D,
        { name: "x", ...p },
        mapping,
      ).target!;
      if (t.differs) {
        differs++;
        expect(t.marginDeg).toBeLessThanOrEqual(Math.abs(D) + 0.01);
      }
    }
    // 8 本の境目 × 偏角の幅 ≒ 8 × 7.94 度 ＝ 一周の 17.6%
    expect(differs / sweep.length).toBeCloseTo((8 * Math.abs(D)) / 360, 1);
  });
});

describe("文言", () => {
  it("偏角の言い方", () => {
    expect(declinationText(-7.94)).toBe("西へ 7.9 度");
    expect(declinationText(3.2)).toBe("東へ 3.2 度");
    expect(declinationText(0)).toBe("ずれはほぼありません");
  });
});

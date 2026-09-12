/**
 * 座標 → 最寄りの市区町村（lib/nearestMunicipality）。
 *
 * 画面の座標表示を地名にする土台。実データ（municipalityCoords）で、
 * 代表的な地点が期待どおりの市区町村に落ちることと、海上・国外の座標に
 * 名前を付けないことを固定する。
 */
import { describe, expect, it } from "vitest";
import { MUNICIPALITY_POINTS } from "@/lib/municipalityCoords";
import { nearestMunicipality } from "@/lib/nearestMunicipality";

describe("nearestMunicipality", () => {
  it("東京都庁は新宿区", () => {
    const hit = nearestMunicipality(35.6896, 139.6917, MUNICIPALITY_POINTS);
    expect(hit?.name).toBe("東京都新宿区");
    expect(hit?.distanceKm).toBeLessThan(5);
  });

  it("区の境目では隣の区に落ちることがある（「付近」までしか言わない理由）", () => {
    /* 東京駅は千代田区の東の端で、中央区の代表点のほうが近い */
    const hit = nearestMunicipality(35.6812, 139.7671, MUNICIPALITY_POINTS);
    expect(["東京都千代田区", "東京都中央区"]).toContain(hit?.name);
  });

  it("大阪駅は大阪市北区", () => {
    expect(
      nearestMunicipality(34.7025, 135.4959, MUNICIPALITY_POINTS)?.name,
    ).toBe("大阪府大阪市北区");
  });

  it("太平洋のど真ん中には名前を付けない", () => {
    expect(nearestMunicipality(30, 150, MUNICIPALITY_POINTS)).toBeNull();
  });

  it("壊れた座標は null", () => {
    expect(nearestMunicipality(NaN, 139, MUNICIPALITY_POINTS)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  COMPASS_DIRECTIONS,
  DIRECTION_BEARINGS,
  bearingBetween,
  destinationAtBearing,
  destinationForDirection,
  directionForDestination,
  directionFromBearing,
  distanceKmBetween,
  normalizeBearing,
} from "@/utils/directionGeo";

const NAGOYA = { lat: 35.1815, lon: 136.9064 };

describe("normalizeBearing", () => {
  it("0〜360 に丸める", () => {
    expect(normalizeBearing(-10)).toBeCloseTo(350);
    expect(normalizeBearing(370)).toBeCloseTo(10);
    expect(normalizeBearing(360)).toBeCloseTo(0);
  });
});

describe("bearingBetween", () => {
  it("真北・真東の方位角を返す", () => {
    expect(bearingBetween(35, 135, 36, 135)).toBeCloseTo(0, 1);
    expect(bearingBetween(35, 135, 35, 136)).toBeCloseTo(90, 0);
    expect(bearingBetween(35, 135, 34, 135)).toBeCloseTo(180, 1);
    expect(bearingBetween(35, 135, 35, 134)).toBeCloseTo(270, 0);
  });
});

describe("distanceKmBetween", () => {
  it("同一地点は 0", () => {
    expect(distanceKmBetween(35, 135, 35, 135)).toBeCloseTo(0);
  });

  it("緯度 1 度はおよそ 111km", () => {
    expect(distanceKmBetween(35, 135, 36, 135)).toBeGreaterThan(110);
    expect(distanceKmBetween(35, 135, 36, 135)).toBeLessThan(112);
  });
});

describe("directionFromBearing", () => {
  it("traditional は四隅が広く四正が狭い", () => {
    // 気学の伝統区分では四正（N/E/S/W）が 30 度、四隅が 60 度。
    expect(directionFromBearing(0, "traditional")).toBe("N");
    expect(directionFromBearing(14, "traditional")).toBe("N");
    expect(directionFromBearing(16, "traditional")).toBe("NE");
    expect(directionFromBearing(74, "traditional")).toBe("NE");
    expect(directionFromBearing(76, "traditional")).toBe("E");
    expect(directionFromBearing(350, "traditional")).toBe("N");
  });

  it("physical は 45 度の等分", () => {
    expect(directionFromBearing(0, "physical")).toBe("N");
    expect(directionFromBearing(23, "physical")).toBe("NE");
    expect(directionFromBearing(44, "physical")).toBe("NE");
    // 等分では N が 337.5〜22.5 を受け持つので、340 は NW ではなく N。
    expect(directionFromBearing(330, "physical")).toBe("NW");
    expect(directionFromBearing(340, "physical")).toBe("N");
    expect(directionFromBearing(350, "physical")).toBe("N");
  });

  it("360 度をまたいでも壊れない", () => {
    expect(directionFromBearing(-5, "traditional")).toBe("N");
    expect(directionFromBearing(365, "physical")).toBe("N");
  });
});

describe("destinationAtBearing", () => {
  it("北へ 111km で緯度がおよそ 1 度上がる", () => {
    const d = destinationAtBearing(35, 135, 0, 111.19);
    expect(d.lat).toBeCloseTo(36, 1);
    expect(d.lon).toBeCloseTo(135, 3);
  });

  it("経度を -180〜180 に収める", () => {
    const d = destinationAtBearing(0, 179.9, 90, 100);
    expect(d.lon).toBeGreaterThanOrEqual(-180);
    expect(d.lon).toBeLessThanOrEqual(180);
  });
});

describe("方位 → 座標 → 方位 の往復", () => {
  // ヒートマップで方位を選んで目的地を動かしたあと、その目的地を判定し直すと
  // 同じ行に戻ってこなければならない。偏角の符号をどちらかで間違えると
  // 1 区画ずれるが、画面上はもっともらしく見えてしまう。
  const cases: {
    useTrueNorth: boolean;
    declination: number;
    nodeMapping: "traditional" | "physical";
  }[] = [
    { useTrueNorth: true, declination: 0, nodeMapping: "traditional" },
    { useTrueNorth: true, declination: -8.2, nodeMapping: "traditional" },
    { useTrueNorth: false, declination: -8.2, nodeMapping: "traditional" },
    { useTrueNorth: false, declination: 8.2, nodeMapping: "traditional" },
    { useTrueNorth: false, declination: -8.2, nodeMapping: "physical" },
    { useTrueNorth: true, declination: -8.2, nodeMapping: "physical" },
  ];

  for (const { useTrueNorth, declination, nodeMapping } of cases) {
    it(`真北=${useTrueNorth} 偏角=${declination} 区分=${nodeMapping} で 8 方位すべて往復する`, () => {
      for (const dir of COMPASS_DIRECTIONS) {
        const dest = destinationForDirection(
          NAGOYA.lat,
          NAGOYA.lon,
          dir,
          50,
          declination,
          useTrueNorth,
        );
        const back = directionForDestination(
          NAGOYA.lat,
          NAGOYA.lon,
          dest.lat,
          dest.lon,
          declination,
          useTrueNorth,
          nodeMapping,
        );
        expect(back).toBe(dir);
      }
    });
  }

  it("距離を変えても方位は変わらない", () => {
    for (const distance of [5, 50, 500, 2000]) {
      const dest = destinationForDirection(
        NAGOYA.lat,
        NAGOYA.lon,
        "SE",
        distance,
        -8.2,
        false,
      );
      expect(
        directionForDestination(
          NAGOYA.lat,
          NAGOYA.lon,
          dest.lat,
          dest.lon,
          -8.2,
          false,
          "traditional",
        ),
      ).toBe("SE");
    }
  });

  it("磁北基準では真北基準と別の座標になる（偏角ぶんずれる）", () => {
    const magnetic = destinationForDirection(
      NAGOYA.lat,
      NAGOYA.lon,
      "N",
      50,
      -8.2,
      false,
    );
    const trueNorth = destinationForDirection(
      NAGOYA.lat,
      NAGOYA.lon,
      "N",
      50,
      -8.2,
      true,
    );
    expect(magnetic.lon).not.toBeCloseTo(trueNorth.lon, 3);
    // 偏角が西（負）なら磁北は真北より西寄りを指す。
    expect(magnetic.lon).toBeLessThan(trueNorth.lon);
  });

  it("置いた地点の距離は指定どおり", () => {
    const dest = destinationForDirection(
      NAGOYA.lat,
      NAGOYA.lon,
      "W",
      120,
      -8.2,
      false,
    );
    expect(
      distanceKmBetween(NAGOYA.lat, NAGOYA.lon, dest.lat, dest.lon),
    ).toBeCloseTo(120, 1);
  });
});

describe("DIRECTION_BEARINGS", () => {
  it("8 方位が 45 度刻みで並ぶ", () => {
    COMPASS_DIRECTIONS.forEach((dir, i) => {
      expect(DIRECTION_BEARINGS[dir]).toBe(i * 45);
    });
  });
});

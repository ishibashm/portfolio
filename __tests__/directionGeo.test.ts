import { describe, it, expect } from "vitest";
import {
  COMPASS_DIRECTIONS,
  DIRECTION_BEARINGS,
  FALLBACK_WEDGE_RANGE_KM,
  MAX_WEDGE_RANGE_KM,
  bearingBetween,
  destinationAtBearing,
  destinationForDirection,
  directionForDestination,
  directionFromBearing,
  directionWedgeHalfWidth,
  directionWedgePoints,
  distanceKmBetween,
  normalizeBearing,
  wedgeRangeKmForBounds,
} from "@/utils/directionGeo";
import { SCRAPE_TARGETS } from "@/lib/scrapeTargets";

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

const TOKYO = { lat: 35.6812, lon: 139.7671 };

describe("wedgeRangeKmForBounds", () => {
  it("表示範囲が未確定なら近景ぶんに倒す", () => {
    expect(wedgeRangeKmForBounds(TOKYO.lat, TOKYO.lon, null)).toBe(
      FALLBACK_WEDGE_RANGE_KM,
    );
  });

  it("四隅のうち最も遠い角まで届く", () => {
    // 出発地が中心にない矩形。北東の角が最も遠い。
    const bounds = {
      minLat: TOKYO.lat - 0.1,
      maxLat: TOKYO.lat + 1.0,
      minLon: TOKYO.lon - 0.1,
      maxLon: TOKYO.lon + 1.0,
    };
    const range = wedgeRangeKmForBounds(TOKYO.lat, TOKYO.lon, bounds);
    const farthest = distanceKmBetween(
      TOKYO.lat,
      TOKYO.lon,
      bounds.maxLat,
      bounds.maxLon,
    );
    expect(range).toBeCloseTo(farthest, 3);
    // どの角も扇形の長さの内側に入る。
    for (const [lat, lon] of [
      [bounds.minLat, bounds.minLon],
      [bounds.minLat, bounds.maxLon],
      [bounds.maxLat, bounds.minLon],
      [bounds.maxLat, bounds.maxLon],
    ]) {
      expect(
        distanceKmBetween(TOKYO.lat, TOKYO.lon, lat, lon),
      ).toBeLessThanOrEqual(range + 1e-6);
    }
  });

  it("引きすぎても上限で止まる", () => {
    const worldwide = {
      minLat: -80,
      maxLat: 80,
      minLon: -179,
      maxLon: 179,
    };
    expect(wedgeRangeKmForBounds(TOKYO.lat, TOKYO.lon, worldwide)).toBe(
      MAX_WEDGE_RANGE_KM,
    );
  });
});

describe("directionWedgePoints", () => {
  it("起点から始まり、外周は指定した長さに乗る", () => {
    const points = directionWedgePoints(TOKYO.lat, TOKYO.lon, 45, 22.5, 500);

    expect(points[0]).toEqual([TOKYO.lat, TOKYO.lon]);

    const distances = points
      .slice(1)
      .map(([lat, lon]) =>
        distanceKmBetween(TOKYO.lat, TOKYO.lon, lat, lon),
      );
    expect(Math.max(...distances)).toBeCloseTo(500, 6);
  });

  it("縁の点は境界の方位角にそろう（大円で刻む）", () => {
    const center = 45;
    const half = 22.5;
    const points = directionWedgePoints(
      TOKYO.lat,
      TOKYO.lon,
      center,
      half,
      1500,
    );

    // 起点を除く全点の方位角が扇形の角度内に収まる。メルカトル上の
    // 直線で縁を引くとここが外れる（県の塗り分けと扇形がずれる原因）。
    for (const [lat, lon] of points.slice(1)) {
      const bearing = bearingBetween(TOKYO.lat, TOKYO.lon, lat, lon);
      expect(bearing).toBeGreaterThanOrEqual(center - half - 1e-6);
      expect(bearing).toBeLessThanOrEqual(center + half + 1e-6);
    }
  });

  it("長さを変えても方位の割り当ては変わらない", () => {
    // 扇形の中心線上の点は、遠くても同じ八方位に落ちる。
    for (const km of [30, 300, 1500]) {
      const p = destinationAtBearing(TOKYO.lat, TOKYO.lon, 45, km);
      expect(
        directionFromBearing(
          bearingBetween(TOKYO.lat, TOKYO.lon, p.lat, p.lon),
          "traditional",
        ),
      ).toBe("NE");
    }
  });
});

/**
 * 扇形の縁と八方位の境目は同じもの。ここがずれると「扇形の中にあるのに
 * 別の方位と判定される」帯ができ、地図の色と物件・県の判定が食い違う。
 */
describe("directionWedgeHalfWidth", () => {
  const MAPPINGS = ["traditional", "physical"] as const;

  it.each(MAPPINGS)("%s: 扇形が八方位を隙間なく敷き詰める", (mapping) => {
    const total = COMPASS_DIRECTIONS.reduce(
      (sum, dir) => sum + directionWedgeHalfWidth(dir, mapping) * 2,
      0,
    );
    expect(total).toBe(360);
  });

  it.each(MAPPINGS)("%s: 扇形の内側は必ずその方位に落ちる", (mapping) => {
    const EPS = 0.01;
    for (const dir of COMPASS_DIRECTIONS) {
      const half = directionWedgeHalfWidth(dir, mapping);
      const center = DIRECTION_BEARINGS[dir];
      for (const offset of [-half + EPS, 0, half - EPS]) {
        expect(
          directionFromBearing(normalizeBearing(center + offset), mapping),
        ).toBe(dir);
      }
    }
  });

  it.each(MAPPINGS)("%s: 扇形の外側は隣の方位に落ちる", (mapping) => {
    const EPS = 0.01;
    for (const dir of COMPASS_DIRECTIONS) {
      const half = directionWedgeHalfWidth(dir, mapping);
      const center = DIRECTION_BEARINGS[dir];
      for (const offset of [-half - EPS, half + EPS]) {
        expect(
          directionFromBearing(normalizeBearing(center + offset), mapping),
        ).not.toBe(dir);
      }
    }
  });
});

/**
 * 全国ズームでの一致。扇形は真北・八方位の中心方位角で描き、県の
 * 塗り分けは bearingBetween → directionFromBearing で決める。両者が
 * 同じ基準になっていないと、遠い県ほど大きくずれる。
 *
 * 以前は扇形だけ磁北ぶん（東京固定の -8.2 度）回しており、東京起点で
 * 47 県中 17 県が食い違っていた。1500km 先では横ずれが約 210km になる。
 */
describe("全国ズームでの扇形と県判定の一致", () => {
  /** その方位角を含む扇形の方位。扇形の描画と同じ定義で引く。 */
  function wedgeContaining(
    bearing: number,
    mapping: "traditional" | "physical",
  ) {
    const b = normalizeBearing(bearing);
    return COMPASS_DIRECTIONS.find((dir) => {
      const half = directionWedgeHalfWidth(dir, mapping);
      // -180〜180 の符号つき差。境目は directionFromBearing と同じ
      // 半開区間 [中心-半幅, 中心+半幅) に合わせる。
      const diff = ((b - DIRECTION_BEARINGS[dir] + 540) % 360) - 180;
      return diff >= -half && diff < half;
    });
  }

  const BASES = [
    { name: "東京", lat: 35.6812, lon: 139.7671 },
    { name: "那覇", lat: 26.2124, lon: 127.6809 },
    { name: "札幌", lat: 43.0618, lon: 141.3545 },
  ];

  for (const mapping of ["traditional", "physical"] as const) {
    it.each(BASES)(
      `$name 起点・${mapping}: 47 県すべてで扇形と県判定が一致する`,
      (base) => {
        const mismatches: string[] = [];
        for (const target of SCRAPE_TARGETS) {
          const bearing = bearingBetween(
            base.lat,
            base.lon,
            target.lat,
            target.lon,
          );
          // 出発地とほぼ同じ場所は方位角が安定しないので除く。
          if (distanceKmBetween(base.lat, base.lon, target.lat, target.lon) < 5)
            continue;

          const prefectureFill = directionFromBearing(bearing, mapping);
          const wedge = wedgeContaining(bearing, mapping);
          if (wedge !== prefectureFill) {
            mismatches.push(
              `${target.name} 方位角${bearing.toFixed(1)} 県塗り=${prefectureFill} 扇形=${wedge}`,
            );
          }
        }
        expect(mismatches).toEqual([]);
      },
    );
  }

  it("遠い県でも、扇形の中に描かれる点は同じ方位に判定される", () => {
    const base = BASES[0];
    for (const dir of COMPASS_DIRECTIONS) {
      const half = directionWedgeHalfWidth(dir, "traditional");
      const center = DIRECTION_BEARINGS[dir];
      // 扇形の内側ぎりぎり・中心線・外周と、距離を変えて確かめる。
      for (const offset of [-half + 0.5, 0, half - 0.5]) {
        for (const km of [30, 800, MAX_WEDGE_RANGE_KM]) {
          const p = destinationAtBearing(base.lat, base.lon, center + offset, km);
          expect(
            directionFromBearing(
              bearingBetween(base.lat, base.lon, p.lat, p.lon),
              "traditional",
            ),
          ).toBe(dir);
        }
      }
    }
  });
});

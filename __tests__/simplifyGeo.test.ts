/**
 * 頂点の間引きを固定する。
 *
 * 用途地域は z14 より広くは出せない（`utils/zoning` の実測。z13 で
 * 1 画面 5MB 前後）。広い縮尺ほど頂点は要らないはずなので、間引いて
 * どこまで小さくなるかを測る——その計算がここ。
 *
 * **間引きすぎて区画が消えるほうが、重いより悪い。**線に潰れたり、
 * 閉じていない輪になったりしないことを数で押さえる。
 */
import { describe, expect, it } from "vitest";

import {
  isTinyGeometry,
  ringArea,
  simplifyGeometry,
  simplifyLine,
  simplifyRing,
  toleranceForZoom,
  type Position,
  type SimplifyStats,
} from "@/lib/simplifyGeo";

/** 直線上に並んだ点。真ん中は全部要らない。 */
const straight: Position[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
];

/** 四角形（閉じている）に、無駄な中間点を足したもの。 */
const squareWithNoise: Position[] = [
  [0, 0],
  [0.5, 0.0000001],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
  [0, 0],
];

describe("折れ線の間引き", () => {
  it("直線上の点は落ちる", () => {
    expect(simplifyLine(straight, 0.001)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it("許容量 0 なら何も落とさない", () => {
    expect(simplifyLine(straight, 0)).toEqual(straight);
  });

  it("2 点以下はそのまま", () => {
    expect(simplifyLine([[0, 0]], 1)).toEqual([[0, 0]]);
    expect(
      simplifyLine(
        [
          [0, 0],
          [1, 1],
        ],
        1,
      ),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it("形を変える点は残る", () => {
    const zigzag: Position[] = [
      [0, 0],
      [1, 1],
      [2, 0],
    ];
    // 山の高さ（1）より小さい許容量なら真ん中は残る
    expect(simplifyLine(zigzag, 0.1)).toEqual(zigzag);
    // 大きい許容量なら潰れる
    expect(simplifyLine(zigzag, 2)).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });
});

describe("多角形の輪", () => {
  it("無駄な中間点だけが落ちる", () => {
    const out = simplifyRing(squareWithNoise, 0.001);
    expect(out.length).toBeLessThan(squareWithNoise.length);
    // 四隅は残る
    expect(out).toEqual(
      expect.arrayContaining([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    );
  });

  it("必ず閉じたまま返る", () => {
    for (const tol of [0, 0.0001, 0.01, 0.3]) {
      const out = simplifyRing(squareWithNoise, tol);
      expect(out[0]).toEqual(out[out.length - 1]);
    }
  });

  /**
   * 空回りを避けるための固定。**面が線に潰れないこと。**
   * 許容量を大きくしすぎても、4 点を下回ったら元の輪を返す。
   */
  it("間引きすぎても面のまま残る", () => {
    const out = simplifyRing(squareWithNoise, 100);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(ringArea(out)).toBeGreaterThan(0);
    // この場合は元の輪がそのまま返る
    expect(out).toEqual(squareWithNoise);
  });
});

describe("ズームから許容量", () => {
  /**
   * タイルは 256 画素。z のとき世界一周が 256 * 2**z 画素なので、
   * 1 画素は 360 / (256 * 2**z) 度。
   */
  it("ズームが 1 上がると半分になる", () => {
    expect(toleranceForZoom(12)).toBeCloseTo(360 / (256 * 4096), 12);
    expect(toleranceForZoom(13)).toBeCloseTo(toleranceForZoom(12) / 2, 12);
  });

  it("画素数を指定できる", () => {
    expect(toleranceForZoom(12, 2)).toBeCloseTo(toleranceForZoom(12) * 2, 12);
  });

  /** z12 の 1 画素は緯度でおよそ 0.00034 度（＝ 38m 前後）。 */
  it("z12 の 1 画素はおよそ 0.00034 度", () => {
    expect(toleranceForZoom(12)).toBeCloseTo(0.00034, 5);
  });
});

describe("GeoJSON の間引き", () => {
  const polygon = { type: "Polygon", coordinates: [squareWithNoise] };
  const multi = {
    type: "MultiPolygon",
    coordinates: [[squareWithNoise], [squareWithNoise]],
  };

  it("Polygon の頂点が減り、数えた結果が返る", () => {
    const stats: SimplifyStats = { before: 0, after: 0, dropped: 0 };
    const out = simplifyGeometry(polygon, 0.001, stats);
    expect(out.type).toBe("Polygon");
    expect(stats.before).toBe(squareWithNoise.length);
    expect(stats.after).toBeLessThan(stats.before);
  });

  it("MultiPolygon も同じように減る", () => {
    const stats: SimplifyStats = { before: 0, after: 0, dropped: 0 };
    simplifyGeometry(multi, 0.001, stats);
    expect(stats.before).toBe(squareWithNoise.length * 2);
    expect(stats.after).toBeLessThan(stats.before);
  });

  /**
   * 知らない型は**そのまま返す。**黙って落とすと「区画が無い場所」と
   * 見分けが付かなくなる。
   */
  it("知らない型はそのまま返す", () => {
    const point = { type: "Point", coordinates: [1, 2] };
    expect(simplifyGeometry(point, 0.01)).toEqual(point);
  });
});

describe("小さすぎる区画", () => {
  const big = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  };
  const tiny = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0.0001, 0],
        [0.0001, 0.0001],
        [0, 0.0001],
        [0, 0],
      ],
    ],
  };

  it("面積で見分ける", () => {
    expect(isTinyGeometry(big, 0.0001)).toBe(false);
    expect(isTinyGeometry(tiny, 0.0001)).toBe(true);
  });

  it("しきい値 0 なら何も落とさない", () => {
    expect(isTinyGeometry(tiny, 0)).toBe(false);
  });

  /** MultiPolygon は 1 つでも残る大きさなら残す。 */
  it("MultiPolygon は 1 つでも大きければ残す", () => {
    // MultiPolygon の coordinates は「多角形の配列」で、
    // 各多角形が「輪の配列」。1 段深い。
    const mixed = {
      type: "MultiPolygon",
      coordinates: [tiny.coordinates, big.coordinates],
    };
    expect(isTinyGeometry(mixed, 0.0001)).toBe(false);

    const allTiny = {
      type: "MultiPolygon",
      coordinates: [tiny.coordinates, tiny.coordinates],
    };
    expect(isTinyGeometry(allTiny, 0.0001)).toBe(true);
  });

  it("面積は符号を持たない（時計回りでも反時計回りでも同じ）", () => {
    const ring = big.coordinates[0] as Position[];
    expect(ringArea(ring)).toBeCloseTo(1, 10);
    expect(ringArea([...ring].reverse())).toBeCloseTo(1, 10);
  });
});

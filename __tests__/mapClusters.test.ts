/**
 * 升目でまとめる処理を固定する。
 *
 * 直したかったのは **zoom 12〜14 の穴**。`ArbitrageMapInner` は
 *
 *     showHeatmap && 件数 > 100  → 市区町村バブル
 *     件数 <= 100 && zoom < 15   → 距離クラスター
 *     それ以外                    → 個別のピン（上限なし）
 *
 * と分岐しているが、`zoom >= 12` では showHeatmap が強制的に false に
 * なるため、**都市部を zoom 12〜14 で見ると表示域の全物件が個別に
 * 描かれる。**件数の上限も間引きも無い。
 *
 * 既存の距離クラスターは O(n²)（点ごとに全グループを走査）で 100 件
 * までが前提。ここは升目に落として O(n) にしてある。
 */
import { describe, expect, it } from "vitest";

import {
  CLUSTER_THRESHOLD,
  clusterByTile,
  shouldCluster,
} from "@/lib/mapClusters";

type P = { id: string; lat: number | null; lon: number | null };

const p = (id: string, lat: number | null, lon: number | null): P => ({
  id,
  lat,
  lon,
});

describe("升目でまとめる", () => {
  it("同じ升目の点は 1 つにまとまる", () => {
    // 東京駅のすぐ近くに 3 つ。zoom 12 の升目（+3 = z15）では同じ升。
    const out = clusterByTile(
      [
        p("a", 35.6812, 139.7671),
        p("b", 35.6813, 139.7672),
        p("c", 35.6814, 139.7673),
      ],
      12,
    );
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(3);
    expect(out[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("重心は入った点の平均", () => {
    const out = clusterByTile([p("a", 35.0, 139.0), p("b", 35.02, 139.02)], 8);
    expect(out).toHaveLength(1);
    expect(out[0].lat).toBeCloseTo(35.01, 6);
    expect(out[0].lon).toBeCloseTo(139.01, 6);
  });

  it("離れた点は分かれる", () => {
    const out = clusterByTile(
      [p("東京", 35.6812, 139.7671), p("札幌", 43.0686, 141.3508)],
      12,
    );
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.count === 1)).toBe(true);
  });

  /** ズームを上げると升目が細かくなる＝拡大するほど分かれていく。 */
  it("拡大するほど分かれる", () => {
    const pts = Array.from({ length: 40 }, (_, i) =>
      p(`p${i}`, 35.68 + i * 0.0004, 139.76 + i * 0.0004),
    );
    const wide = clusterByTile(pts, 10).length;
    const mid = clusterByTile(pts, 14).length;
    const close = clusterByTile(pts, 18).length;
    expect(wide).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(close);
    // いちばん寄れば 1 つずつになる
    expect(close).toBe(pts.length);
  });

  it("件数の合計は入力と一致する（座標のあるものだけ）", () => {
    const pts = [
      ...Array.from({ length: 500 }, (_, i) =>
        p(`x${i}`, 35.6 + (i % 25) * 0.002, 139.7 + Math.floor(i / 25) * 0.002),
      ),
      p("座標なし1", null, 139.7),
      p("座標なし2", 35.6, null),
    ];
    const out = clusterByTile(pts, 13);
    const total = out.reduce((a, c) => a + c.count, 0);
    expect(total).toBe(500);
  });

  it("壊れた座標は落とす", () => {
    const out = clusterByTile(
      [
        p("ok", 35.68, 139.76),
        p("nan", Number.NaN, 139.76),
        p("inf", 35.68, Number.POSITIVE_INFINITY),
      ],
      13,
    );
    const total = out.reduce((a, c) => a + c.count, 0);
    expect(total).toBe(1);
    expect(out[0].items[0].id).toBe("ok");
  });

  it("空でも落ちない", () => {
    expect(clusterByTile([], 13)).toEqual([]);
  });

  /**
   * 同じ入力なら同じ結果。地図は操作のたびに描き直すので、
   * 順番が揺れると玉が飛び回って見える。
   */
  it("同じ入力なら同じ結果", () => {
    const pts = Array.from({ length: 200 }, (_, i) =>
      p(`p${i}`, 35.6 + (i % 20) * 0.003, 139.7 + Math.floor(i / 20) * 0.003),
    );
    const a = clusterByTile(pts, 12);
    const b = clusterByTile(pts, 12);
    expect(a.map((c) => `${c.lat},${c.lon},${c.count}`)).toEqual(
      b.map((c) => `${c.lat},${c.lon},${c.count}`),
    );
  });

  /**
   * 空回りを避けるための固定。まとめる意味があること——つまり
   * **描く数が実際に大きく減ること**を数で押さえる。
   *
   * 下の並びは 0.004 度ごとの格子で、実際の物件より散らばっている
   * （実データは駅の周りに固まる）。**散らばった最悪に近い形でも
   * 5 分の 1 以下**になることを見る。実測 3,000 → 532。
   */
  it("数千件でも描く数が大きく減る", () => {
    // 東京 23 区くらいの範囲に 3,000 件をばらまく
    const pts = Array.from({ length: 3000 }, (_, i) =>
      p(`p${i}`, 35.55 + (i % 60) * 0.004, 139.6 + Math.floor(i / 60) * 0.004),
    );
    const out = clusterByTile(pts, 12);
    expect(out.reduce((a, c) => a + c.count, 0)).toBe(3000);
    expect(out.length).toBe(532);
    expect(out.length).toBeLessThan(pts.length / 5);
  });

  /**
   * 実際の物件に近い散らばり（駅の周りに固まる）だと、もっと減る。
   */
  it("固まっている並びなら桁で減る", () => {
    // 10 か所の「駅前」に 300 件ずつ
    const pts: P[] = [];
    for (let s = 0; s < 10; s++) {
      for (let i = 0; i < 300; i++) {
        pts.push(
          p(
            `s${s}-${i}`,
            35.6 + s * 0.02 + (i % 10) * 0.0002,
            139.7 + s * 0.02 + Math.floor(i / 10) * 0.0002,
          ),
        );
      }
    }
    const out = clusterByTile(pts, 12);
    expect(out.reduce((a, c) => a + c.count, 0)).toBe(3000);
    expect(out.length).toBeLessThan(60);
  });
});

describe("まとめるかどうか", () => {
  it("件数だけで決める（ズームは見ない）", () => {
    expect(shouldCluster(CLUSTER_THRESHOLD)).toBe(false);
    expect(shouldCluster(CLUSTER_THRESHOLD + 1)).toBe(true);
    expect(shouldCluster(0)).toBe(false);
  });

  it("しきい値は差し替えられる", () => {
    expect(shouldCluster(10, 5)).toBe(true);
    expect(shouldCluster(10, 50)).toBe(false);
  });
});

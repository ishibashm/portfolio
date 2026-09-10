import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { clusterByTile, shouldCluster } from "@/lib/mapClusters";

/**
 * 地図のまとめ方は **1 つだけ**。
 *
 * ## なぜ（利用者の要望、2026-09-10）
 *
 * 「速さと引き換えの独自性は必要なく、速さのベストプラクティスに倣い、
 * ユーザービリティを上げてほしい」。
 *
 * 同じ目的の仕組みが **3 つ重なっていた。**
 *
 *     showHeatmap && 件数 > 100        → 市区町村バブル（俯瞰の濃淡）
 *     件数 <= 100 && zoom < 15         → 距離クラスター ← 消した
 *     それ以外                          → 升目クラスター / 個別ピン
 *
 * 真ん中は自前の O(n²)（点ごとに既存グループを全部走査）で、**100 件
 * までを前提にしていた。**つまり「多いとき」には使えず、**少ないとき
 * だけ動く**という逆向きの条件になっていた。地図の定石は逆で、
 * **密なら束ね、疎なら 1 つずつ描く。**
 *
 * 升目（`clusterByTile`。O(n)・タイル基準）に一本化した。これは
 * supercluster / Leaflet.markercluster と同じ考え方で、独自の工夫が要らない。
 *
 * ## ここで見るもの
 *
 * 「消したものが戻っていないか」を字面で見る。**実装のパターンで引く**
 * （CLAUDE.md 3 節。名前で探すと取りこぼす）。
 */
const MAP = readFileSync(
  join(__dirname, "../src/components/ArbitrageMapInner.tsx"),
  "utf8",
);

describe("まとめ方は 1 つ（升目）だけ", () => {
  it("O(n²) の距離クラスターが戻っていない", () => {
    /* 距離で寄せる実装の特徴。しきい値を度で持ち、点ごとに既存
       グループを走査する形。名前ではなく形で引く */
    expect(MAP).not.toMatch(/distThreshold/);
    expect(MAP).not.toMatch(/const clusters = useMemo/);
  });

  it("まとめる判断は件数だけで、ズームや一覧の開閉で切り替えない", () => {
    /* `visibleCount <= 100 && !showListView && zoom < 15` の形が
       戻ったら落とす。ここが「少ないときだけまとめる」の入口だった */
    expect(MAP).not.toMatch(/visibleCount <= 100 && !showListView/);
    expect(MAP).toMatch(/shouldCluster\(pinProperties\.length\)/);
  });

  it("升目のまとめを使っている", () => {
    expect(MAP).toMatch(/clusterByTile\(pinProperties, zoom\)/);
  });
});

describe("升目のまとめが定石どおりに働く", () => {
  const grid = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      lat: 35 + (i % 50) * 0.001,
      lon: 139 + Math.floor(i / 50) * 0.001,
    }));

  it("疎なら 1 つずつ、密なら束ねる", () => {
    /* 「多いほど束ねる」が定石。逆になっていたら落ちる */
    expect(shouldCluster(10)).toBe(false);
    expect(shouldCluster(2000)).toBe(true);
  });

  it("束ねると描く数が減る", () => {
    const points = grid(2000);
    const clustered = clusterByTile(points, 12);
    expect(clustered.length).toBeLessThan(points.length);
    /* 合計は保たれる。間引きではなく、まとめ */
    expect(clustered.reduce((a, c) => a + c.count, 0)).toBe(points.length);
  });

  it("拡大するほど分かれる", () => {
    const points = grid(2000);
    const near = clusterByTile(points, 16).length;
    const far = clusterByTile(points, 10).length;
    expect(near).toBeGreaterThan(far);
  });

  it("件数が増えても走査は 1 周（O(n²) なら現実的な時間で終わらない）", () => {
    /* 実時間で測ると環境で揺れるので、**同じ入力を 2 倍にしたときの
       伸び方**で見る。O(n) なら比は 2 前後、O(n²) なら 4 前後になる。
       ここでは「4 倍より明らかに小さい」ことだけを言う */
    const a = grid(4000);
    const b = grid(8000);
    const t0 = performance.now();
    clusterByTile(a, 12);
    const ta = performance.now() - t0;
    const t1 = performance.now();
    clusterByTile(b, 12);
    const tb = performance.now() - t1;
    /* 0 除算を避ける。速すぎて 0ms のときは比較しない */
    if (ta > 1) expect(tb / ta).toBeLessThan(3.5);
  });
});

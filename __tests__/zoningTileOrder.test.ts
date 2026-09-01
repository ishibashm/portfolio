import { describe, expect, it } from "vitest";
import { tilesByDistanceFromCenter } from "@/lib/tileCoords";

/**
 * 用途地域のタイルを間引くとき、**見ている場所が残る**か。
 *
 * ## なぜ要るか（2026-09-01 に利用者が発見）
 *
 * 画面の 1/3 しか塗られず、しかも塗られるのが**いちばん西の帯**
 * だった。市街地の側が真っ白のまま。原因は間引きの順序で、
 *
 *     for (x) for (y) wanted.push([x, y])
 *     wanted.slice(0, MAX_TILES)
 *
 * と列ごとに詰めてから先頭を取っていたので、**西端の列だけ**が
 * 残っていた。上限そのものは妥当（1 枚ずつ API を叩く）なので、
 * 捨てる相手を「中心から遠いもの」に変える。
 */
describe("用途地域のタイルは中心から近い順に取る", () => {
  /** 4 列 × 6 行。実際に落ちた画面（iPad 横）とほぼ同じ形 */
  const [x0, x1, y0, y1] = [100, 103, 200, 205];
  const cx = 102.0;
  const cy = 202.5;

  it("上限で切っても、中心のタイルが残る", () => {
    const kept = tilesByDistanceFromCenter(x0, x1, y0, y1, cx, cy).slice(0, 12);
    /* 中心を含む 2×2 は必ず残る */
    for (const t of [
      [101, 202],
      [102, 202],
      [101, 203],
      [102, 203],
    ] as [number, number][]) {
      expect(
        kept.some(([x, y]) => x === t[0] && y === t[1]),
        `中心のタイル ${t} が残っていない`,
      ).toBe(true);
    }
  });

  it("残った 12 枚が 1 つの列に固まっていない", () => {
    /* これが本題。旧実装は 2 列ぶんしか残らなかった */
    const kept = tilesByDistanceFromCenter(x0, x1, y0, y1, cx, cy).slice(0, 12);
    expect(new Set(kept.map(([x]) => x)).size).toBeGreaterThanOrEqual(3);
  });

  it("旧実装の順序なら西端に寄ることを示す（この検査が空回りしていない）", () => {
    const naive: [number, number][] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) naive.push([x, y]);
    }
    const keptOld = naive.slice(0, 12);
    /* 旧実装では 2 列しか残らず、中心の 102 列が 1 枚も入らない */
    expect(new Set(keptOld.map(([x]) => x)).size).toBe(2);
    expect(keptOld.some(([x]) => x === 102)).toBe(false);
  });

  it("全部が上限に収まるときは 1 枚も落とさない", () => {
    const all = tilesByDistanceFromCenter(100, 101, 200, 201, 100.5, 200.5);
    expect(all).toHaveLength(4);
  });

  it("並びが実行ごとに変わらない", () => {
    const a = tilesByDistanceFromCenter(x0, x1, y0, y1, cx, cy);
    const b = tilesByDistanceFromCenter(x0, x1, y0, y1, cx, cy);
    expect(a).toEqual(b);
  });
});

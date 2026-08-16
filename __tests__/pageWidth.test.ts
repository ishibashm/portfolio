import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 頁の横幅は 2 つだけ（CLAUDE.md 3 節）。
 *
 *   max-w-[2560px]  地図と一覧を左右に並べる（arbitrage・wealth）
 *   max-w-[1700px]  それ以外の全部
 *
 * 以前は道具の頁だけで 1024 / 1152 / 1280 / 1400 / 1600 の 5 通りあり、
 * 同じ作りの画面で幅が違っていた（#218・#220・#227・#228 で揃えた）。
 * その後もホームに 1400 と 1600 が残っていて、**上段だけ幅いっぱいで
 * 下段が狭い**という凹凸になっていた（利用者の指摘、#349 と本 PR）。
 *
 * 目で見て気付くしかない類なので、ここで固定する。
 *
 * 見るのは**器の幅**だけ。札の中で文字を詰めるための小さい上限
 * （max-w-[200px] など）は対象外にする。1000px を境にする。
 */

const SRC = join(process.cwd(), "src");

/** 器とみなす下限。これ未満は札の中の切り詰めなので見ない。 */
const CONTAINER_MIN = 1000;

/** 決まっている値。ここを増やすときは CLAUDE.md も直すこと。 */
const ALLOWED = [1700, 2560];

function collect(): { file: string; value: number }[] {
  const found: { file: string; value: number }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entry)) continue;
      const source = readFileSync(path, "utf8");
      for (const m of source.matchAll(/max-w-\[(\d+)px\]/g)) {
        found.push({
          file: path.replace(`${process.cwd()}/`, ""),
          value: Number(m[1]),
        });
      }
    }
  };
  walk(SRC);
  return found;
}

const WIDTHS = collect();

describe("頁の横幅", () => {
  it("幅の指定を拾えている（この検査自体が空回りしていない）", () => {
    expect(WIDTHS.length).toBeGreaterThan(10);
  });

  it("器の幅は 1700px か 2560px だけ", () => {
    const odd = WIDTHS.filter(
      (w) => w.value >= CONTAINER_MIN && !ALLOWED.includes(w.value),
    ).map((w) => `${w.file}: max-w-[${w.value}px]`);

    expect([...new Set(odd)]).toEqual([]);
  });

  it("2560px は地図と一覧を並べる頁だけ", () => {
    // 余った幅がそのまま地図の描画面積になる頁にだけ許す。
    const wide = WIDTHS.filter((w) => w.value === 2560).map((w) => w.file);
    for (const file of wide) {
      expect(file).toMatch(/(arbitrage|wealth)/);
    }
  });
});

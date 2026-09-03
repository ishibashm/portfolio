import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * 最初の描画を止めるフォントを layout に戻さない。
 *
 * 遅い回線（400 kbps）の実測で、描画まで 5.9 秒のうち
 *   - 明朝体の @font-face（2 ウェイトで gzip 62 KB）が stylesheet として 1.3 秒
 *   - Geist 2 書体の preload（gzip 52 KB）が最優先で 1 秒
 * を食っていた。明朝体は lib/serifFont に置いて hydration 後に読み、
 * Geist は preload を切った。
 *
 * どちらも next/font の呼び方 1 行で戻る（layout で Shippori_Mincho を
 * 呼ぶ、preload を消す）ので、字面で固定する。
 */
const SRC = join(__dirname, "../src");
const layout = readFileSync(join(SRC, "app/layout.tsx"), "utf8");

describe("最初の描画を止めるフォントを layout に置かない", () => {
  it("layout.tsx は Shippori_Mincho を呼ばない（SerifFontLoader が後で読む）", () => {
    expect(layout).not.toMatch(/Shippori_Mincho\(/);
    expect(layout).toMatch(/<SerifFontLoader \/>/);
  });

  it("Geist は preload しない", () => {
    const calls = layout.match(/Geist(?:_Mono)?\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls.length).toBe(2);
    for (const call of calls) expect(call).toMatch(/preload:\s*false/);
  });

  it("明朝体は lib/serifFont だけが呼び、preload しない", () => {
    const serif = readFileSync(join(SRC, "lib/serifFont.ts"), "utf8");
    expect(serif).toMatch(/Shippori_Mincho\(\{[\s\S]*preload:\s*false/);
    /* 1 ウェイトで @font-face が 120 個増える。増やすなら実測してから */
    expect(serif).toMatch(/weight:\s*\["400",\s*"700"\]/);
  });

  it("明朝体が届くまでの既定を :root に持つ", () => {
    expect(layout).toMatch(/--font-shippori-mincho:\s*"Hiragino Mincho ProN"/);
  });
});

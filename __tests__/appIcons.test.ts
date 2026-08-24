/**
 * アプリのアイコンが揃っていること。
 *
 * PNG と ICO は `scripts/build_icons.mjs` が `scripts/icons/*.svg` から
 * 作る。**PNG を直接いじらない。**以前は元データが無く、直したいときに
 * 作り直す手段が無かった。
 *
 * ここで見るのは 3 つ。
 *
 *   1. 4 つのファイルが揃っていて、寸法が manifest と合っている
 *   2. favicon.ico が壊れていない（16/32/48 が PNG で入っている）
 *   3. 大小で図を分けたままであること
 *
 * 3 を見るのは、**大きい版をそのまま縮めると 16px で判別できなくなる**
 * ため。方位盤の輪と斜めの花びらがつぶれて淡い染みになる（実測）。
 * 小さい図を消して 1 枚にまとめる、が起きたら落とす。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p));

/** PNG の IHDR から幅と高さを取る。 */
function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("アイコンの実体", () => {
  it.each([
    ["public/icon-512.png", 512],
    ["public/icon-192.png", 192],
    ["public/apple-touch-icon.png", 180],
  ])("%s は %d 角の PNG", (path, size) => {
    expect(existsSync(join(root, path))).toBe(true);
    expect(pngSize(read(path))).toEqual({ width: size, height: size });
  });

  it("manifest が指すファイルと寸法が合っている", () => {
    // 片方だけ直すと、ホーム画面に追加したときだけ古い絵が出る。
    const manifest = JSON.parse(read("public/manifest.json").toString()) as {
      icons: { src: string; sizes: string }[];
    };
    for (const icon of manifest.icons) {
      const path = `public${icon.src}`;
      expect(existsSync(join(root, path)), icon.src).toBe(true);
      const { width, height } = pngSize(read(path));
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });
});

describe("favicon.ico", () => {
  const ico = read("public/favicon.ico");

  it("ICO の器として壊れていない", () => {
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type = icon
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });

  it("16 / 32 / 48 が PNG で入っている", () => {
    const count = ico.readUInt16LE(4);
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const e = 6 + i * 16;
      const w = ico.readUInt8(e); // 0 は 256 の意味。ここには入らない
      const length = ico.readUInt32LE(e + 8);
      const offset = ico.readUInt32LE(e + 12);
      const body = ico.subarray(offset, offset + length);
      expect(body.length, `${w}px の中身`).toBe(length);
      expect(body.subarray(0, 8), `${w}px は PNG`).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      sizes.push(w);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });
});

describe("元の SVG と作り方", () => {
  it("大小で図が分かれている", () => {
    // 大きい版をそのまま縮めると 16px で判別できなくなる。
    expect(existsSync(join(root, "scripts/icons/icon.svg"))).toBe(true);
    expect(existsSync(join(root, "scripts/icons/icon-small.svg"))).toBe(true);
  });

  it("小さい版は要素を減らしてある", () => {
    const large = read("scripts/icons/icon.svg").toString();
    const small = read("scripts/icons/icon-small.svg").toString();
    // 方位盤の輪は大きい版だけ。小さい版に足したら、また染みになる。
    expect(large).toContain("<circle");
    expect(small).not.toContain('stroke-width="7"');
    expect(small.length).toBeLessThan(large.length);
  });

  it("作り直す手順がある", () => {
    const gen = read("scripts/build_icons.mjs").toString();
    expect(gen).toContain("icon-512.png");
    expect(gen).toContain("favicon.ico");
    expect(gen).toContain("icons/icon.svg".replace("icons/", ""));
  });
});

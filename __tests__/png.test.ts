import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { crc32, encodePngRgba } from "@/lib/png";

/**
 * 自前の PNG 書き出しを固定する。
 *
 * 用途地域の俯瞰タイル（`/api/zoning/raster`）が返す絵はこれで作る。
 * 画像ライブラリを入れずに書いているので、**仕様どおりの塊になって
 * いるか**をバイト列で確かめる。壊れた PNG は `<img>` が黙って空に
 * するだけで、画面からは「用途地域が出ない」としか見えない。
 */

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function readChunks(png: Buffer) {
  const chunks: { type: string; data: Buffer; crc: number }[] = [];
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    const crc = png.readUInt32BE(at + 8 + length);
    chunks.push({ type, data, crc });
    at += 12 + length;
  }
  return chunks;
}

describe("crc32", () => {
  it("PNG の IEND 塊の CRC（既知の値）に一致する", () => {
    /* データ無しの IEND は必ず AE 42 60 82。仕様書に載っている値 */
    expect(crc32(Buffer.from("IEND", "ascii"))).toBe(0xae426082);
  });

  it("空列の CRC は 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("encodePngRgba", () => {
  it("署名・IHDR・IDAT・IEND の順に並ぶ", () => {
    const png = encodePngRgba(2, 2, new Uint8Array(16));
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(readChunks(png).map((c) => c.type)).toEqual([
      "IHDR",
      "IDAT",
      "IEND",
    ]);
  });

  it("IHDR に大きさと 8 ビット RGBA が書かれている", () => {
    const png = encodePngRgba(3, 5, new Uint8Array(3 * 5 * 4));
    const ihdr = readChunks(png)[0].data;
    expect(ihdr.readUInt32BE(0)).toBe(3);
    expect(ihdr.readUInt32BE(4)).toBe(5);
    expect(ihdr[8]).toBe(8); // bit depth
    expect(ihdr[9]).toBe(6); // RGBA
    expect(ihdr[12]).toBe(0); // 非インターレース
  });

  it("IDAT を戻すと、各行の先頭にフィルタ 0 が付いた画素列になる", () => {
    const rgba = Uint8Array.from([
      // 行 0: 赤, 緑
      255, 0, 0, 255, 0, 255, 0, 255,
      // 行 1: 青, 透明
      0, 0, 255, 255, 0, 0, 0, 0,
    ]);
    const png = encodePngRgba(2, 2, rgba);
    const raw = inflateSync(readChunks(png)[1].data);
    expect([...raw]).toEqual([
      0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 0, 0, 0, 0,
    ]);
  });

  it("各塊の CRC が型名＋データに対して正しい", () => {
    const png = encodePngRgba(4, 4, new Uint8Array(64).fill(200));
    for (const c of readChunks(png)) {
      const input = Buffer.concat([Buffer.from(c.type, "ascii"), c.data]);
      expect(c.crc, c.type).toBe(crc32(input));
    }
  });

  it("画素数が合わなければ投げる（黙って切り詰めない）", () => {
    expect(() => encodePngRgba(2, 2, new Uint8Array(15))).toThrow();
    expect(() => encodePngRgba(0, 2, new Uint8Array(0))).toThrow();
  });

  it("同じ色が続く塗り絵は小さく縮む（タイル 1 枚が十数 KB 以内）", () => {
    /* 256 四方を左右で 2 色に塗った、いちばん単純な塗り絵 */
    const size = 256;
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const at = (y * size + x) * 4;
        rgba[at] = x < 128 ? 0x1b : 0xc2;
        rgba[at + 1] = x < 128 ? 0x5e : 0x18;
        rgba[at + 2] = x < 128 ? 0x20 : 0x5b;
        rgba[at + 3] = 255;
      }
    }
    const png = encodePngRgba(size, size, rgba);
    expect(png.length).toBeLessThan(4000);
  });
});

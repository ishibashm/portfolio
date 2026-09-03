import { deflateSync } from "node:zlib";

/**
 * RGBA の画素列を PNG にする。**サーバ専用**（`node:zlib` を使う）。
 *
 * ## なぜ自前か
 *
 * 用途地域の俯瞰タイル（`/api/zoning/raster`）が塗り絵を返すのに要る。
 * 依存に画像ライブラリ（sharp・canvas）は入っておらず、Cloud Run の
 * standalone 出力にネイティブ拡張を足すと build が環境ごとに揺れる。
 * PNG の書き出しは「zlib で潰した走査線に CRC 付きの塊を 3 つ巻く」だけ
 * なので、読むより書くほうが短い。
 *
 * ## 形式
 *
 * 8 ビット RGBA（色種別 6）・非インターレース・走査線フィルタは全行 0
 * （なし）。塗り絵は同じ色が横に続くので、フィルタ無しでも deflate が
 * 十分に縮める（実測は `__tests__/png.test.ts` の大きさの検査）。
 */

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** CRC-32（PNG が使う多項式 0xEDB88320）の表。起動時に 1 度だけ作る。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  /* CRC は型名とデータに掛かる。長さは含めない（仕様）。 */
  const crcInput = Buffer.concat([typeBytes, data]);
  out.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return out;
}

/**
 * `rgba` は横 `width`・縦 `height` の画素を左上から行ごとに並べたもの
 * （1 画素 4 バイト）。長さが合わなければ投げる——黙って切り詰めると
 * ずれた絵が出る。
 */
export function encodePngRgba(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Buffer {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`PNG の大きさが不正: ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `PNG の画素数が合わない: 期待 ${width * height * 4}、実際 ${rgba.length}`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  /* 各行の先頭にフィルタ種別 0 を置く。 */
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * アプリのアイコンを SVG から作り直す。
 *
 *   node scripts/build_icons.mjs
 *
 * **PNG を直接いじらない。**元は scripts/icons/*.svg の 2 つだけで、
 * public/ の PNG と ICO はここから機械的に出す。以前は元データが無く、
 * 直したいときに作り直す手段が無かった。
 *
 * 大小で図を分けてある。大きい版をそのまま縮めると、方位盤の輪と
 * 斜めの花びらがつぶれて**淡い染みにしか見えなくなる**（実測。16px で
 * ほぼ判別不能だった）。小さい図は要素を減らして色を濃くする。
 *
 *   icon.svg        180 / 192 / 512 用（輪と 8 枚の花びら）
 *   icon-small.svg  favicon.ico 用（花びら 4 枚、地色を濃いめ）
 *
 * ICO は PNG を格納する形式で書く。古い BMP 形式は要らない
 * （PNG in ICO は Vista 以降・現行のブラウザすべてが読む）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = (name) => readFileSync(join(here, "icons", name));
const out = (name) => join(root, "public", name);

/** SVG は density を上げてから縮める。既定のままだと輪郭がぼやける。 */
const render = (svg, size) =>
  sharp(svg, { density: 900 }).resize(size, size).png({ compressionLevel: 9 });

async function buildIco(svg, sizes) {
  const pngs = await Promise.all(sizes.map((s) => render(svg, s).toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(sizes.length, 4);

  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const b = dir.subarray(i * 16, i * 16 + 16);
    // 256 は 0 で表す決まり。ここでは 48 までなのでそのまま入る。
    b.writeUInt8(s === 256 ? 0 : s, 0);
    b.writeUInt8(s === 256 ? 0 : s, 1);
    b.writeUInt8(0, 2); // パレット数（PNG なので 0）
    b.writeUInt8(0, 3); // reserved
    b.writeUInt16LE(1, 4); // color planes
    b.writeUInt16LE(32, 6); // bits per pixel
    b.writeUInt32LE(pngs[i].length, 8);
    b.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
  });

  return Buffer.concat([header, dir, ...pngs]);
}

const large = src("icon.svg");
const small = src("icon-small.svg");

await render(large, 512).toFile(out("icon-512.png"));
await render(large, 192).toFile(out("icon-192.png"));
await render(large, 180).toFile(out("apple-touch-icon.png"));
writeFileSync(out("favicon.ico"), await buildIco(small, [16, 32, 48]));

console.log(
  "public/icon-512.png / icon-192.png / apple-touch-icon.png / favicon.ico を書き出した",
);

/**
 * 記事の代表画像（public/blog/<slug>.png）から WebP を作る。
 *
 * 記事ページのモバイル LCP の要素は、この代表画像（1800x945 の PNG、
 * 約 170KB）だった（サイト監査 2026-11-10。Lighthouse 13.6.0 モバイル
 * simulate で LCP 4.8 秒）。fetchpriority・width/height・eager は
 * すでに付いているので、残る手は**画像そのものを軽くする**こと。
 *
 * 作るもの（元の PNG は消さない。og:image と JSON-LD が使い、
 * 共有カードは PNG のほうが無難なので）:
 *
 *   <slug>.webp      1800 幅・可逆。図とテキストなので、可逆の WebP が
 *                    非可逆より小さく、文字もにじまない
 *                    （what-is-hidori-for-moving: PNG 170,018B → 約 67KB。
 *                     同じ画像の非可逆 q80 は約 73KB で、むしろ大きい）
 *   <slug>-900.webp  900 幅・非可逆 q82。スマホ（CSS 幅 約 370px）向け。
 *                    縮小すると可逆は PNG より大きくなる画像があるので、
 *                    こちらだけ非可逆にしている
 *
 * 使い方（sharp は依存に入っている。Chromium は要らない）:
 *
 *   node scripts/build_blog_webp.mjs
 *   ONLY=<slug>[,<slug>] node scripts/build_blog_webp.mjs
 *
 * **リポジトリに入れる**（scripts/build_blog_images.mjs と同じ方針）。
 * 記事の図を作り直したら、このスクリプトも回す。
 * 本文中のスライド（<slug>-slide-N.png）は対象外。
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "blog");
const SMALL_WIDTH = 900;
const SMALL_QUALITY = 82;

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

const files = (await readdir(DIR))
  .filter((f) => /^[a-z0-9-]+\.png$/.test(f) && !/-slide-\d+\.png$/.test(f))
  .filter((f) => !only || only.has(f.replace(/\.png$/, "")))
  .sort();

let pngTotal = 0;
let fullTotal = 0;
let smallTotal = 0;

for (const f of files) {
  const slug = f.replace(/\.png$/, "");
  const src = path.join(DIR, f);
  const meta = await sharp(src).metadata();
  if (meta.width !== 1800 || meta.height !== 945) {
    // ページ側は 1800x945 を前提に width/height を書いている
    console.warn(
      `skip ${f}: ${meta.width}x${meta.height}（1800x945 ではない）`,
    );
    continue;
  }
  const full = await sharp(src).webp({ lossless: true, effort: 6 }).toBuffer();
  const small = await sharp(src)
    .resize({ width: SMALL_WIDTH })
    .webp({ quality: SMALL_QUALITY, effort: 6 })
    .toBuffer();
  await writeFile(path.join(DIR, `${slug}.webp`), full);
  await writeFile(path.join(DIR, `${slug}-${SMALL_WIDTH}.webp`), small);
  const pngSize = (await stat(src)).size;
  pngTotal += pngSize;
  fullTotal += full.length;
  smallTotal += small.length;
  console.log(
    `${slug}: png ${pngSize} -> webp ${full.length} / ${small.length}`,
  );
}
console.log(
  `合計 ${files.length} 枚: png ${pngTotal} -> webp(1800) ${fullTotal} / webp(900) ${smallTotal}`,
);

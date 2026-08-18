import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

/**
 * アプリのアイコンが**名乗りどおりの中身**であることを見張る。
 *
 * 元は 3 つとも「中身は 1024x1024 の JPEG、拡張子だけ .png」の
 * **バイト単位で同一のファイル**（各 501,687 バイト）だった。
 * manifest.json は
 *
 *   icon-192.png        type: image/png, sizes: 192x192
 *   icon-512.png        type: image/png, sizes: 512x512
 *   apple-touch-icon    sizes: 180x180
 *
 * と宣言していたので、**型も寸法も全部うそ**だった。Next は拡張子で
 * Content-Type を決めるため、JPEG を image/png として配っていた。
 *
 * 実害は 2 つ。ホーム画面に追加したときのアイコンが 1024px から
 * 縮小されて眠くなること、そして**1 枚 490KB を 3 回**取りに行くこと。
 *
 * `/favicon.ico` は存在しなかった（Lighthouse の測定で 404 を確認）。
 * ブラウザは宣言が無くても必ず取りに行くので、全ページで 404 が 1 件出る。
 *
 * 中身の寸法まで見るのは、**拡張子を直しただけでは同じ事故が再発する**ため。
 * 名乗りと中身が合っていることを、manifest.json の側から引いて確かめる。
 */

const PUBLIC = path.join(process.cwd(), "public");

interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(PUBLIC, "manifest.json"), "utf8"),
) as { icons: ManifestIcon[]; name: string; description: string };

/** PNG の IHDR から寸法を読む。ライブラリを足さずに済ませる。 */
function readPng(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!buf.subarray(0, 8).equals(signature)) {
    // JPEG は FF D8 FF で始まる。取り違えの再発をここで名指しする。
    const head = buf.subarray(0, 3).toString("hex");
    throw new Error(`PNG ではない（先頭 ${head}）: ${path.basename(file)}`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("manifest.json のアイコン", () => {
  for (const icon of manifest.icons) {
    const [w, h] = icon.sizes.split("x").map(Number);

    it(`${icon.src} は宣言どおり ${icon.sizes} の PNG`, () => {
      const file = path.join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(fs.existsSync(file), `${icon.src} が無い`).toBe(true);
      expect(readPng(file)).toEqual({ width: w, height: h });
    });
  }

  it("type を名乗るなら image/png であること", () => {
    for (const icon of manifest.icons) {
      if (icon.type) expect(icon.type).toBe("image/png");
    }
  });

  it("3 つが同じファイルの使い回しになっていない", () => {
    // 元は 3 つとも md5 が同一だった。寸法別に作り分けること。
    const bytes = manifest.icons.map((i) =>
      fs
        .readFileSync(path.join(PUBLIC, i.src.replace(/^\//, "")))
        .toString("base64"),
    );
    expect(new Set(bytes).size).toBe(manifest.icons.length);
  });

  it("名乗りはサイトの説明と揃える", () => {
    // 元は「Real Estate Arbitrage, Katmer Knowledge Base & Meta-Hub Engine」
    // で、いまの中身（引越しの方位と物件選び）と食い違っていた。
    expect(manifest.name).toContain("Cloud Palette");
    expect(manifest.description).toContain("引越し");
    expect(manifest.description).not.toContain("Katmer");
  });
});

describe("favicon.ico", () => {
  it("実在して ICO の器になっている", () => {
    const buf = fs.readFileSync(path.join(PUBLIC, "favicon.ico"));
    // ICONDIR: reserved=0, type=1(icon), count>=1
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1);
    expect(buf.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
  });

  it("タブ用の 16px を持っている", () => {
    const buf = fs.readFileSync(path.join(PUBLIC, "favicon.ico"));
    const count = buf.readUInt16LE(4);
    const widths = Array.from({ length: count }, (_, i) => {
      const w = buf.readUInt8(6 + i * 16);
      return w === 0 ? 256 : w; // 0 は 256 を意味する
    });
    expect(widths).toContain(16);
  });
});

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  DEFAULT_SOCIAL_IMAGE,
  blogHeroWebp,
  blogImagePath,
} from "@/lib/blogImage";

/**
 * 記事の代表画像は `public/blog/<slug>.png` の有無だけで決まる。
 * 画像を足したのに反映されない・消したのに 404 を指す、という食い違いは
 * 頁を開いても見えない（og:image と JSON-LD にしか出ない）ので固定する。
 */

const DIR = path.join(process.cwd(), "public", "blog");

describe("記事の代表画像", () => {
  const slugs = readdirSync(DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""));

  it("画像のある記事はその画像を指す", () => {
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      expect(blogImagePath(slug)).toBe(`/blog/${slug}.png`);
    }
  });

  it("画像の無い記事は共通の画像に落ちる", () => {
    expect(blogImagePath("no-such-article-exists")).toBe(DEFAULT_SOCIAL_IMAGE);
  });

  it("slug に区切り文字が混ざっても public の外を指さない", () => {
    // URL の素片をそのまま繋ぐので、上の階層へ出られると困る
    for (const bad of ["../ogp", "a/b", "..", "ogp.png", ""]) {
      expect(blogImagePath(bad)).toBe(DEFAULT_SOCIAL_IMAGE);
    }
  });
});

/**
 * 記事の図の WebP（モバイル LCP の要素。サイト監査 2026-11-10）。
 * `scripts/build_blog_webp.mjs` が作る。PNG を作り直して WebP を回し忘れると、
 * 古い図が WebP で出続ける。頁を開いても気付けないのでここで固定する。
 */
describe("記事の図の WebP", () => {
  const heroSlugs = readdirSync(DIR)
    .filter((f) => /^[a-z0-9-]+\.png$/.test(f) && !/-slide-\d+\.png$/.test(f))
    .map((f) => f.replace(/\.png$/, ""));

  it("代表画像の PNG には、1800 幅と 900 幅の WebP が揃っている", async () => {
    expect(heroSlugs.length).toBeGreaterThan(0);
    for (const slug of heroSlugs) {
      const webp = blogHeroWebp(slug);
      expect(
        webp,
        `${slug} の WebP が無い（node scripts/build_blog_webp.mjs）`,
      ).not.toBeNull();
      const full = await sharp(path.join(DIR, `${slug}.webp`)).metadata();
      const small = await sharp(path.join(DIR, `${slug}-900.webp`)).metadata();
      // ページは width=1800 height=945 を属性で持つ。縦横比がずれると行が跳ねる
      expect([full.format, full.width, full.height]).toEqual([
        "webp",
        1800,
        945,
      ]);
      expect([small.format, small.width, small.height]).toEqual([
        "webp",
        900,
        473,
      ]);
    }
  });

  it("WebP が無い記事・slug が不正なときは null（PNG の img だけを出す）", () => {
    expect(blogHeroWebp("no-such-article-exists")).toBeNull();
    for (const bad of ["../ogp", "a/b", "..", "ogp.webp", ""]) {
      expect(blogHeroWebp(bad)).toBeNull();
    }
  });

  it("返す先は /blog/<slug>.webp と /blog/<slug>-900.webp", () => {
    const slug = heroSlugs[0];
    expect(blogHeroWebp(slug)).toEqual({
      full: `/blog/${slug}.webp`,
      small: `/blog/${slug}-900.webp`,
    });
  });
});

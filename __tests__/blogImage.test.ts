import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SOCIAL_IMAGE, blogImagePath } from "@/lib/blogImage";

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

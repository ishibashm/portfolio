/**
 * @vitest-environment node
 *
 * 記事の先頭は WebP だけを先読みする。PNG の fallback は `<picture>` の
 * 中にあり、React 19 はそこを自動では先読みしない。本文のスライドは
 * loading="lazy" で、先読みの対象から外す。
 */
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { expect, it } from "vitest";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import { BlogHero } from "@/components/blog/BlogHero";

async function htmlOf(node: ReturnType<typeof createElement>) {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

it("WebP がある先頭の図は WebP だけを先読みする", async () => {
  const html = await htmlOf(
    createElement(BlogHero, {
      src: "/blog/sample.png",
      alt: "図",
      webp: {
        full: "/blog/sample.webp",
        small: "/blog/sample-900.webp",
      },
    }),
  );
  const preloads = html.match(/<link rel="preload" as="image"[^>]*>/g) ?? [];
  expect(preloads).toHaveLength(1);
  expect(preloads[0]).toContain('type="image/webp"');
  expect(preloads[0]).toContain('fetchPriority="high"');
  expect(preloads[0]).toContain("/blog/sample-900.webp 900w");
  expect(preloads[0]).toContain("/blog/sample.webp 1800w");
  expect(preloads[0]).not.toContain("/blog/sample.png");
  expect(html).toContain('src="/blog/sample.png"');
  expect(html).toContain('fetchPriority="high"');
});

it("WebP が無い先頭の図は PNG を先読みする", async () => {
  const html = await htmlOf(
    createElement(BlogHero, {
      src: "/blog/sample.png",
      alt: "図",
      webp: null,
    }),
  );
  const preloads = html.match(/<link[^>]*rel="preload"[^>]*>/g) ?? [];
  expect(preloads).toHaveLength(1);
  expect(preloads[0]).toContain('as="image"');
  expect(preloads[0]).toContain('href="/blog/sample.png"');
  expect(preloads[0]).toContain('fetchPriority="high"');
});

it("本文の図は先読みせず lazy にする", async () => {
  const html = await htmlOf(
    createElement(BlogArticleBody, {
      body: "![一枚目](/blog/sample-slide-1.png)\n\n![二枚目](/blog/sample-slide-2.png)",
    }),
  );
  expect(html).not.toContain('rel="preload"');
  expect(html).toContain('src="/blog/sample-slide-1.png"');
  expect(html).toContain('src="/blog/sample-slide-2.png"');
  expect(html.match(/loading="lazy"/g)).toHaveLength(2);
  expect(html).not.toContain("fetchPriority");
});

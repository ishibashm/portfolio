import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BlogCardVideo } from "@/components/blog/BlogCardVideo";
import { blogCardVideoId } from "@/lib/blogVideo";
import { getBlogPost, getBlogPosts } from "@/lib/blog";
afterEach(cleanup);
const id = "HOsZYorHq64";
it("実記事のfrontmatterと一覧が同じ動画を持つ", () => {
  const slug = "four-foundations-of-eastern-divination";
  expect(getBlogPost(slug)?.youtubeId).toBe(id);
  expect(getBlogPosts().find((p) => p.slug === slug)?.youtubeId).toBe(id);
});
it("埋め込みだけを判定し、普通の参考リンク・不正ID・偽ホスト・コードは拾わない", () => {
  expect(
    blogCardVideoId({
      body: `<iframe src="https://www.youtube.com/embed/${id}?rel=0"></iframe>`,
    }),
  ).toBe(id);
  expect(blogCardVideoId({ youtubeId: id, body: "none" })).toBe(id);
  for (const body of [
    `[参考](https://youtu.be/${id})`,
    `https://youtube.com.evil.test/embed/${id}`,
    `https://youtube.com/embed/${id}extra`,
    "`https://youtube.com/embed/" + id + "`",
  ])
    expect(blogCardVideoId({ body })).toBeUndefined();
});
it("lazy画像だけ表示し、クリック先は記事のまま", () => {
  const { container } = render(
    <BlogCardVideo post={{ slug: "sample", title: "記事題", youtubeId: id }} />,
  );
  expect(screen.getByAltText("記事題")).toHaveAttribute(
    "src",
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  );
  expect(screen.getByAltText("記事題")).toHaveAttribute("loading", "lazy");
  expect(screen.getByRole("link")).toHaveAttribute("href", "/blog/sample");
  expect(screen.getByRole("link")).toHaveStyle({ aspectRatio: "16 / 9" });
  expect(screen.getByText("動画")).toBeInTheDocument();
  expect(container.querySelector("iframe")).toBeNull();
});
it.each([undefined, "", "invalid", "https://evil.test/id"])(
  "動画なし・不正IDはカードを変えない: %s",
  (youtubeId) => {
    const { container } = render(
      <BlogCardVideo post={{ slug: "sample", title: "記事題", youtubeId }} />,
    );
    expect(container).toBeEmptyDOMElement();
  },
);

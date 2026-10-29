import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { isValidYouTubeId } from "@/lib/blogVideo";
import { YouTubeFacade } from "@/components/blog/YouTubeFacade";
import { BlogVideo } from "@/components/blog/BlogVideo";
import { BlogArticleBody } from "@/components/blog/BlogArticleBody";
import { VideoJsonLd } from "@/components/JsonLd";
import { getBlogPost } from "@/lib/blog";
import { SITE_URL } from "@/lib/siteUrl";

const video = {
  youtubeId: "Abc_123-xyz",
  title: "動画のタイトル",
  description: "動画の説明",
  cover: "/blog/moving-during-tenchusatsu.png",
  uploadDate: "2026-10-17T12:00:00+09:00",
  duration: "PT1M40S",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("blog YouTube video", () => {
  it.each([
    undefined,
    null,
    "",
    " ",
    "abcdefghij",
    "abcdefghijkl",
    "abcdefghij!",
    "Abc_123-xyz\n",
    " Abc_123-xyz",
    "https://youtu.be/Abc_123-xyz",
    "<script>bad",
  ])("rejects invalid ID %s everywhere", (id) => {
    expect(isValidYouTubeId(id)).toBe(false);
    const props = { ...video, youtubeId: id as string | undefined };
    const { container } = render(
      <>
        <YouTubeFacade {...props} />
        <VideoJsonLd {...props} />
        <BlogVideo {...props} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts exactly 11 ASCII ID characters", () => {
    expect(isValidYouTubeId(video.youtubeId)).toBe(true);
    expect(isValidYouTubeId("_-012345678")).toBe(true);
  });

  it("loads only the local poster until clicked and keeps the 16:9 box", () => {
    const { container } = render(<YouTubeFacade {...video} />);
    expect(container.querySelector("iframe")).toBeNull();
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", video.cover);
    expect(img).toHaveAttribute("width", "1800");
    expect(img).toHaveAttribute("height", "945");
    const button = screen.getByRole("button", {
      name: `動画を再生: ${video.title}`,
    });
    const box = button.parentElement!;
    expect(box.style.aspectRatio).toBe("16 / 9");
    fireEvent.click(button);
    const frame = container.querySelector("iframe")!;
    expect(frame.parentElement).toBe(box);
    expect(frame).toHaveAttribute(
      "src",
      `https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`,
    );
    expect(frame).toHaveAttribute("title", video.title);
    expect(frame).toHaveAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    );
    expect(frame).toHaveAttribute("allowfullscreen");
    expect(frame).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
    expect(
      screen.getByText("ナレーション：VOICEVOX:玄野武宏"),
    ).toBeInTheDocument();
  });

  it("emits complete safely escaped VideoObject", () => {
    const title = "</script><script>alert(1)</script>";
    const { container } = render(<BlogVideo {...video} title={title} />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    )!;
    expect(script.textContent).not.toContain("<");
    expect(JSON.parse(script.textContent!)).toEqual({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: title,
      description: video.description,
      thumbnailUrl: new URL(video.cover, SITE_URL).href,
      uploadDate: video.uploadDate,
      duration: video.duration,
      embedUrl: `https://www.youtube.com/embed/${video.youtubeId}`,
      inLanguage: "ja",
    });
  });

  it("parses published frontmatter and places the directive after the conclusion", () => {
    const post = getBlogPost("moving-during-tenchusatsu")!;
    expect(post.youtubeId).toBe("PUq1v9mPVXM");
    expect(post.videoUploadDate).toBe("2026-10-24");
    expect(post.videoDuration).toBe("PT4M55S");
    const { container, rerender } = render(
      <BlogArticleBody body={post.body} video={{ ...video, youtubeId: "" }} />,
    );
    expect(
      container.querySelector("figure, iframe, script, button"),
    ).toBeNull();
    expect(container.textContent).not.toContain("::youtube");
    rerender(<BlogArticleBody body={post.body} video={video} />);
    const figure = container.querySelector("figure")!;
    expect(figure.previousElementSibling?.tagName).toBe("BLOCKQUOTE");
    expect(figure.nextElementSibling?.nextElementSibling?.textContent).toBe(
      "【あなたはどれ？】状況別に確認すること",
    );
  });

  it("loads quoted video metadata without truncating ISO timestamps", () => {
    const read = fs.readFileSync.bind(fs);
    vi.spyOn(fs, "readFileSync").mockImplementation(
      (...args: Parameters<typeof fs.readFileSync>) => {
        const source = read(...args);
        if (
          String(args[0]).endsWith("/moving-during-tenchusatsu.md") &&
          typeof source === "string"
        ) {
          return source
            .replace(/^youtubeId: .*$/m, `youtubeId: "${video.youtubeId}"`)
            .replace(
              /^videoUploadDate: .*$/m,
              `videoUploadDate: "${video.uploadDate}"`,
            )
            .replace(
              /^videoDuration: .*$/m,
              `videoDuration: "${video.duration}"\nvideoTitle: "動画のタイトル"\nvideoDescription: "動画の説明"`,
            );
        }
        return source;
      },
    );
    expect(getBlogPost("moving-during-tenchusatsu")).toMatchObject({
      youtubeId: video.youtubeId,
      videoUploadDate: video.uploadDate,
      videoDuration: video.duration,
      videoTitle: video.title,
      videoDescription: video.description,
    });
  });

  it("does not execute raw HTML or code as directives", () => {
    const { container } = render(
      <BlogArticleBody
        body={
          '<iframe src="https://evil.example"></iframe>\n\n`::youtube`\n\n```\n::youtube\n```'
        }
        video={video}
      />,
    );
    expect(container.querySelector("iframe, button, script")).toBeNull();
  });
});

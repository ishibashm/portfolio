import { MetadataRoute } from "next";
import { NON_CORE_DISALLOW } from "@/lib/siteStructure";

/**
 * 公開範囲は src/lib/siteStructure.ts に一本化している。
 *
 * 引越しの方位とタイミングというテーマから外れるページ（株価トレンド、
 * X閲覧、可視化ツールなど）を検索とAIクローラから閉じる。何のサイトか
 * 定まらないと回遊も広告カテゴリも決まらないため、露出を中核に絞る。
 * ページ自体は消していないので、URL を知っていれば従来どおり使える。
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || "https://cloud-palette.com";

  const disallow = ["/admin/", "/api/", ...NON_CORE_DISALLOW];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      // Explicit rules for AI Search & Agent Crawlers (LLMO / GEO)
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "Google-Extended",
          "PerplexityBot",
          "ClaudeBot",
          "Claude-Web",
          "Bytespider",
          "Applebot-Extended",
          "cohere-ai",
        ],
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

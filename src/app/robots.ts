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

  const disallow = [
    "/admin/",
    "/api/",
    "/relocation/candidates",
    ...NON_CORE_DISALLOW,
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      // Explicit rules for AI Search & Agent Crawlers (LLMO / GEO)
      //
      // 中身は "*" と同じ。名前を挙げるのは、AI の検索・回答に引かれて
      // よいと明示するため。検索用（索引を作る）と、利用者の依頼で頁を
      // 取りに来るもの（-User）は別の名前で来るので両方挙げる。
      // Claude-Web は Anthropic が使わなくなった名前なので外した
      // （外しても "*" に落ちるだけで、許す範囲は変わらない）。
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "Google-Extended",
          "PerplexityBot",
          "Perplexity-User",
          "ClaudeBot",
          "Claude-SearchBot",
          "Claude-User",
          "Bytespider",
          "Applebot-Extended",
          "Amazonbot",
          "meta-externalagent",
          "DuckAssistBot",
          "MistralAI-User",
          "cohere-ai",
        ],
        allow: ["/", "/llms.txt", "/llms-full.txt"],
        disallow,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

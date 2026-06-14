"use server";

import prisma from "@/lib/prisma";
import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";

/**
 * Save an article to the Knowledge Base (Second Brain).
 * First attempts to scrape and save full markdown; falls back to standard link note.
 */
export async function saveFavoriteArticle(
  title: string,
  url: string,
  source: string,
) {
  try {
    // Validate URL
    new URL(url);

    // Check if already exists in KnowledgeDocument
    const existing = await prisma.knowledgeDocument.findFirst({
      where: {
        title: title,
        domain: source,
      },
    });

    if (existing) {
      return {
        success: true,
        message: "すでにナレッジベースに保存されています。",
      };
    }

    let scrapedContent = "";
    let isScraped = false;

    try {
      // Fetch and parse the page
      const dom = await JSDOM.fromURL(url);

      // Use Defuddle to extract the main content as markdown
      const result = await Defuddle(dom, url, {
        markdown: true,
        debug: false,
      });

      if (result.content) {
        scrapedContent = result.content;
        isScraped = true;
      }
    } catch (scrapeErr) {
      console.warn(
        "Failed to scrape article content, falling back to link note:",
        scrapeErr,
      );
    }

    const content = isScraped
      ? scrapedContent
      : `## ${title}\n\n- **ソース**: ${source}\n- **リンク**: [記事を読む](${url})\n\n*(Tech Trend Center からお気に入り登録されました)*`;

    // Save to the ServiceNow-like KnowledgeDocument table
    await prisma.knowledgeDocument.create({
      data: {
        title: title,
        content: content,
        domain: source,
        category: "Tech Trends",
        type: "Note",
        status: "Draft",
        priority: "Medium",
      },
    });

    return {
      success: true,
      message: isScraped
        ? "ナレッジベースに記事内容を抽出して保存しました！"
        : "ナレッジベースにお気に入り登録しました！（リンク保存）",
    };
  } catch (err: any) {
    console.error("Failed to save favorite:", err);
    return {
      success: false,
      error: err.message || "保存に失敗しました。",
    };
  }
}

/**
 * Fetch all favorited articles' titles and domains to render filled stars.
 */
export async function getFavoriteArticles() {
  try {
    const favorites = await prisma.knowledgeDocument.findMany({
      where: {
        category: {
          in: ["Tech Trends", "Web Extract"],
        },
      },
      select: {
        title: true,
        domain: true,
      },
    });
    return { success: true, data: favorites };
  } catch (err: any) {
    console.error("Failed to fetch favorites:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Remove an article from the Knowledge Base.
 */
export async function removeFavoriteArticle(title: string, source: string) {
  try {
    await prisma.knowledgeDocument.deleteMany({
      where: {
        title: title,
        domain: source,
      },
    });
    return { success: true, message: "お気に入りを解除しました。" };
  } catch (err: any) {
    console.error("Failed to delete favorite:", err);
    return { success: false, error: err.message };
  }
}

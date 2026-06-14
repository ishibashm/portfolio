"use server";

import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import prisma from "@/lib/prisma";

export async function extractArticle(url: string) {
  try {
    // Validate URL
    new URL(url);

    // Fetch and parse the page
    const dom = await JSDOM.fromURL(url);

    // Use Defuddle to extract the main content as markdown
    const result = await Defuddle(dom, url, {
      markdown: true,
      debug: false,
    });

    return {
      success: true,
      data: {
        title: result.title,
        content: result.content,
        author: result.author,
        site: result.site,
      },
    };
  } catch (error: any) {
    console.error("Extraction error:", error);
    return {
      success: false,
      error: error.message || "Failed to extract content from the URL",
    };
  }
}

export async function saveToKnowledgeBase(
  title: string,
  content: string,
  site?: string,
) {
  try {
    const document = await prisma.knowledgeDocument.create({
      data: {
        title: title,
        content: content,
        domain: site || "Web Extract",
        category: "Web Extract",
        type: "Note",
        status: "Draft",
        priority: "Medium",
      },
    });

    return {
      success: true,
      kb_id: `KB${document.kb_id.toString().padStart(6, "0")}`,
    };
  } catch (error: any) {
    console.error("Save to KB error:", error);
    return {
      success: false,
      error: error.message || "Failed to save to Knowledge Base",
    };
  }
}

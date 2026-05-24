"use server";

import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import prisma from "@/lib/prisma";

export async function extractAndSaveArticle(url: string) {
  try {
    // Validate URL
    new URL(url);
    
    // Fetch and parse the page
    const dom = await JSDOM.fromURL(url);

    // Use Defuddle to extract the main content as markdown
    const result = await Defuddle(dom, url, {
      markdown: true,
      debug: false
    });

    if (!result.content || !result.title) {
        return { success: false, error: "Failed to extract meaningful content from the URL." };
    }

    // Save to the ServiceNow-like KnowledgeDocument table
    const document = await prisma.knowledgeDocument.create({
        data: {
            title: result.title,
            content: result.content,
            domain: result.site || new URL(url).hostname,
            category: "Web Extract",
            type: "Note",
            status: "Draft",
            priority: "Medium"
        }
    });

    return {
      success: true,
      data: {
        kb_id: `KB${document.kb_id.toString().padStart(6, '0')}`,
        title: result.title,
        content: result.content,
        author: result.author,
        site: result.site
      }
    };
  } catch (error: any) {
    console.error("Extraction error:", error);
    return {
      success: false,
      error: error.message || "Failed to extract content from the URL"
    };
  }
}

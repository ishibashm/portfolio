"use server";

import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";

export async function extractArticle(url: string) {
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

    return {
      success: true,
      data: {
        title: result.title,
        content: result.content, // with markdown: true, content should be markdown
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

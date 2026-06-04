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

export async function getArticles() {
  try {
    const documents = await prisma.knowledgeDocument.findMany({
      orderBy: { created_at: 'desc' }
    });
    return {
      success: true,
      data: documents.map(doc => ({
        id: doc.id,
        kb_id: `KB${doc.kb_id.toString().padStart(6, '0')}`,
        title: doc.title,
        content: doc.content,
        domain: doc.domain,
        category: doc.category,
        type: doc.type,
        status: doc.status,
        priority: doc.priority,
        created_at: doc.created_at.toISOString()
      }))
    };
  } catch (error: any) {
    console.error("Failed to fetch articles:", error);
    return { success: false, error: error.message || "Failed to fetch articles" };
  }
}

export async function deleteArticle(id: string) {
  try {
    await prisma.knowledgeDocument.delete({
      where: { id }
    });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete article:", error);
    return { success: false, error: error.message || "Failed to delete article" };
  }
}

import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

const apiKey =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "models/gemini-embedding-2" });

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

/**
 * Searches the internal knowledge base using pgvector similarity.
 */
export async function searchInternalKnowledge(
  query: string,
  limit: number = 5,
  userId?: string,
): Promise<SearchResult[]> {
  try {
    // 1. Generate embedding for the query
    const result = await model.embedContent(query);

    const embedding = result.embedding.values;
    const vectorLiteral = `[${embedding.join(",")}]`;

    // 2. Perform vector search using cosine distance (<=>)
    let docs;
    if (userId) {
      docs = await prisma.$queryRaw<any[]>`
        SELECT 
          id, 
          title, 
          content,
          1 - (embedding <=> ${vectorLiteral}::vector) as similarity
        FROM "KnowledgeDocument"
        WHERE embedding IS NOT NULL AND user_id = ${userId}
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit};
      `;
    } else {
      docs = await prisma.$queryRaw<any[]>`
        SELECT 
          id, 
          title, 
          content,
          1 - (embedding <=> ${vectorLiteral}::vector) as similarity
        FROM "KnowledgeDocument"
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit};
      `;
    }

    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title || "Untitled",
      content: doc.content || "",
      similarity: doc.similarity,
    }));
  } catch (error) {
    console.error("Error in searchInternalKnowledge:", error);
    throw new Error("Failed to search internal knowledge base");
  }
}

/**
 * Wrapper for the latest web search.
 * Implements a free web scraper using DuckDuckGo HTML search.
 */
export async function searchWebLatest(query: string): Promise<string> {
  console.log(`[Web Search Wrapper] Fetching DuckDuckGo for: ${query}`);
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        },
      },
    );

    if (!res.ok) {
      console.error(`[Web Search] Failed to fetch: ${res.status}`);
      return "No web results found.";
    }

    const html = await res.text();
    const resultBlocks = html.split('class="result__body"').slice(1);

    if (resultBlocks.length === 0) {
      return "No web results found.";
    }

    const results = resultBlocks.slice(0, 5).map((block) => {
      const titleMatch = block.match(
        /<h2 class="result__title">[\s\S]*?<a class="result__a"[^>]*>([\s\S]*?)<\/a>/,
      );
      const snippetMatch = block.match(
        /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
      );
      const urlMatch = block.match(/<a class="result__url" href="([^"]+)"/);

      // Remove HTML tags and decode basic HTML entities
      const cleanHtml = (str: string) =>
        str
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();

      const title = titleMatch ? cleanHtml(titleMatch[1]) : "Unknown Title";
      const snippet = snippetMatch ? cleanHtml(snippetMatch[1]) : "";
      const url = urlMatch ? urlMatch[1] : "";

      let cleanUrl = url;
      if (url.includes("uddg=")) {
        try {
          cleanUrl = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
        } catch (e) {}
      } else if (url.startsWith("//")) {
        cleanUrl = "https:" + url;
      }

      return `Title: ${title}\nSnippet: ${snippet}\nURL: ${cleanUrl}`;
    });

    return results.join("\n\n");
  } catch (err) {
    console.error("Web search error:", err);
    return `(Web Search Error)`;
  }
}

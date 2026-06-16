"use server";

import { JSDOM } from "jsdom";
import { Defuddle } from "defuddle/node";
import prisma from "@/lib/prisma";
import { embed, embedMany } from "ai";
import { google } from "@ai-sdk/google";

// テキストを指定文字数で分割（チャンク化）し、少しオーバーラップさせる関数
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    if (i + chunkSize >= text.length) break;
    // 次のチャンクは、前のチャンクの末尾とオーバーラップ（重複）させて文脈の分断を防ぐ
    i += chunkSize - overlap;
  }
  return chunks;
}

export async function extractAndSaveArticle(url: string) {
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

    if (!result.content || !result.title) {
      return {
        success: false,
        error: "Failed to extract meaningful content from the URL.",
      };
    }

    // Save the main document
    const document = await prisma.knowledgeDocument.create({
      data: {
        title: result.title,
        content: result.content || "",
        domain: result.site || new URL(url).hostname,
        category: "Web Extract",
        type: "Note",
        status: "Draft",
        priority: "Medium",
      },
    });

    // 本文をチャンクに分割
    const fullText = result.content || "";
    const chunks = chunkText(fullText, 1000, 200);
    
    // 分割したチャンクが1つもない場合はタイトルのみをチャンクにする
    if (chunks.length === 0) chunks.push(result.title);

    // すべてのチャンクを一括でベクトル化
    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel("text-embedding-004"),
      values: chunks.map(chunk => `${result.title}\n\n${chunk}`), // 検索精度を上げるため、各チャンクの先頭にタイトルを付与
    });

    // チャンクデータを構築して保存
    const chunkData = chunks.map((chunkContent, i) => ({
      document_id: document.id,
      chunk_index: i,
      content: chunkContent,
      embedding: embeddings[i], // JSONとして保存
    }));

    await prisma.knowledgeChunk.createMany({
      data: chunkData,
    });

    return {
      success: true,
      data: {
        kb_id: `KB${document.kb_id.toString().padStart(6, "0")}`,
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

export async function getArticles() {
  try {
    const documents = await prisma.knowledgeDocument.findMany({
      orderBy: { created_at: "desc" },
    });
    return {
      success: true,
      data: documents.map((doc) => ({
        id: doc.id,
        kb_id: `KB${doc.kb_id.toString().padStart(6, "0")}`,
        title: doc.title,
        content: doc.content,
        domain: doc.domain,
        category: doc.category,
        type: doc.type,
        status: doc.status,
        priority: doc.priority,
        created_at: doc.created_at.toISOString(),
      })),
    };
  } catch (error: any) {
    console.error("Failed to fetch articles:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch articles",
    };
  }
}

export async function deleteArticle(id: string) {
  try {
    await prisma.knowledgeDocument.delete({
      where: { id },
    });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete article:", error);
    return {
      success: false,
      error: error.message || "Failed to delete article",
    };
  }
}

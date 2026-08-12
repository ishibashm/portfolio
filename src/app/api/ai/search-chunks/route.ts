import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // 1. Generate embedding for the query
    const { embedding } = await embed({
      model: google.textEmbeddingModel("text-embedding-004"),
      value: query,
    });

    // 2. Perform vector search using cosine distance (<=>)
    // Assuming the underlying database column was manually altered to vector type, or we cast JSON to vector.
    // If embedding is stored as JSON, we might need to cast it.
    const vectorLiteral = `[${embedding.join(",")}]`;
    
    // We fetch the chunks and JOIN with the parent document to get the metadata
    const chunks = await prisma.$queryRaw<any[]>`
      SELECT 
        c.id as chunk_id,
        c.content as chunk_content,
        c.chunk_index,
        1 - (c.embedding::text::vector <=> ${vectorLiteral}::vector) as similarity,
        d.kb_id,
        d.title,
        d.domain,
        d.category
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDocument" d ON c.document_id = d.id
      WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding::text::vector <=> ${vectorLiteral}::vector
      LIMIT 10;
    `;

    return NextResponse.json({ success: true, chunks });
  } catch (error) {
    console.error("Search Chunks API Error:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Failed to search chunks") },
      { status: 500 }
    );
  }
}

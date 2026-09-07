import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { toResponseMessage } from "@/lib/errorMessage";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import prisma from "@/lib/prisma";

/*
  ログイン必須。この口は埋め込み（text-embedding-004）を毎回呼ぶ課金 API で、
  middleware は /api を素通しにしている。同じ階層の summarize / categorize /
  chat-knowledge / bbs-analyze は全部 auth.getUser() で閉じているのに、
  ここだけ誰でも叩けた。画面からの呼び出しは無い（grep で 0 件）。
  値も型と長さを見る。埋め込みは入力の長さぶん課金される。
*/
const MAX_QUERY_CHARS = 500;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query } = await req.json();

    if (typeof query !== "string" || query.trim() === "") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }
    if (query.length > MAX_QUERY_CHARS) {
      return NextResponse.json(
        { error: `Query must be ${MAX_QUERY_CHARS} characters or fewer` },
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
    /* 行の中身はここでは一切読まず、JSON にしてそのまま返すだけ。
       読まないものに形を主張しない（#149 の「読む枝だけ型にする」で、
       読む枝がゼロの場合）。読む処理を足すときに、その項目だけ型にする。 */
    const chunks = await prisma.$queryRaw<unknown[]>`
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

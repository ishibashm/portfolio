import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createClient } from "@/utils/supabase/server";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, docs } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required." },
        { status: 400 },
      );
    }

    // Format knowledge chunks as the context for the model
    const contextText =
      docs && docs.length > 0
        ? docs
            .map((chunk: any) => {
              const kbPrefix = typeof chunk.kb_id === "string" && chunk.kb_id.startsWith("KB")
                ? chunk.kb_id
                : "KB" + String(chunk.kb_id).padStart(6, "0");
              return `<chunk id="${kbPrefix}-Part${chunk.chunk_index + 1}" source="${kbPrefix}" title="${chunk.title}">\n${chunk.chunk_content || chunk.content}\n</chunk>`;
            })
            .join("\n\n")
        : "No relevant knowledge documents found.";

    const systemPrompt = `You are an advanced RAG (Retrieval-Augmented Generation) assistant for the user's ITSM / Personal Knowledge Base. Your task is to answer the user's queries accurately, objectively, and ONLY based on the provided document chunks.

Guidelines:
1. Ground all your answers strictly in the text contained within the <chunk> tags.
2. In your answers, cite the chunks you reference using their source ID and part in brackets, e.g., [KB000001-Part1]. Multiple citations should be separated by commas.
3. Make the citations clickable links in markdown if you want, but formatting them simply as text [KB000001-Part1] is fine.
4. If the provided chunks do not contain enough information to answer the question, state: "提供されたナレッジドキュメントから該当する情報を特定できませんでした。" (Could not identify the relevant information from the provided knowledge chunks) and do not make up any information.
5. Always respond in Japanese unless the query is in another language.

Knowledge Base Chunks:
${contextText}`;

    // Get response from Gemini
    const result = await generateText({
      model: google("gemini-2.5-pro"),
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return NextResponse.json({ success: true, text: result.text });
  } catch (error: any) {
    console.error("Chat Knowledge API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process chat request." },
      { status: 500 },
    );
  }
}

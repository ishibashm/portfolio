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

    // Format knowledge documents as the context for the model
    const contextText =
      docs && docs.length > 0
        ? docs
            .map((doc: any) => {
              const kbPrefix = typeof doc.kb_id === "string" && doc.kb_id.startsWith("KB")
                ? doc.kb_id
                : "KB" + String(doc.kb_id).padStart(6, "0");
              return `<document id="${kbPrefix}" title="${doc.title}">\n${doc.content}\n</document>`;
            })
            .join("\n\n")
        : "No relevant knowledge documents found.";

    const systemPrompt = `You are an advanced RAG (Retrieval-Augmented Generation) assistant for the user's ITSM / Personal Knowledge Base. Your task is to answer the user's queries accurately, objectively, and ONLY based on the provided documents.

Guidelines:
1. Ground all your answers strictly in the text contained within the <document> tags.
2. In your answers, cite the documents you reference using their ID in brackets, e.g., [KB000001]. Multiple citations should be separated by commas, e.g., [KB000001], [KB000002].
3. Make the citations clickable links in markdown if you want, but formatting them simply as text [KB000001] is fine. The UI will automatically detect and linkify [KBxxxxxx] strings.
4. If the provided documents do not contain enough information to answer the question, state: "提供されたナレッジドキュメントから該当する情報を特定できませんでした。" (Could not identify the relevant information from the provided knowledge documents) and do not make up any information.
5. Always respond in Japanese unless the query is in another language.

Knowledge Base Documents:
${contextText}`;

    // Get response from Gemini
    const result = await generateText({
      model: google("gemini-1.5-pro"),
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

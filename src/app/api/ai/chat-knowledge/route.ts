import { NextResponse } from "next/server";
import { toResponseMessage } from "@/lib/errorMessage";
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

    const { messages, docs } = (await req.json()) as {
      messages?: unknown;
      // 返す一覧に使う枝だけ。ナレッジ検索の結果をそのまま受けている。
      docs?: { title?: string; kb_id?: string | number }[];
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Messages array is required." },
        { status: 400 },
      );
    }

    // Paid Gemini API call is disabled to prevent API charges
    return NextResponse.json({
      success: true,
      text:
        docs && docs.length > 0
          ? `【ナレッジ検索結果】\n${docs.map((d) => `- ${d.title} (${d.kb_id || "KB"})`).join("\n")}\n\n⚠️ 課金AI機能（Gemini API）は現在除外・無効化されています。上記の検索結果ドキュメントを直接参照してください。`
          : "⚠️ 課金AI機能（Gemini API）は現在除外・無効化されています。",
    });
  } catch (error) {
    console.error("Chat Knowledge API Error:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Failed to process chat request.") },
      { status: 500 },
    );
  }
}

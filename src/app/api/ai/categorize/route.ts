import { NextResponse } from "next/server";
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

    const { content } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: "Content is required." },
        { status: 400 },
      );
    }

    // Paid Gemini API call is disabled to prevent API charges
    return NextResponse.json(
      {
        error: "課金API（Gemini API）の呼び出しは設定により現在除外・無効化されています。",
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("Categorize API Error:", error);
    return NextResponse.json(
      { error: "Failed to categorize document." },
      { status: 500 },
    );
  }
}

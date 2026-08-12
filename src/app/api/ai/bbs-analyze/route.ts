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

    const { comments } = await req.json();

    if (!comments) {
      return NextResponse.json(
        { error: "Comments text is required." },
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
    console.error("BBS Analyze API Error:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Failed to analyze comments.") },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { maskPII } from "@/utils/anonymizer";

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
  } catch (error: any) {
    console.error("BBS Analyze API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze comments." },
      { status: 500 },
    );
  }
}

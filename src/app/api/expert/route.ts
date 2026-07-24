import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/utils/supabase/server";
import { decrypt } from "@/utils/encryption";
import { maskPII } from "@/utils/anonymizer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json(
        { error: "Unauthorized. Please login first." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 },
      );
    }

    // Get the user's config to fetch the encrypted API key
    const { data: userConfig, error: configError } = await supabase
      .from("user_configs")
      .select("encrypted_gemini_key")
      .eq("user_email", user.email)
      .single();

    // Paid Gemini API call is disabled to prevent API charges
    return NextResponse.json(
      {
        error: "課金API（Gemini API）の呼び出しは設定により現在除外・無効化されています。",
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("Expert API Error:", error);
    return NextResponse.json(
      { error: "Failed to process request." },
      { status: 500 },
    );
  }
}

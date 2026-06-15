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

    const { content } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: "Content is required." },
        { status: 400 },
      );
    }

    // Mask sensitive details
    const maskedContent = maskPII(content);

    // Call Gemini to generate summary, key takeaways, and action items
    const result = await generateObject({
      model: google("gemini-1.5-pro"),
      schema: z.object({
        summary: z
          .string()
          .describe("A concise 1-2 sentence executive summary of the document."),
        takeaways: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe("3 to 5 highly relevant key points or takeaways from the document."),
        actions: z
          .array(z.string())
          .min(1)
          .max(4)
          .describe("2 to 4 recommended next steps, action items, or follow-ups based on the content."),
      }),
      prompt: `Please analyze the following markdown document and extract an executive summary, key takeaways, and action items/next steps.\n\nDocument Content:\n${maskedContent}`,
    });

    return NextResponse.json(result.object);
  } catch (error: any) {
    console.error("Summarize API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate summary." },
      { status: 500 },
    );
  }
}

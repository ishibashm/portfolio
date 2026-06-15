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

    // Mask sensitive details
    const maskedComments = maskPII(comments);

    // Call Gemini to analyze bulletin board comments
    const result = await generateObject({
      model: google("gemini-2.5-pro"),
      schema: z.object({
        sentimentScore: z
          .number()
          .min(-100)
          .max(100)
          .describe("Overall market sentiment score from -100 (extreme panic/bearish) to +100 (extreme greed/bullish)."),
        bullishPercent: z
          .number()
          .min(0)
          .max(100)
          .describe("Percentage of comments expressing positive, bullish, or buying intentions."),
        bearishPercent: z
          .number()
          .min(0)
          .max(100)
          .describe("Percentage of comments expressing negative, bearish, or selling/panic intentions."),
        topics: z
          .array(z.string())
          .describe("List of 3 to 6 key topics, rumors, or keywords mentioned frequently in the comments (e.g. '円高対策', '利下げ懸念', 'EV減速')."),
        summary: z
          .string()
          .describe("A structured summary (2-3 sentences) of the board consensus, noting any particular risks or retail sentiment traps (e.g. short squeeze warning, panic selling)."),
      }),
      prompt: `Please analyze the following stock forum comments/bulletin board posts. Calculate the sentiment metrics (Bullish vs Bearish percentages, sentiment score) and provide key topics discussed and an executive summary of the consensus.\n\nForum Comments:\n${maskedComments}`,
    });

    return NextResponse.json(result.object);
  } catch (error: any) {
    console.error("BBS Analyze API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze comments." },
      { status: 500 },
    );
  }
}

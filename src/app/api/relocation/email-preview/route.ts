import { NextRequest } from "next/server";
import { z } from "zod";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateUser,
  CandidateError,
} from "@/lib/listingCandidateApi";
import { extractEmailUrls, EmailPreviewError } from "@/lib/listingEmailIngest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const userId = await candidateUser(req, true);
    await candidateRate(`email-preview:${userId}`, 10);
    const input = z
      .object({
        source: z.string().min(1).max(12000),
        format: z.enum(["text", "html", "mime"]),
      })
      .strict()
      .safeParse(await candidateBody(req));
    if (!input.success)
      throw new CandidateError(
        400,
        "INVALID_INPUT",
        "形式と入力を確認してください。",
      );
    return candidateJson(
      extractEmailUrls(input.data.source, input.data.format),
    );
  } catch (error) {
    return candidateFailure(
      error instanceof EmailPreviewError
        ? new CandidateError(400, "INVALID_EMAIL", error.message)
        : error,
    );
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { normalizeCandidateUrl } from "@/lib/listingCandidateInput";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateUser,
  CandidateError,
} from "@/lib/listingCandidateApi";
export const dynamic = "force-dynamic";
// POST keeps the reference URL out of access logs. Read-only, but same-origin.
export async function POST(req: NextRequest) {
  try {
    const userId = await candidateUser(req, true);
    await candidateRate(`read:${userId}`, 60);
    const parsed = z
      .object({ url: z.string().max(2048) })
      .strict()
      .safeParse(await candidateBody(req));
    const url = parsed.success && normalizeCandidateUrl(parsed.data.url);
    if (!url)
      throw new CandidateError(
        400,
        "INVALID_URL",
        "参照URLを確認してください。",
      );
    const count = await prisma.listingCandidate.count({
      where: { userId, url },
    });
    return candidateJson({ count });
  } catch (e) {
    return candidateFailure(e);
  }
}

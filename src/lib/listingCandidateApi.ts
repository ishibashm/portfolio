import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import { isSameOrigin } from "@/lib/apiGuard";

export const privateHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
export class CandidateError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function candidateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}
export function candidateFailure(error: unknown) {
  const e =
    error instanceof CandidateError
      ? error
      : new CandidateError(
          503,
          "UNAVAILABLE",
          "処理できませんでした。入力を残したまま、後でもう一度お試しください。",
        );
  // Never log errors from Prisma/fetch: they can embed private query arguments.
  return NextResponse.json(
    { code: e.code, error: e.message },
    {
      status: e.status,
      headers: {
        ...privateHeaders,
        ...(e.status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
export async function candidateUser(req: NextRequest, write = false) {
  if (
    write &&
    (!isSameOrigin(req) ||
      new URL(req.headers.get("origin")!).protocol !== req.nextUrl.protocol)
  )
    throw new CandidateError(403, "ORIGIN", "同じサイトから操作してください。");
  const user = await getAuthUser();
  const id = user && toUserId(user);
  if (!id)
    throw new CandidateError(
      401,
      "LOGIN_REQUIRED",
      "候補履歴にはログインが必要です。",
    );
  return id;
}
export async function candidateBody(req: NextRequest): Promise<unknown> {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new CandidateError(
      400,
      "INVALID_JSON",
      "JSON形式で送信してください。",
    );
  const reader = req.body?.getReader();
  if (!reader)
    throw new CandidateError(400, "INVALID_JSON", "入力を確認してください。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new CandidateError(400, "BODY_TOO_LARGE", "入力が長すぎます。");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CandidateError(400, "INVALID_JSON", "入力を確認してください。");
  }
}
/** Atomic shared fixed window counter; no addresses/coordinates in rate keys. */
export async function candidateRate(key: string, limit: number) {
  const rows = await prisma.$queryRaw<{ hits: number }[]>(Prisma.sql`
    INSERT INTO listing_candidate_rates (key, hits, "resetsAt")
    VALUES (${key}, 1, clock_timestamp() + interval '60 seconds')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN listing_candidate_rates."resetsAt" <= clock_timestamp() THEN 1 ELSE listing_candidate_rates.hits + 1 END,
      "resetsAt" = CASE WHEN listing_candidate_rates."resetsAt" <= clock_timestamp() THEN clock_timestamp() + interval '60 seconds' ELSE listing_candidate_rates."resetsAt" END
    RETURNING hits`);
  if (rows[0].hits > limit)
    throw new CandidateError(
      429,
      "RATE_LIMIT",
      "操作が続きすぎています。1分ほど待ってください。",
    );
}
export async function lockCandidateOwner(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 21092026))`;
}
export const candidateSelect = {
  id: true,
  url: true,
  title: true,
  memo: true,
  lat: true,
  lon: true,
  bearingDeg: true,
  direction: true,
  judgment: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ListingCandidateSelect;

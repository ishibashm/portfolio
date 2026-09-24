import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  candidateBody,
  candidateFailure,
  candidateJson,
  candidateRate,
  candidateUser,
  CandidateError,
} from "@/lib/listingCandidateApi";
import { GMAIL_READONLY_SCOPE } from "@/lib/listingEmailConnection";
import { extractEmailUrls } from "@/lib/listingEmailIngest";
import { GmailError, gmailConfig, requireGmailEnabled } from "./security";
import { GmailListingEmailReader } from "./reader";
import { gmailConnectionStore } from "./store";
const cookieName = "__Host-listing-email-oauth";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};
function failure(e: unknown) {
  if (!(e instanceof GmailError)) return candidateFailure(e);
  const status =
    e.code === "GMAIL_DISABLED"
      ? 503
      : e.code === "OAUTH_STATE"
        ? 403
        : e.code === "NOT_FOUND"
          ? 404
          : e.code.startsWith("INVALID_")
            ? 400
            : 503;
  return candidateJson(
    { code: e.code, error: "メール接続を処理できませんでした。" },
    status,
  );
}
export async function gmailConnect(req: NextRequest) {
  try {
    requireGmailEnabled();
    const owner = await candidateUser(req, true);
    await candidateRate(`gmail-connect:${owner}`, 5);
    const config = gmailConfig();
    if (new URL(config.redirectUri).origin !== req.nextUrl.origin)
      throw new GmailError("GMAIL_CONFIG");
    const state = randomBytes(32).toString("base64url");
    const browser = randomBytes(32).toString("base64url");
    await prisma.$executeRaw`
      INSERT INTO listing_email_oauth_states ("userId", "stateHash", "browserHash", "expiresAt")
      VALUES (${owner}::uuid, ${hash(state)}, ${hash(browser)}, now() + interval '10 minutes')
      ON CONFLICT ("userId") DO UPDATE SET "stateHash" = EXCLUDED."stateHash", "browserHash" = EXCLUDED."browserHash", "expiresAt" = EXCLUDED."expiresAt"`;
    // Local stub only: no consent URL, redirect or authorization code exchange.
    const response = candidateJson({
      code: "OAUTH_STUB",
      state,
      scope: GMAIL_READONLY_SCOPE,
      redirectUri: config.redirectUri,
    });
    response.cookies.set(cookieName, browser, {
      ...cookieOptions,
      maxAge: 600,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
export async function gmailCallback(req: NextRequest) {
  let response;
  try {
    requireGmailEnabled();
    const owner = await candidateUser(req);
    const config = gmailConfig();
    if (new URL(config.redirectUri).origin !== req.nextUrl.origin)
      throw new GmailError("GMAIL_CONFIG");
    const state = req.nextUrl.searchParams.get("state");
    const browser = req.cookies.get(cookieName)?.value;
    if (
      req.nextUrl.searchParams.getAll("state").length !== 1 ||
      !state ||
      !browser ||
      !/^[\w-]{43}$/.test(state) ||
      !/^[\w-]{43}$/.test(browser)
    )
      throw new GmailError("OAUTH_STATE");
    const count =
      await prisma.$executeRaw`DELETE FROM listing_email_oauth_states WHERE "userId" = ${owner}::uuid AND "stateHash" = ${hash(state)} AND "browserHash" = ${hash(browser)} AND "expiresAt" > now()`;
    if (count !== 1) throw new GmailError("OAUTH_STATE");
    // Code/error query values are deliberately neither read, logged nor exchanged.
    response = candidateJson({ code: "OAUTH_STUB", connected: false }, 501);
  } catch (e) {
    response = failure(e);
  }
  response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function gmailRead(req: NextRequest) {
  try {
    requireGmailEnabled();
    const owner = await candidateUser(req, true);
    await candidateRate(`gmail-read:${owner}`, 10);
    const window = z
      .object({
        connectionId: z.uuid(),
        labelId: z.string().min(1).max(200),
        startedAt: z.iso.datetime(),
        maxMessages: z.number().int().min(1).max(20),
        cursor: z.uuid().nullable(),
      })
      .strict()
      .safeParse(await candidateBody(req));
    if (!window.success)
      throw new CandidateError(
        400,
        "INVALID_WINDOW",
        "取得条件を確認してください。",
      );
    const result = await new GmailListingEmailReader(gmailConnectionStore).read(
      owner,
      window.data,
    );
    const urls = new Set<string>();
    let truncated = false;
    for (const { rawMime } of result.messages) {
      const extracted = extractEmailUrls(rawMime, "mime");
      truncated ||= extracted.truncated;
      for (const url of extracted.urls) {
        if (urls.size >= 20 && !urls.has(url)) truncated = true;
        else urls.add(url);
      }
    }
    return candidateJson({
      urls: [...urls],
      truncated,
      nextCursor: result.nextCursor,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function gmailDisconnect(req: NextRequest) {
  try {
    requireGmailEnabled();
    const owner = await candidateUser(req, true);
    await candidateRate(`gmail-disconnect:${owner}`, 10);
    const input = z
      .object({ connectionId: z.uuid() })
      .strict()
      .safeParse(await candidateBody(req));
    if (!input.success)
      throw new CandidateError(
        400,
        "INVALID_INPUT",
        "接続を確認してください。",
      );
    await new GmailListingEmailReader(gmailConnectionStore).disconnect(
      owner,
      input.data.connectionId,
    );
    return candidateJson({ disconnected: true });
  } catch (e) {
    return failure(e);
  }
}

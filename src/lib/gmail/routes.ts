import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
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
import {
  GmailError,
  gmailConfig,
  requireGmailEnabled,
  seal,
  unseal,
} from "./security";
import { GmailListingEmailReader } from "./reader";
import { GmailAccountService } from "./account";
import { gmailConnectionStore, createGmailConnection } from "./store";
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
export function createGmailHandlers(transport: typeof fetch) {
  const account = new GmailAccountService(
    gmailConnectionStore,
    createGmailConnection,
    transport,
  );
  async function gmailConnect(req: NextRequest) {
    try {
      requireGmailEnabled();
      const owner = await candidateUser(req, true);
      await candidateRate(`gmail-connect:${owner}`, 5);
      const config = gmailConfig();
      if (new URL(config.redirectUri).origin !== req.nextUrl.origin)
        throw new GmailError("GMAIL_CONFIG");
      const state = randomBytes(32).toString("base64url");
      const browser = randomBytes(32).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      await prisma.$executeRaw`
      INSERT INTO listing_email_oauth_states ("userId", "stateHash", "browserHash", "expiresAt")
      VALUES (${owner}::uuid, ${hash(state)}, ${hash(browser)}, now() + interval '10 minutes')
      ON CONFLICT ("userId") DO UPDATE SET "stateHash" = EXCLUDED."stateHash", "browserHash" = EXCLUDED."browserHash", "expiresAt" = EXCLUDED."expiresAt"`;
      const authorization = new URL(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      authorization.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: GMAIL_READONLY_SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        nonce: browser,
        access_type: "offline",
        prompt: "consent",
      }).toString();
      const response = candidateJson({
        authorizationUrl: authorization.toString(),
      });
      response.cookies.set(
        cookieName,
        seal(
          { state, browser, verifier, expiresAt: Date.now() + 600000 },
          owner,
          "oauth-pending",
        ),
        { ...cookieOptions, maxAge: 600 },
      );
      return response;
    } catch (e) {
      return failure(e);
    }
  }
  async function gmailCallback(req: NextRequest) {
    let response;
    try {
      requireGmailEnabled();
      const owner = await candidateUser(req);
      const config = gmailConfig();
      if (new URL(config.redirectUri).origin !== req.nextUrl.origin)
        throw new GmailError("GMAIL_CONFIG");
      const state = req.nextUrl.searchParams.get("state");
      const cookie = req.cookies.get(cookieName)?.value;
      if (!cookie || cookie.length > 2048) throw new GmailError("OAUTH_STATE");
      let pending;
      try {
        pending = z
          .object({
            state: z.string().regex(/^[\w-]{43}$/),
            browser: z.string().regex(/^[\w-]{43}$/),
            verifier: z.string().regex(/^[\w-]{43}$/),
            expiresAt: z.number(),
          })
          .strict()
          .parse(unseal(cookie, owner, "oauth-pending"));
      } catch {
        throw new GmailError("OAUTH_STATE");
      }
      if (
        req.nextUrl.searchParams.getAll("state").length !== 1 ||
        state !== pending.state ||
        pending.expiresAt <= Date.now()
      )
        throw new GmailError("OAUTH_STATE");
      const browser = pending.browser;
      const count =
        await prisma.$executeRaw`DELETE FROM listing_email_oauth_states WHERE "userId" = ${owner}::uuid AND "stateHash" = ${hash(state)} AND "browserHash" = ${hash(browser)} AND "expiresAt" > now()`;
      if (count !== 1) throw new GmailError("OAUTH_STATE");
      const code = req.nextUrl.searchParams.get("code");
      if (
        req.nextUrl.searchParams.has("error") ||
        req.nextUrl.searchParams.getAll("code").length !== 1 ||
        !code ||
        code.length > 4096 ||
        /[\u0000-\u0020\u007f]/.test(code)
      )
        throw new GmailError("OAUTH_CODE");
      const connectionId = await account.exchange(
        owner,
        code,
        pending.verifier,
      );
      // Drop the inbound code query immediately; only an opaque connection id remains.
      const destination = new URL("/relocation/arbitrage", config.redirectUri);
      destination.searchParams.set("emailConnection", connectionId);
      response = NextResponse.redirect(destination, 303);
      response.headers.set("Cache-Control", "no-store, max-age=0");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
    } catch (e) {
      response = failure(e);
    }
    response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  async function gmailRead(req: NextRequest) {
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
      const result = await new GmailListingEmailReader(
        gmailConnectionStore,
        transport,
      ).read(owner, window.data);
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
  async function gmailDisconnect(req: NextRequest) {
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
      await new GmailListingEmailReader(
        gmailConnectionStore,
        transport,
      ).disconnect(owner, input.data.connectionId);
      return candidateJson({ disconnected: true });
    } catch (e) {
      return failure(e);
    }
  }

  async function gmailLabels(req: NextRequest) {
    try {
      requireGmailEnabled();
      const owner = await candidateUser(req);
      await candidateRate(`gmail-labels:${owner}`, 10);
      const id = z
        .uuid()
        .safeParse(req.nextUrl.searchParams.get("connectionId"));
      if (
        !id.success ||
        req.nextUrl.searchParams.getAll("connectionId").length !== 1
      )
        throw new GmailError("INVALID_INPUT");
      return candidateJson(await account.listLabels(owner, id.data));
    } catch (error) {
      return failure(error);
    }
  }
  async function gmailSelectLabel(req: NextRequest) {
    try {
      requireGmailEnabled();
      const owner = await candidateUser(req, true);
      await candidateRate(`gmail-label-select:${owner}`, 10);
      const input = z
        .object({
          connectionId: z.uuid(),
          labelId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
        })
        .strict()
        .safeParse(await candidateBody(req));
      if (!input.success) throw new GmailError("INVALID_INPUT");
      return candidateJson(
        await account.selectLabel(
          owner,
          input.data.connectionId,
          input.data.labelId,
        ),
      );
    } catch (error) {
      return failure(error);
    }
  }
  return {
    gmailConnect,
    gmailCallback,
    gmailRead,
    gmailDisconnect,
    gmailLabels,
    gmailSelectLabel,
  };
}
// Lazy global fetch is injected only at the production composition boundary.
export const {
  gmailConnect,
  gmailCallback,
  gmailRead,
  gmailDisconnect,
  gmailLabels,
  gmailSelectLabel,
} = createGmailHandlers((input, init) => fetch(input, init));

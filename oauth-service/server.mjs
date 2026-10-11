import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createOAuthProvider, validateOAuthConfig } from "./provider.mjs";
import { hashOAuthId, openOAuthValue, sealOAuthValue } from "./adapter.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UID = /^[A-Za-z0-9_-]{12,128}$/;
const CSRF_COOKIE = "__Host-cloud-palette-csrf";
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

function appendCookie(res, cookie) {
  const old = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(old) ? old : old ? [old] : []),
    cookie,
  ]);
}

function cookieMap(req) {
  return new Map(
    parseCookieHeader(req.headers.cookie || "").map(({ name, value }) => [
      name,
      value || "",
    ]),
  );
}

function supabaseClient(req, res, env) {
  const cookies = cookieMap(req);
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false },
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (items) => {
          for (const { name, value, options } of items) {
            cookies.set(name, value);
            appendCookie(
              res,
              serializeCookieHeader(name, value, {
                ...options,
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
              }),
            );
          }
        },
      },
    },
  );
}

async function verifiedUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (
      error.name === "AuthSessionMissingError" ||
      (Number(error.status) >= 400 &&
        Number(error.status) < 500 &&
        Number(error.status) !== 429)
    )
      return null;
    throw new Error("Supabase authentication unavailable");
  }
  return data.user?.id && UUID.test(data.user.id) ? data.user : null;
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, {
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  res.end();
}

async function form(req) {
  let value = "";
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 8192) throw new Error("Form too large");
  }
  return new URLSearchParams(value);
}

function csrf(req, res, submitted, issuer) {
  if (req.headers.origin !== issuer) return false;
  const saved = cookieMap(req).get(CSRF_COOKIE) || "";
  if (!submitted || !saved || submitted.length !== saved.length) return false;
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(saved));
}

function newCsrf(res) {
  const value = randomBytes(32).toString("base64url");
  appendCookie(
    res,
    serializeCookieHeader(CSRF_COOKIE, value, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    }),
  );
  return value;
}

function consentRequestIsExact(details, config) {
  const requested = new Set(
    String(details.params.scope || "")
      .split(" ")
      .filter(Boolean),
  );
  const resource = details.params.resource;
  return (
    details.params.client_id === config.clientId &&
    resource === config.resource &&
    requested.has("profiles:read") &&
    [...requested].every(
      (s) => s === "profiles:read" || s === "offline_access" || s === "openid",
    )
  );
}

export function createOAuthHttpServer(config, prisma, env) {
  const provider = createOAuthProvider(config, prisma);
  provider.proxy = true;
  const callback = provider.callback();
  return createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(config.issuer).host) {
        send(res, 421, "Wrong host");
        return;
      }
      // Koa's proxy mode reads forwarded headers. Never trust caller-supplied
      // forwarded host or scheme, even when the load balancer supplies them.
      req.headers["x-forwarded-host"] = new URL(config.issuer).host;
      req.headers["x-forwarded-proto"] = "https";
      const url = new URL(req.url, config.issuer);
      const path = url.pathname;
      if (req.method === "GET" && path === "/healthz") {
        send(res, 200, "ok");
        return;
      }
      if (req.method === "GET" && path === "/login") {
        const uid = url.searchParams.get("uid") || "";
        if (!UID.test(uid)) {
          send(res, 400, "Invalid interaction");
          return;
        }
        const details = await provider.interactionDetails(req, res);
        if (details.uid !== uid) {
          send(res, 400, "Invalid interaction");
          return;
        }
        const supabase = supabaseClient(req, res, env);
        const user = await verifiedUser(supabase);
        if (user) {
          redirect(res, `/interaction/${uid}`);
          return;
        }
        const redirectTo = `${config.issuer}/supabase/callback?uid=${encodeURIComponent(uid)}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) throw new Error("Supabase sign-in unavailable");
        redirect(res, data.url);
        return;
      }
      if (req.method === "GET" && path === "/supabase/callback") {
        const uid = url.searchParams.get("uid") || "";
        const code = url.searchParams.get("code") || "";
        if (!UID.test(uid) || !code || code.length > 2048) {
          send(res, 400, "Invalid callback");
          return;
        }
        const supabase = supabaseClient(req, res, env);
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !(await verifiedUser(supabase))) {
          send(res, 401, "Sign-in failed");
          return;
        }
        redirect(res, `/interaction/${uid}`);
        return;
      }
      const match = path.match(/^\/interaction\/([A-Za-z0-9_-]{12,128})$/);
      if (match && (req.method === "GET" || req.method === "POST")) {
        const uid = match[1];
        const details = await provider.interactionDetails(req, res);
        if (details.uid !== uid) {
          send(res, 400, "Invalid interaction");
          return;
        }
        const supabase = supabaseClient(req, res, env);
        const user = await verifiedUser(supabase);
        if (!user) {
          redirect(res, `/login?uid=${encodeURIComponent(uid)}`);
          return;
        }
        if (details.prompt.name === "login") {
          if (req.method !== "GET") {
            send(res, 405, "Method not allowed");
            return;
          }
          await provider.interactionFinished(req, res, {
            login: { accountId: user.id, remember: false },
          });
          return;
        }
        if (
          details.prompt.name !== "consent" ||
          details.session?.accountId !== user.id ||
          !consentRequestIsExact(details, config)
        ) {
          send(res, 403, "Invalid consent request");
          return;
        }
        if (req.method === "GET") {
          const token = newCsrf(res);
          send(
            res,
            200,
            `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Cloud Palette 接続</title><body><h1>ChatGPT との接続</h1><p>Cloud Palette の保存済みプロフィールを読み取り、日ごとの判定を表示します。変更・削除はできません。</p><p>接続時には Cloud Palette のアカウント識別子も ChatGPT に渡る場合があります。接続はいつでも解除できます。</p><form method="post"><input type="hidden" name="csrf" value="${escapeHtml(token)}"><button name="decision" value="approve">読み取りを許可</button><button name="decision" value="deny">許可しない</button></form></body></html>`,
            "text/html; charset=utf-8",
          );
          return;
        }
        const data = await form(req);
        if (!csrf(req, res, data.get("csrf"), config.issuer)) {
          send(res, 403, "Invalid request");
          return;
        }
        if (data.get("decision") === "deny") {
          await provider.interactionFinished(req, res, {
            error: "access_denied",
            error_description: "Access denied",
          });
          return;
        }
        if (data.get("decision") !== "approve") {
          send(res, 400, "Invalid decision");
          return;
        }
        const grant = new provider.Grant({
          accountId: user.id,
          clientId: config.clientId,
        });
        grant.addResourceScope(config.resource, "profiles:read");
        grant.addOIDCScope("profiles:read");
        if (String(details.params.scope).split(" ").includes("openid"))
          grant.addOIDCScope("openid");
        if (String(details.params.scope).split(" ").includes("offline_access"))
          grant.addOIDCScope("offline_access");
        await grant.save();
        const grantIdHash = hashOAuthId(grant.jti);
        await prisma.mcpOauthConnection.create({
          data: {
            grantIdHash,
            encryptedGrantId: sealOAuthValue(
              config.storageKeys,
              `connection:${user.id}:${grantIdHash}`,
              { grantId: grant.jti },
            ),
            userId: user.id,
            clientId: config.clientId,
            expiresAt: new Date(grant.exp * 1000),
          },
        });
        await provider.interactionFinished(req, res, {
          consent: { grantId: grant.jti },
        });
        return;
      }
      if (path === "/connections" && req.method === "GET") {
        const user = await verifiedUser(supabaseClient(req, res, env));
        if (!user) {
          send(res, 401, "Sign-in required");
          return;
        }
        const connections = await prisma.mcpOauthConnection.findMany({
          where: {
            userId: user.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { grantIdHash: true, createdAt: true },
        });
        const token = newCsrf(res);
        send(
          res,
          200,
          `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Cloud Palette 接続管理</title><body><h1>ChatGPT 接続管理</h1>${connections.map(({ grantIdHash, createdAt }) => `<p>接続日時: ${escapeHtml(createdAt.toISOString())}</p><form method="post" action="/connections/revoke"><input type="hidden" name="csrf" value="${escapeHtml(token)}"><input type="hidden" name="grant_id_hash" value="${escapeHtml(grantIdHash)}"><button>接続を解除</button></form>`).join("") || "<p>接続はありません。</p>"}</body></html>`,
          "text/html; charset=utf-8",
        );
        return;
      }
      if (path === "/connections/revoke" && req.method === "POST") {
        const user = await verifiedUser(supabaseClient(req, res, env));
        if (!user) {
          send(res, 401, "Sign-in required");
          return;
        }
        const data = await form(req);
        if (!csrf(req, res, data.get("csrf"), config.issuer)) {
          send(res, 403, "Invalid request");
          return;
        }
        const grantIdHash = data.get("grant_id_hash") || "";
        if (!/^[0-9a-f]{64}$/.test(grantIdHash)) {
          send(res, 400, "Invalid connection");
          return;
        }
        const owned = await prisma.mcpOauthConnection.findFirst({
          where: {
            grantIdHash,
            userId: user.id,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (!owned) {
          send(res, 404, "Connection not found");
          return;
        }
        const grantId = openOAuthValue(
          config.storageKeys,
          `connection:${user.id}:${grantIdHash}`,
          owned.encryptedGrantId,
        ).grantId;
        if (typeof grantId !== "string" || hashOAuthId(grantId) !== grantIdHash)
          throw new Error("Invalid connection secret");
        const grant = await provider.Grant.find(grantId);
        if (grant) await grant.destroy();
        await prisma.mcpOauthConnection.update({
          where: { grantIdHash },
          data: { revokedAt: new Date() },
        });
        redirect(res, "/connections");
        return;
      }
      await callback(req, res);
    } catch {
      if (!res.headersSent) send(res, 503, "Authorization service unavailable");
      else res.end();
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const config = validateOAuthConfig(process.env);
  if (
    !process.env.DATABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    throw new Error(
      "DATABASE_URL and Supabase public configuration are required",
    );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const server = createOAuthHttpServer(config, prisma, process.env);
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0");
}

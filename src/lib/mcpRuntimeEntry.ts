import type { IncomingMessage, ServerResponse } from "node:http";
import type { McpRuntime } from "@/lib/mcpRuntime";
import {
  isPersonalMcpEnabled,
  parseMcpRuntimeConfig,
} from "@/lib/mcpRuntimeConfig";
import { personalMcpUnavailableResponse } from "@/lib/mcpDiscovery";

let pending: Promise<McpRuntime> | undefined;
async function runtime() {
  if (!isPersonalMcpEnabled()) throw new Error("MCP_DISABLED");
  if (!pending) {
    pending = (async () => {
      const config = parseMcpRuntimeConfig(process.env.MCP_RUNTIME_CONFIG);
      const { createMcpRuntime } = await import("@/lib/mcpRuntime");
      return createMcpRuntime(config);
    })().catch(() => {
      pending = undefined;
      throw new Error("MCP_RUNTIME_UNAVAILABLE");
    });
  }
  return pending;
}
function canonical(headers: Headers) {
  return (
    headers.get("host") === "cloud-palette.com" &&
    (!headers.has("x-forwarded-host") ||
      headers.get("x-forwarded-host") === "cloud-palette.com") &&
    (!headers.has("x-forwarded-proto") ||
      headers.get("x-forwarded-proto") === "https")
  );
}
const unavailable = () =>
  Response.json(
    { error: "TEMPORARILY_UNAVAILABLE" },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );

export async function personalMcpEntry(request: Request) {
  if (!isPersonalMcpEnabled()) return personalMcpUnavailableResponse();
  if (!canonical(request.headers))
    return new Response(null, {
      status: 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  let abort!: () => void;
  const deadline = new Promise<Response>((resolve) => {
    abort = () => resolve(unavailable());
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const app = await runtime();
        if (signal.aborted) return unavailable();
        return app.personal(new Request(request, { signal }));
      })(),
    ]);
  } catch {
    return unavailable();
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export async function personalMcpMetadataEntry(request: Request) {
  if (!isPersonalMcpEnabled()) return personalMcpUnavailableResponse();
  if (!canonical(request.headers))
    return new Response(null, {
      status: 400,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    return (await runtime()).discovery.resourceMetadataResponse();
  } catch {
    return unavailable();
  }
}

/** Native Node request: oidc-provider is never forced through a Web Request
 * conversion. Pages API disables Next's body parser and keeps provider cookies. */
export async function mcpNodeEntry(
  req: IncomingMessage,
  res: ServerResponse,
  kind: "oauth" | "connections" | "workspace",
  oauthPath?: string[],
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!isPersonalMcpEnabled()) {
    res.writeHead(404).end();
    return;
  }
  const headers = new Headers();
  for (const name of ["host", "x-forwarded-host", "x-forwarded-proto"]) {
    const value = req.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }
  if (!canonical(headers)) {
    res.writeHead(400).end();
    return;
  }
  const path =
    kind === "oauth"
      ? `/oauth/${(oauthPath ?? []).join("/")}`
      : kind === "workspace"
        ? "/api/mcp/workspace"
        : "/api/mcp/connections";
  if (
    kind === "oauth" &&
    !/^\/oauth\/(?:auth(?:\/[A-Za-z0-9_-]{16,128})?|interaction\/[A-Za-z0-9_-]{16,128}|token(?:\/revocation)?|jwks|\.well-known\/openid-configuration)$/.test(
      path,
    )
  ) {
    res.writeHead(404).end();
    return;
  }
  if (req.headers["content-encoding"]) {
    res.writeHead(415).end();
    return;
  }
  const declared = req.headers["content-length"];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32768)) {
    res.writeHead(413).end();
    return;
  }
  const started = performance.now();
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
    if (!res.headersSent) res.writeHead(503);
    if (!res.writableEnded) res.end();
  };
  let bytes = 0;
  const count = (chunk: Buffer | string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 32768) {
      controller.abort();
      if (!res.headersSent) res.writeHead(413);
      if (!res.writableEnded) res.end();
    }
  };
  const timer = setTimeout(abort, 5000);
  const disconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once("aborted", disconnected);
  res.once("close", disconnected);
  try {
    const app = await runtime();
    if (controller.signal.aborted) return;
    const query = new URL(req.url ?? "/", "https://cloud-palette.com").search;
    req.url = path + query;
    await app.scope.run(
      {
        signal: controller.signal,
        remainingMs: () => 5000 - (performance.now() - started),
      },
      async () => {
        req.on("data", count);
        if (kind === "workspace") return app.workspace(req, res);
        if (kind === "connections") return app.connections(req, res);
        if (path.startsWith("/oauth/interaction/"))
          return app.interaction(req, res);
        Object.assign(req, { originalUrl: req.url });
        req.url = req.url!.slice("/oauth".length);
        await app.provider.callback()(req, res);
      },
    );
  } catch {
    abort();
  } finally {
    clearTimeout(timer);
    req.off("data", count);
    req.off("aborted", disconnected);
    res.off("close", disconnected);
  }
}

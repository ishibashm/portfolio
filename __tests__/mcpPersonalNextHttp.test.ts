// @vitest-environment node
import { request as nodeRequest } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real Next routing/middleware, isolated from the site's pages, .env and DB.
// Copy release-gate sources unchanged; only site auth is a deterministic double.
// Node 22 fetch ignores a caller-supplied Host. Use native HTTP to emulate
// the canonical proxy while connecting exclusively to the loopback listener.
async function localHttp(url: string, init: RequestInit = {}) {
  return new Promise<Response>((resolve, reject) => {
    const headers = Object.fromEntries(new Headers(init.headers));
    const req = nodeRequest(
      url,
      { method: init.method, headers, signal: init.signal ?? undefined },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(res.headers))
            if (value !== undefined)
              responseHeaders.set(
                name,
                Array.isArray(value) ? value.join(", ") : value,
              );
          resolve(
            new Response(
              init.method === "HEAD" ? null : Buffer.concat(chunks),
              { status: res.statusCode, headers: responseHeaders },
            ),
          );
        });
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}
describe.each([false, true])(
  "Next wiring (test release readiness, flag=%s)",
  (enabled) => {
    let directory: string;
    let child: ChildProcess | undefined;
    let base: string;
    let logs = "";
    const secretMarker = "TEST_ONLY_PERSONAL_HTTP_PRIVATE_MARKER";

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), "mcp-next-gate-"));
      const root = process.cwd();
      for (const path of [
        "src/middleware.ts",
        "src/lib/apiGuard.ts",
        "src/lib/requestSecurity.ts",
        "src/app/api/mcp/personal/route.ts",
        "src/lib/mcpDiscovery.ts",
        "src/lib/mcpRuntimeEntry.ts",
        "src/lib/mcpRuntimeConfig.ts",
        "src/lib/mcpAuthorizationConfig.ts",
        "next.config.ts",
        "src/pages/api/mcp-authorization/[...oauthPath].ts",
        "src/pages/api/mcp/connections.ts",
      ]) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await copyFile(join(root, path), join(directory, path));
      }
      // Override only readiness/config/runtime in this isolated fixture. The actual
      // provider+SDK flow is exercised in mcpRuntime.test.ts; routes stay unchanged.
      await writeFile(
        join(directory, "src/lib/mcpRuntimeConfig.ts"),
        `
    export const isPersonalMcpEnabled = () => process.env.MCP_PERSONAL_ENABLED === "true";
    export const parseMcpRuntimeConfig = () => ({});
  `,
      );
      await writeFile(
        join(directory, "src/lib/mcpRuntime.ts"),
        `
    export async function createMcpRuntime() {
      if (process.env.MCP_PERSONAL_ENABLED !== "true") throw new Error("closed runtime loaded");
      return {
        personal: async () => new Response(null, {status: 401, headers: {"Cache-Control": "private, no-store"}}),
        scope: {run: async (_budget, work) => work()},
        provider: { callback: () => async (req, res) => { res.end(JSON.stringify({path: req.url})); } },
        connections: async (_req, res) => { res.writeHead(401).end(); }
      };
    }
  `,
      );
      await symlink(
        join(root, "node_modules"),
        join(directory, "node_modules"),
        "dir",
      );
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ private: true }),
      );
      await writeFile(
        join(directory, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
        }),
      );
      await mkdir(join(directory, "src/utils/supabase"), { recursive: true });
      await writeFile(
        join(directory, "src/utils/supabase/middleware.ts"),
        `
    import { NextResponse } from "next/server";
    export async function updateSession() {
      return NextResponse.json({ siteSessionReached: true }, { status: 418 });
    }
  `,
      );
      await mkdir(join(directory, "src/app/api/session-probe"), {
        recursive: true,
      });
      await writeFile(
        join(directory, "src/app/api/session-probe/route.ts"),
        "export function GET() { return Response.json({ bypassed: true }); }",
      );
      const listener = createServer();
      listener.listen(0, "127.0.0.1");
      await once(listener, "listening");
      const address = listener.address();
      if (!address || typeof address === "string")
        throw new Error("PORT_UNAVAILABLE");
      const port = address.port;
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
      base = `http://127.0.0.1:${port}`;
      child = spawn(
        process.execPath,
        [
          join(root, "node_modules/next/dist/bin/next"),
          "dev",
          directory,
          "--webpack",
          "--hostname",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        {
          cwd: directory,
          // Never inherit credentials, DB URLs, NODE_OPTIONS or service env files.
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "development",
            MCP_PERSONAL_ENABLED: String(enabled),
            NEXT_TELEMETRY_DISABLED: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("NEXT_START_TIMEOUT")),
          45000,
        );
        const collect = (data: Buffer) => {
          logs += data.toString();
          if (logs.includes("Ready in")) {
            clearTimeout(timer);
            resolve();
          }
        };
        child!.stdout!.on("data", collect);
        child!.stderr!.on("data", collect);
        child!.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child!.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("NEXT_EXITED"));
        });
      });
    }, 60000);

    afterAll(async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
        await exited;
        clearTimeout(timer);
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    it("real Next HTTP preserves the gate and native OAuth rewrites without invoking site auth", async () => {
      for (const method of [
        "POST",
        "GET",
        "HEAD",
        "OPTIONS",
        "DELETE",
        "PUT",
        "PATCH",
      ]) {
        const response = await localHttp(`${base}/api/mcp/personal`, {
          method,
          redirect: "manual",
          headers: {
            host: "cloud-palette.com",
            "x-forwarded-host": "cloud-palette.com",
            "x-forwarded-proto": "https",
            cookie: `sb-test-auth-token=${secretMarker}; dev_bypass_user=admin`,
            authorization: `Bearer ${secretMarker}`,
            origin: "https://untrusted.invalid",
            "content-type": "application/json",
          },
          ...(method === "POST"
            ? { body: JSON.stringify({ privateInput: secretMarker }) }
            : {}),
          signal: AbortSignal.timeout(30000),
        });
        expect(response.status, method).toBe(enabled ? 401 : 404);
        expect(await response.text(), method).toBe("");
        expect(response.headers.get("cache-control"), method).toBe(
          "private, no-store",
        );
        for (const header of [
          "set-cookie",
          "location",
          "www-authenticate",
          "access-control-allow-origin",
        ])
          expect(response.headers.has(header), `${method}: ${header}`).toBe(
            false,
          );
      }
      for (const path of [
        "/oauth/token",
        "/oauth/.well-known/openid-configuration",
        "/.well-known/oauth-authorization-server/oauth",
        "/api/mcp/connections",
      ]) {
        const result = await localHttp(base + path, {
          headers: {
            host: "cloud-palette.com",
            "x-forwarded-host": "cloud-palette.com",
            "x-forwarded-proto": "https",
          },
        });
        expect(result.status, path).toBe(
          enabled ? (path.endsWith("connections") ? 401 : 200) : 404,
        );
        expect(result.headers.get("cache-control")).toBe("private, no-store");
        if (enabled && !path.endsWith("connections"))
          expect(await result.json()).toEqual({
            path: path.endsWith("token")
              ? "/token"
              : "/.well-known/openid-configuration",
          });
      }
      const sibling = await localHttp(`${base}/api/session-probe`);
      expect(sibling.status).toBe(418);
      expect(await sibling.json()).toEqual({ siteSessionReached: true });
      expect(logs).not.toContain(secretMarker);
    }, 60000);
  },
);

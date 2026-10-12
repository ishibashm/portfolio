// @vitest-environment node
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
import { afterAll, beforeAll, expect, it } from "vitest";

// Real Next routing/middleware, isolated from the site's pages, .env and DB.
// Copy release-gate sources unchanged; only site auth is a deterministic double.
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
    "src/app/api/mcp/personal/route.ts",
    "src/lib/mcpDiscovery.ts",
    "src/lib/mcpAuthorizationConfig.ts",
    "next.config.ts",
  ]) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await copyFile(join(root, path), join(directory, path));
  }
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

it("real Next HTTP keeps the personal gate closed without invoking site auth", async () => {
  for (const method of [
    "POST",
    "GET",
    "HEAD",
    "OPTIONS",
    "DELETE",
    "PUT",
    "PATCH",
  ]) {
    const response = await fetch(`${base}/api/mcp/personal`, {
      method,
      redirect: "manual",
      headers: {
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
    expect(response.status, method).toBe(404);
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
      expect(response.headers.has(header), `${method}: ${header}`).toBe(false);
  }
  const sibling = await fetch(`${base}/api/session-probe`);
  expect(sibling.status).toBe(418);
  expect(await sibling.json()).toEqual({ siteSessionReached: true });
  expect(logs).not.toContain(secretMarker);
}, 60000);

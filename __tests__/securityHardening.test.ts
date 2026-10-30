// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { readBoundedJson, requestLimiter } from "@/lib/requestSecurity";

const admin = vi.hoisted(() =>
  vi.fn(async (): Promise<Response | null> => null),
);
vi.mock("@/lib/adminApi", () => ({ denyUnlessAdmin: admin }));
import { GET as media } from "@/app/api/local-media/route";
import { getGeomagneticData } from "@/utils/geomagnetism";

let directory: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  admin.mockResolvedValue(null);
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("bounded public requests", () => {
  it("rejects oversized streamed JSON without trusting content-length", async () => {
    const request = new Request("https://example.invalid", {
      method: "POST",
      headers: { "content-length": "1" },
      body: JSON.stringify("a".repeat(40)),
    });
    const result = await readBoundedJson(request, 20);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
  it("rejects malformed JSON and accepts valid JSON", async () => {
    const request = (body: string) =>
      new Request("https://example.invalid", { method: "POST", body });
    const bad = await readBoundedJson(request("{"), 100);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(400);
    expect(await readBoundedJson(request('{"ok":true}'), 100)).toEqual({
      ok: true,
      value: { ok: true },
    });
  });
  it("limits both individual callers and rotating identities", () => {
    const limit = requestLimiter(1, 60);
    expect(limit(new Headers({ "x-real-ip": "caller" }))).toBeNull();
    expect(limit(new Headers({ "x-real-ip": "caller" }))?.status).toBe(429);
    let denied = false;
    for (let i = 0; i < 30; i++)
      denied ||= limit(new Headers({ "x-real-ip": String(i) }))?.status === 429;
    expect(denied).toBe(true);
  });
  it("rejects invalid calculation arguments", async () => {
    expect(await getGeomagneticData(NaN, 0)).toBeNull();
    expect(await getGeomagneticData(0, 181)).toBeNull();
    expect(await getGeomagneticData(0, 0, Infinity)).toBeNull();
  });
});

describe("local media boundary", () => {
  const request = (name: string) =>
    new Request(
      `https://example.invalid/api/local-media?path=${encodeURIComponent(name)}`,
    );
  it("checks authorization before reading files", async () => {
    admin.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await media(request("x_downloads/photo.png"))).status).toBe(401);
  });
  it("rejects sibling prefixes, traversal, symlinks and non-media; streams allowed files privately", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "pf-media-security-"));
    await mkdir(path.join(directory, "x_downloads"));
    await mkdir(path.join(directory, "x_downloads-private"));
    await writeFile(
      path.join(directory, "x_downloads-private/photo.png"),
      "outside fixture",
    );
    await writeFile(
      path.join(directory, "x_downloads/photo.png"),
      "image fixture",
    );
    await writeFile(
      path.join(directory, "x_downloads/private.txt"),
      "text fixture",
    );
    await symlink(
      path.join(directory, "x_downloads-private/photo.png"),
      path.join(directory, "x_downloads/link.png"),
    );
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    for (const name of [
      "x_downloads-private/photo.png",
      "x_downloads/../x_downloads-private/photo.png",
      "x_downloads/link.png",
    ]) {
      expect((await media(request(name))).status).toBe(403);
    }
    expect((await media(request("x_downloads/private.txt"))).status).toBe(415);
    const response = await media(request("x_downloads/photo.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("image fixture");
  });
});

it("RLS inventory covers every Prisma model including mapped names", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const sql = readFileSync("prisma/sql/20261031_security_rls.sql", "utf8");
  for (const match of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    const name = match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1];
    expect(sql).toContain(`'${name}'`);
  }
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  expect(sql).toContain("TO service_role USING (true) WITH CHECK (true)");
});

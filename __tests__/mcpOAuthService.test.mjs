// @vitest-environment node
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import { hashOAuthId, sealOAuthValue } from "../oauth-service/adapter.mjs";
const mock = vi.hoisted(() => ({
  user: { id: "11111111-2222-4333-8444-555555555555" },
  details: null,
  finished: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  grantDestroy: vi.fn(),
}));
vi.mock("@supabase/ssr", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    createServerClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: mock.user }, error: null }),
      },
    }),
  };
});
vi.mock("../oauth-service/provider.mjs", () => ({
  createOAuthProvider: () => ({
    proxy: false,
    callback: () => (_req, res) => {
      res.statusCode = 404;
      res.end();
    },
    interactionDetails: async () => mock.details,
    interactionFinished: async (_req, res, result) => {
      mock.finished(result);
      res.writeHead(303, { Location: "/done" });
      res.end();
    },
    Grant: class {
      constructor() {
        this.jti = "fixture-grant-id";
        this.exp = Math.floor(Date.now() / 1000) + 3600;
      }
      addResourceScope() {}
      addOIDCScope() {}
      async save() {}
      static async find() {
        return { destroy: mock.grantDestroy };
      }
    },
  }),
}));
import { createOAuthHttpServer } from "../oauth-service/server.mjs";
const UID = "A".repeat(43);
const USER = "11111111-2222-4333-8444-555555555555";
const config = {
  issuer: "https://auth.example.test",
  clientId: "chatgpt-cloud-palette",
  resource: "https://cloud-palette.com/api/mcp/profile",
  storageKeys: [randomBytes(32)],
};
const GRANT_HASH = hashOAuthId("fixture-grant-id");
const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
};
const prisma = {
  mcpOauthConnection: {
    create: mock.create,
    findFirst: mock.findFirst,
    update: mock.update,
    findMany: mock.findMany,
  },
};
let server, base;
function headers(extra = {}) {
  return { Host: "auth.example.test", ...extra };
}
async function req(path, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      base + path,
      { method: options.method || "GET", headers: headers(options.headers) },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const h = new Headers();
          for (const [name, values] of Object.entries(response.headers))
            for (const value of Array.isArray(values) ? values : [values])
              if (value) h.append(name, value);
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers: h,
            }),
          );
        });
      },
    );
    request.on("error", reject);
    request.end(options.body?.toString());
  });
}

describe("Cloud Palette consent and revocation HTTP surface", () => {
  beforeAll(async () => {
    server = createOAuthHttpServer(config, prisma, env);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mock.user = { id: USER };
    mock.details = {
      uid: UID,
      prompt: { name: "consent" },
      session: { accountId: USER },
      params: {
        client_id: config.clientId,
        resource: config.resource,
        scope: "openid profiles:read",
      },
    };
    mock.create.mockResolvedValue({});
    mock.findFirst.mockResolvedValue({
      grantIdHash: GRANT_HASH,
      encryptedGrantId: sealOAuthValue(
        config.storageKeys,
        `connection:${USER}:${GRANT_HASH}`,
        { grantId: "fixture-grant-id" },
      ),
    });
    mock.update.mockResolvedValue({});
    mock.findMany.mockResolvedValue([]);
    mock.grantDestroy.mockResolvedValue(undefined);
  });
  it("rejects wrong host and invalid consent scope", async () => {
    expect(
      (await req("/healthz", { headers: { Host: "evil.example" } })).status,
    ).toBe(421);
    mock.details.params.scope = "profiles:read write:profiles";
    expect((await req(`/interaction/${UID}`)).status).toBe(403);
  });
  it("renders explicit read-only consent and requires same-origin CSRF on approval", async () => {
    const page = await req(`/interaction/${UID}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("保存済みプロフィール");
    expect(html).toContain("読み取り");
    const token = html.match(/name="csrf" value="([^"]+)"/)[1];
    const cookie = page.headers
      .getSetCookie()
      .find((v) => v.startsWith("__Host-cloud-palette-csrf="))
      .split(";")[0];
    const body = new URLSearchParams({ csrf: token, decision: "approve" });
    expect(
      (
        await req(`/interaction/${UID}`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req(`/interaction/${UID}`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: "https://evil.example",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        })
      ).status,
    ).toBe(403);
    expect(mock.create).not.toHaveBeenCalled();
    const result = await req(`/interaction/${UID}`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: config.issuer,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    expect(result.status).toBe(303);
    expect(mock.create).toHaveBeenCalledWith({
      data: {
        grantIdHash: GRANT_HASH,
        encryptedGrantId: expect.objectContaining({
          v: 1,
          ct: expect.any(String),
        }),
        userId: USER,
        clientId: config.clientId,
        expiresAt: expect.any(Date),
      },
    });
    expect(mock.finished).toHaveBeenCalledWith({
      consent: { grantId: "fixture-grant-id" },
    });
    expect(JSON.stringify(mock.create.mock.calls[0])).not.toContain(
      "fixture-grant-id",
    );
  });
  it("refuses to consent for a different Supabase principal", async () => {
    mock.user = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
    expect((await req(`/interaction/${UID}`)).status).toBe(403);
    expect(mock.finished).not.toHaveBeenCalled();
  });
  it("revokes only a connection owned by the verified principal", async () => {
    mock.findMany.mockResolvedValue([
      { grantIdHash: GRANT_HASH, createdAt: new Date() },
    ]);
    const page = await req("/connections");
    const html = await page.text();
    expect(html).toContain(GRANT_HASH);
    expect(html).not.toContain("fixture-grant-id");
    const cookie = page.headers
      .getSetCookie()
      .find((v) => v.startsWith("__Host-cloud-palette-csrf="))
      .split(";")[0];
    const csrf = cookie.split("=")[1];
    mock.findFirst.mockResolvedValueOnce(null);
    const body = new URLSearchParams({ csrf, grant_id_hash: GRANT_HASH });
    const options = {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: config.issuer,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    };
    expect((await req("/connections/revoke", options)).status).toBe(404);
    expect(mock.grantDestroy).not.toHaveBeenCalled();
    expect((await req("/connections/revoke", options)).status).toBe(303);
    expect(mock.findFirst).toHaveBeenCalledWith({
      where: {
        grantIdHash: GRANT_HASH,
        userId: USER,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(mock.grantDestroy).toHaveBeenCalledOnce();
    expect(mock.update).toHaveBeenCalledWith({
      where: { grantIdHash: GRANT_HASH },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

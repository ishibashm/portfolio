// @vitest-environment node
import { createServer } from "node:http";
import { generateKeyPairSync, createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createOAuthProvider } from "../oauth-service/provider.mjs";
import { openOAuthValue } from "../oauth-service/adapter.mjs";

const USER = "11111111-2222-4333-8444-555555555555";
const RESOURCE = "https://cloud-palette.com/api/mcp/profile";
const CLIENT = "chatgpt-cloud-palette";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
let base, server, config, provider;
const rows = new Map();
const key = (model, idHash) => `${model}:${idHash}`;
const equals = (row, where) =>
  Object.entries(where).every(([k, v]) => row[k] === v);
const prisma = {
  mcpOauthRecord: {
    async upsert({ where, create, update }) {
      const id = key(where.model_idHash.model, where.model_idHash.idHash);
      rows.set(id, {
        ...(rows.get(id) || {}),
        ...(rows.has(id) ? update : create),
      });
    },
    async findFirst({ where }) {
      return [...rows.values()].find((row) => equals(row, where)) || null;
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const [id, row] of rows)
        if (equals(row, where)) {
          rows.set(id, { ...row, ...data });
          count++;
        }
      return { count };
    },
    async deleteMany({ where }) {
      for (const [id, row] of rows) if (equals(row, where)) rows.delete(id);
    },
  },
};
function cookies(response, jar) {
  for (const c of response.headers.getSetCookie()) {
    const [entry] = c.split(";");
    const [name, ...rest] = entry.split("=");
    jar.set(name, rest.join("="));
  }
}
async function get(path, jar = new Map()) {
  const url = path.startsWith("http://") ? path : `${base}${path}`;
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "X-Forwarded-Proto": "https",
      "X-Forwarded-Host": "auth.example.test",
      Host: "auth.example.test",
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
  cookies(response, jar);
  return response;
}
function authUrl(extra = {}) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const u = new URL("/auth", "http://localhost");
  for (const [k, v] of Object.entries({
    client_id: CLIENT,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid profiles:read",
    resource: RESOURCE,
    state: "opaque-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...extra,
  }))
    if (v !== undefined) u.searchParams.set(k, v);
  return { path: u.pathname + u.search, verifier };
}

describe("oidc-provider OAuth protocol fixture", () => {
  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = privateKey.export({ format: "jwk" });
    Object.assign(jwk, { kid: "ephemeral-test", use: "sig", alg: "RS256" });
    config = {
      issuer: "https://auth.example.test",
      resource: RESOURCE,
      redirectUri: REDIRECT,
      clientId: CLIENT,
      introspectionSecret: "I".repeat(48),
      cookieSecrets: ["C".repeat(48)],
      jwks: { keys: [jwk] },
      storageKeys: [randomBytes(32)],
    };
    provider = createOAuthProvider(config, prisma);
    provider.proxy = true;
    const callback = provider.callback();
    server = createServer(async (req, res) => {
      if (req.url.startsWith("/interaction/")) {
        const details = await provider.interactionDetails(req, res);
        if (details.prompt.name === "login")
          await provider.interactionFinished(req, res, {
            login: { accountId: USER, remember: false },
          });
        else if (details.prompt.name === "consent") {
          const grant = new provider.Grant({
            accountId: USER,
            clientId: CLIENT,
          });
          grant.addResourceScope(RESOURCE, "profiles:read");
          grant.addOIDCScope("openid profiles:read");
          await grant.save();
          await provider.interactionFinished(req, res, {
            consent: { grantId: grant.jti },
          });
        } else {
          res.writeHead(500);
          res.end();
        }
      } else await callback(req, res);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("publishes S256 and no dynamic registration", async () => {
    const data = await (
      await get("/.well-known/oauth-authorization-server")
    ).json();
    expect(data.issuer).toBe(config.issuer);
    expect(data.code_challenge_methods_supported).toContain("S256");
    expect(data.scopes_supported).toContain("profiles:read");
    expect(data.scopes_supported).toContain("openid");
    expect(data.scopes_supported).not.toContain("email");
    expect(data.scopes_supported).not.toContain("profile");
    expect(data.authorization_response_iss_parameter_supported).toBe(true);
    expect(data.registration_endpoint).toBeUndefined();
    expect(data.introspection_endpoint).toBe(
      config.issuer + "/token/introspection",
    );
  });
  it("rejects unregistered redirect and unbound resource", async () => {
    const bad = await get(
      authUrl({ redirect_uri: "https://evil.example/callback" }).path,
    );
    expect(bad.status).toBe(400);
    const wrong = await get(
      authUrl({ resource: "https://evil.example/api" }).path,
    );
    expect(wrong.status).toBe(303);
    expect(wrong.headers.get("location")).toContain("invalid_target");
    expect(new URL(wrong.headers.get("location")).searchParams.get("iss")).toBe(
      config.issuer,
    );
  });
  it("requires S256 PKCE and exact resource", async () => {
    const noPkce = await get(
      authUrl({ code_challenge: undefined, code_challenge_method: undefined })
        .path,
    );
    expect(noPkce.headers.get("location")).toContain("invalid_request");
    const noResource = await get(authUrl({ resource: undefined }).path);
    expect(noResource.headers.get("location")).toContain("invalid_target");
  });
  it("authorizes a read-only grant and exchanges a bound access token", async () => {
    const jar = new Map();
    const { path, verifier } = authUrl();
    let r = await get(path, jar);
    for (
      let i = 0;
      i < 8 && !(r.headers.get("location") || "").startsWith(REDIRECT);
      i++
    ) {
      const loc = r.headers.get("location");
      expect(loc).toBeTruthy();
      r = await get(
        loc.startsWith(config.issuer) ? loc.slice(config.issuer.length) : loc,
        jar,
      );
    }
    const redirect = new URL(r.headers.get("location"));
    expect(redirect.searchParams.get("state")).toBe("opaque-state");
    expect(redirect.searchParams.get("iss")).toBe(config.issuer);
    const code = redirect.searchParams.get("code");
    expect(code).toBeTruthy();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: RESOURCE,
    });
    const token = await fetch(base + "/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-Proto": "https",
      },
      body,
    });
    const data = await token.json();
    expect(token.status).toBe(200);
    expect(data.access_token).toBeTruthy();
    expect(data.token_type).toBe("Bearer");
    expect(data.refresh_token).toBeTruthy();
    expect(data.id_token).toBeTruthy();
    const idClaims = JSON.parse(
      Buffer.from(data.id_token.split(".")[1], "base64url").toString(),
    );
    expect(idClaims).toMatchObject({
      iss: config.issuer,
      aud: CLIENT,
      sub: USER,
    });
    expect(idClaims.email).toBeUndefined();
    expect(idClaims.name).toBeUndefined();
    const inspect = await fetch(base + "/token/introspection", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            "cloud-palette-resource-server:" + config.introspectionSecret,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-Proto": "https",
      },
      body: new URLSearchParams({ token: data.access_token }),
    });
    const claims = await inspect.json();
    expect(claims).toMatchObject({
      active: true,
      iss: config.issuer,
      aud: RESOURCE,
      client_id: CLIENT,
      scope: "profiles:read",
      sub: USER,
    });
    expect(
      [...rows.values()].some(
        (row) =>
          row.model === "AccessToken" && row.idHash === data.access_token,
      ),
    ).toBe(false);
    const refresh = await fetch(base + "/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-Proto": "https",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT,
        refresh_token: data.refresh_token,
        resource: RESOURCE,
      }),
    });
    const rotated = await refresh.json();
    expect(refresh.status).toBe(200);
    expect(rotated.refresh_token).toBeTruthy();
    expect(rotated.refresh_token).not.toBe(data.refresh_token);
    const accessRecord = [...rows.values()].find(
      (row) => row.model === "AccessToken" && row.grantIdHash,
    );
    expect(JSON.stringify([...rows.values()])).not.toContain(data.access_token);
    expect(JSON.stringify([...rows.values()])).not.toContain(
      data.refresh_token,
    );
    expect(JSON.stringify([...rows.values()])).not.toContain(USER);
    const accessPayload = openOAuthValue(
      config.storageKeys,
      `AccessToken:${accessRecord.idHash}`,
      accessRecord.payload,
    );
    const grant = await provider.Grant.find(accessPayload.grantId);
    await grant.destroy();
    const afterRevoke = await fetch(base + "/token/introspection", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            "cloud-palette-resource-server:" + config.introspectionSecret,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-Proto": "https",
      },
      body: new URLSearchParams({ token: rotated.access_token }),
    });
    expect(await afterRevoke.json()).toMatchObject({ active: false });
  });
});

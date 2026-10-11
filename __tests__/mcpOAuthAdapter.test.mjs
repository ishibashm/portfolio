// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PrismaOAuthAdapter,
  openOAuthValue,
  sealOAuthValue,
  hashOAuthId,
} from "../oauth-service/adapter.mjs";

describe("durable OAuth adapter", () => {
  it("encrypts full bearer payload, hashes indexes and permits one atomic redemption", async () => {
    let row;
    const records = {
      async upsert({ create }) {
        row = create;
      },
      async findFirst({ where }) {
        return row && Object.entries(where).every(([k, v]) => row[k] === v)
          ? row
          : null;
      },
      async updateMany({ where, data }) {
        if (!row || row.idHash !== where.idHash || row.consumedAt !== null)
          return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      },
    };
    const key = randomBytes(32);
    const adapter = new PrismaOAuthAdapter(
      "AuthorizationCode",
      { mcpOauthRecord: records },
      [key],
    );
    await adapter.upsert(
      "plain-secret-code",
      {
        jti: "plain-secret-code",
        accountId: "subject-uuid",
        grantId: "grant-secret",
        uid: "session-secret",
      },
      60,
    );
    expect(row.idHash).toBe(hashOAuthId("plain-secret-code"));
    expect(row.grantIdHash).toBe(hashOAuthId("grant-secret"));
    expect(row.uidHash).toBe(hashOAuthId("session-secret"));
    expect(JSON.stringify(row)).not.toMatch(
      /plain-secret-code|subject-uuid|grant-secret|session-secret/,
    );
    expect(await adapter.find("plain-secret-code")).toMatchObject({
      jti: "plain-secret-code",
      accountId: "subject-uuid",
    });
    expect(await adapter.findByUid("session-secret")).toMatchObject({
      jti: "plain-secret-code",
    });
    const outcomes = await Promise.allSettled([
      adapter.consume("plain-secret-code"),
      adapter.consume("plain-secret-code"),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await adapter.find("plain-secret-code")).toMatchObject({
      consumed: expect.any(Number),
    });
  });
  it("authenticates ciphertext and supports new-plus-old key rotation", () => {
    const oldKey = randomBytes(32),
      newKey = randomBytes(32);
    const encrypted = sealOAuthValue([oldKey], "Grant:hash", { jti: "secret" });
    expect(openOAuthValue([newKey, oldKey], "Grant:hash", encrypted)).toEqual({
      jti: "secret",
    });
    expect(() => openOAuthValue([newKey], "Grant:hash", encrypted)).toThrow();
    expect(() =>
      openOAuthValue([oldKey], "Grant:other-hash", encrypted),
    ).toThrow();
    expect(() =>
      openOAuthValue([oldKey], "Grant:hash", {
        ...encrypted,
        ct: encrypted.ct.replace(/^./, "A"),
      }),
    ).toThrow();
  });
});

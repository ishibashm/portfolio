// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { GmailListingEmailReader, gmailStateSchema } from "@/lib/gmail/reader";
import { seal, unseal } from "@/lib/gmail/security";
import { GMAIL_READONLY_SCOPE } from "@/lib/listingEmailConnection";
import type {
  GmailConnectionRecord,
  GmailConnectionStore,
} from "@/lib/gmail/store";
import { GMAIL_MIME_MAX_BYTES } from "@/lib/listingEmailIngest";
const owner = "owner";
const start = "2026-09-24T00:00:00.000Z";
const window = {
  connectionId: "connection",
  labelId: "Label_rental",
  startedAt: start,
  maxMessages: 2,
  cursor: null as string | null,
};
const mime = "Content-Type: text/plain\r\n\r\nhttps://suumo.jp/fixture";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function setup(rawMime = mime) {
  let record: GmailConnectionRecord | null = {
    id: "connection",
    userId: owner,
    labelId: window.labelId,
    startedAt: new Date(start),
    sealedState: seal(
      {
        refreshToken: "PRIVATE_REFRESH",
        scope: GMAIL_READONLY_SCOPE,
        cursor: null,
      },
      owner,
      "connection",
    ),
  };
  const writes: (string | null)[] = [];
  const store: GmailConnectionStore = {
    withConnection: vi.fn(async (_owner, _id, operation) =>
      operation(record, async (value: string | null) => {
        writes.push(value);
        if (value === null) record = null;
        else record!.sealedState = value;
      }),
    ),
  };
  const transport = vi.fn<typeof fetch>();
  const metadata = {
    id: "abc",
    labelIds: [window.labelId],
    internalDate: String(Date.parse(start)),
    sizeEstimate: Buffer.byteLength(rawMime),
  };
  transport.mockImplementation(async (input) => {
    const u = new URL(String(input));
    if (u.pathname === "/token")
      return json({
        access_token: "PRIVATE_ACCESS",
        scope: GMAIL_READONLY_SCOPE,
        token_type: "Bearer",
        expires_in: 3600,
      });
    if (u.pathname === "/revoke") return json({});
    if (u.pathname.includes("/labels/"))
      return json({ id: window.labelId, type: "user" });
    if (u.pathname.endsWith("/messages"))
      return json({
        messages: [{ id: "abc" }],
        nextPageToken: "PRIVATE_PROVIDER_CURSOR",
      });
    return json({
      ...metadata,
      ...(u.searchParams.get("format") === "raw"
        ? { raw: Buffer.from(rawMime).toString("base64url") }
        : {}),
    });
  });
  return {
    reader: new GmailListingEmailReader(store, transport),
    store,
    transport,
    writes,
    metadata,
    record: () => record,
  };
}
beforeEach(() => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "LISTING_EMAIL_GOOGLE_REDIRECT_URI",
    "https://example.com/api/relocation/email/gmail/callback",
  );
  // Synthetic test key, not a deployed secret.
  vi.stubEnv(
    "LISTING_EMAIL_ENCRYPTION_KEY",
    Buffer.alloc(32, 7).toString("base64"),
  );
  vi.stubEnv("LISTING_EMAIL_ENCRYPTION_KEY_ID", "test-v1");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("REAL_NETWORK_FORBIDDEN"),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Gmail reader", () => {
  it("defaults OFF without storage or network access", async () => {
    const s = setup();
    vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "");
    await expect(s.reader.read(owner, window)).rejects.toThrow(
      "GMAIL_DISABLED",
    );
    await expect(
      s.reader.disconnect(owner, window.connectionId),
    ).rejects.toThrow("GMAIL_DISABLED");
    expect(s.store.withConnection).not.toHaveBeenCalled();
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("refreshes with readonly, restricts label/time and uses only fixed Google endpoints", async () => {
    const s = setup();
    const result = await s.reader.read(owner, window);
    expect(result.messages).toEqual([{ rawMime: mime }]);
    expect(result.nextCursor).toBeTruthy();
    const listUrl = new URL(String(s.transport.mock.calls[2][0]));
    expect(listUrl.searchParams.get("labelIds")).toBe(window.labelId);
    expect(listUrl.searchParams.get("q")).toBe(
      `after:${Date.parse(start) / 1000 - 1}`,
    );
    expect(s.transport.mock.calls[0][1]?.body).toContain(
      "grant_type=refresh_token",
    );
    for (const [url, init] of s.transport.mock.calls) {
      expect(["gmail.googleapis.com", "oauth2.googleapis.com"]).toContain(
        new URL(String(url)).host,
      );
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
    }
    expect(JSON.stringify(s.writes)).not.toMatch(/PRIVATE_|suumo|Content-Type/);
  });
  it("binds owners, scope, window and cursor before network", async () => {
    const s = setup();
    await expect(s.reader.read("other", window)).rejects.toThrow("NOT_FOUND");
    await expect(
      s.reader.read(owner, { ...window, labelId: "INBOX" }),
    ).rejects.toThrow("INVALID_WINDOW");
    await expect(
      s.reader.read(owner, { ...window, maxMessages: 21 }),
    ).rejects.toThrow("INVALID_WINDOW");
    await expect(
      s.reader.read(owner, { ...window, cursor: "tampered" }),
    ).rejects.toThrow("INVALID_CURSOR");
    expect(s.transport).not.toHaveBeenCalled();
    s.record()!.sealedState = seal(
      { refreshToken: "x", scope: "gmail.modify", cursor: null },
      owner,
      window.connectionId,
    );
    await expect(s.reader.read(owner, window)).rejects.toThrow(
      "GMAIL_UNAVAILABLE",
    );
    expect(s.transport).not.toHaveBeenCalled();
  });
  it.each(["https://mail.google.com/", `${GMAIL_READONLY_SCOPE} openid`, ""])(
    "rejects refresh scope %s",
    async (scope) => {
      const s = setup();
      s.transport.mockResolvedValueOnce(
        json({
          access_token: "a",
          scope,
          token_type: "Bearer",
          expires_in: 3600,
        }),
      );
      await expect(s.reader.read(owner, window)).rejects.toThrow(
        "GMAIL_UNAVAILABLE",
      );
      expect(s.transport).toHaveBeenCalledTimes(1);
      expect(s.writes).toHaveLength(0);
    },
  );
  it("bounds pagination and deduplicates repeated IDs without resetting the total", async () => {
    const s = setup();
    const first = await s.reader.read(owner, window);
    const second = await s.reader.read(owner, {
      ...window,
      cursor: first.nextCursor,
    });
    expect(second).toEqual({ messages: [], nextCursor: null });
    expect(
      s.transport.mock.calls.some(([url]) =>
        String(url).includes("pageToken=PRIVATE_PROVIDER_CURSOR"),
      ),
    ).toBe(true);
    await expect(
      s.reader.read(owner, { ...window, cursor: first.nextCursor }),
    ).rejects.toThrow("INVALID_CURSOR");
  });
  it("rejects expired and differently bounded cursors", async () => {
    const s = setup();
    const first = await s.reader.read(owner, window);
    await expect(
      s.reader.read(owner, {
        ...window,
        cursor: first.nextCursor,
        maxMessages: 3,
      }),
    ).rejects.toThrow("INVALID_CURSOR");
    const state = gmailStateSchema.parse(
      unseal(s.record()!.sealedState, owner, window.connectionId),
    );
    state.cursor!.expiresAt = 0;
    s.record()!.sealedState = seal(state, owner, window.connectionId);
    await expect(
      s.reader.read(owner, { ...window, cursor: first.nextCursor }),
    ).rejects.toThrow("INVALID_CURSOR");
  });
  it.each(["old", "other-label"])(
    "skips %s messages before requesting raw MIME",
    async (mode) => {
      const s = setup();
      if (mode === "old")
        s.metadata.internalDate = String(Date.parse(start) - 1);
      else s.metadata.labelIds = ["INBOX"];
      expect((await s.reader.read(owner, window)).messages).toEqual([]);
      expect(
        s.transport.mock.calls.some(([url]) =>
          String(url).includes("format=raw"),
        ),
      ).toBe(false);
    },
  );
  it("rejects oversized messages before raw fetch", async () => {
    const s = setup();
    s.metadata.sizeEstimate = GMAIL_MIME_MAX_BYTES + 1;
    await expect(s.reader.read(owner, window)).rejects.toThrow(
      "GMAIL_MESSAGE_SIZE",
    );
    expect(s.writes).toHaveLength(0);
  });
  it("bounds responses and suppresses provider errors and logs", async () => {
    const s = setup();
    const log = vi.spyOn(console, "error");
    s.transport.mockResolvedValueOnce(new Response("x".repeat(65537)));
    await expect(s.reader.read(owner, window)).rejects.toThrow(
      "GMAIL_RESPONSE_SIZE",
    );
    s.transport.mockRejectedValueOnce(new Error("PRIVATE_REFRESH"));
    await expect(s.reader.read(owner, window)).rejects.toThrow(
      "GMAIL_PROVIDER",
    );
    expect(log).not.toHaveBeenCalled();
  });
  it("persists a rotated refresh token but not a failed page cursor", async () => {
    const s = setup();
    s.transport
      .mockResolvedValueOnce(
        json({
          access_token: "a",
          refresh_token: "ROTATED",
          scope: GMAIL_READONLY_SCOPE,
          token_type: "Bearer",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(json({ id: window.labelId, type: "system" }));
    await expect(s.reader.read(owner, window)).rejects.toThrow(
      "GMAIL_UNAVAILABLE",
    );
    expect(unseal(s.record()!.sealedState, owner, window.connectionId)).toEqual(
      { refreshToken: "ROTATED", scope: GMAIL_READONLY_SCOPE, cursor: null },
    );
  });
  it("disconnect revokes and deletes encrypted token/cursor; is owner-isolated and idempotent", async () => {
    const s = setup();
    await s.reader.read(owner, window);
    s.transport.mockClear();
    await s.reader.disconnect("other", window.connectionId);
    expect(s.record()).not.toBeNull();
    expect(s.transport).not.toHaveBeenCalled();
    await s.reader.disconnect(owner, window.connectionId);
    expect(s.record()).toBeNull();
    expect(s.transport.mock.calls[0][0]).toBe(
      "https://oauth2.googleapis.com/revoke",
    );
    expect(s.transport.mock.calls[0][1]?.body).toBe("token=PRIVATE_REFRESH");
    await s.reader.disconnect(owner, window.connectionId);
    expect(s.transport).toHaveBeenCalledTimes(1);
  });
  it("commits local deletion despite revoke failure", async () => {
    const s = setup();
    s.transport.mockResolvedValue(json({ secret: "PRIVATE_REFRESH" }, 500));
    await expect(
      s.reader.disconnect(owner, window.connectionId),
    ).rejects.toThrow("GMAIL_REVOKE_FAILED_LOCAL_DELETED");
    expect(s.record()).toBeNull();
  });
  it("AES-GCM binds ciphertext to owner/connection and rejects tampering", () => {
    const value = seal({ refreshToken: "SECRET" }, owner, "one");
    expect(value).not.toContain("SECRET");
    expect(unseal(value, owner, "one")).toEqual({ refreshToken: "SECRET" });
    expect(() => unseal(value, "other", "one")).toThrow("GMAIL_CIPHERTEXT");
    expect(() => unseal(value, owner, "two")).toThrow("GMAIL_CIPHERTEXT");
    expect(() => unseal(value.slice(0, -5), owner, "one")).toThrow(
      "GMAIL_CIPHERTEXT",
    );
  });
});

it.each(["athome", "suumo", "homes", "shamaison"])(
  "reader accepts the bounded %s fixture through injected Google responses",
  async (name) => {
    const raw = readFileSync(
      resolve(`__tests__/fixtures/listing-emails/${name}.eml`),
      "utf8",
    );
    const s = setup(raw);
    const result = await s.reader.read(owner, window);
    // Compare without printing a MIME body on assertion failure.
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].rawMime === raw).toBe(true);
    expect(s.writes.some((value) => value?.includes(raw))).toBe(false);
  },
);
it("reader bounds both decoded MIME and the raw JSON stream even with a false sizeEstimate", async () => {
  const s = setup("Content-Type: text/plain\r\n\r\n" + "x".repeat(60000));
  expect((await s.reader.read(owner, window)).messages).toHaveLength(1);
  const huge = setup(
    "Content-Type: text/plain\r\n\r\n" + "x".repeat(GMAIL_MIME_MAX_BYTES + 1),
  );
  huge.metadata.sizeEstimate = 1;
  await expect(huge.reader.read(owner, window)).rejects.toThrow();
  expect(huge.writes).toHaveLength(0);
  const capped = setup();
  const original = capped.transport.getMockImplementation()!;
  capped.transport.mockImplementation(async (url, init) =>
    String(url).includes("format=raw")
      ? new Response("x".repeat(1024 * 1024))
      : original(url, init),
  );
  await expect(capped.reader.read(owner, window)).rejects.toThrow(
    "GMAIL_RESPONSE_SIZE",
  );
});

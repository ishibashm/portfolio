// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GMAIL_READONLY_SCOPE,
  type ListingEmailReader,
  type ListingEmailReadWindow,
} from "@/lib/listingEmailConnection";
import {
  FakeListingEmailReader,
  type FakeEmailConnection,
} from "@/lib/testing/fakeListingEmailReader";
const startedAt = "2026-09-24T00:00:00.000Z";
const start = Date.parse(startedAt);
const message = (id: string, internalDate = start, labelIds = ["rentals"]) => ({
  id,
  internalDate,
  labelIds,
  rawMime: `Date: Thu, 01 Jan 1970 00:00:00 +0000\r\nContent-Type: text/plain\r\n\r\nhttps://suumo.jp/${id}`,
});
const fixture = (id = "a", userId = "alice"): FakeEmailConnection => ({
  connection: {
    id,
    userId,
    provider: "gmail",
    labelId: "rentals",
    startedAt,
    encryptedRefreshToken: "SYNTHETIC_TOKEN_NOT_ENCRYPTION",
    encryptionKeyVersion: "fake-v1",
    syncCursor: null,
  },
  scopes: [GMAIL_READONLY_SCOPE],
  label: { id: "rentals", type: "user" },
  messages: Array.from({ length: 25 }, (_, i) =>
    message(String(i).padStart(2, "0"), start + i),
  ),
});
const window = (
  overrides: Partial<ListingEmailReadWindow> = {},
): ListingEmailReadWindow => ({
  connectionId: "a",
  labelId: "rentals",
  startedAt,
  maxMessages: 20,
  cursor: null,
  ...overrides,
});
afterEach(() => vi.restoreAllMocks());
describe("fake Gmail reader contract", () => {
  it("only reads the dedicated label since internalDate, including the exact boundary", async () => {
    const f = fixture();
    f.messages = [
      message("old", start - 1),
      message("wrong-label", start, ["inbox"]),
      message("at-boundary"),
      message("later", start + 1, ["rentals", "inbox"]),
    ];
    const reader: ListingEmailReader = new FakeListingEmailReader([f]);
    const result = await reader.read("alice", window());
    expect(result.messages.map((m) => m.rawMime)).toEqual([
      f.messages[2].rawMime,
      f.messages[3].rawMime,
    ]);
    expect(result.nextCursor).toBeNull();
    expect(result.messages[0]).toEqual({ rawMime: f.messages[2].rawMime });
  });
  it("uses an absolute start instant even with a timezone offset; old mail labeled later stays excluded", async () => {
    const f = fixture();
    f.connection.startedAt = "2026-09-24T09:00:00+09:00";
    f.messages = [
      message("new-label-old-mail", start - 1),
      message("exact", start),
    ];
    const reader = new FakeListingEmailReader([f]);
    expect(
      (
        await reader.read(
          "alice",
          window({ startedAt: f.connection.startedAt }),
        )
      ).messages,
    ).toEqual([{ rawMime: f.messages[1].rawMime }]);
  });
  it.each(
    [
      [],
      ["gmail.readonly"],
      ["https://www.googleapis.com/auth/gmail.modify"],
      [GMAIL_READONLY_SCOPE, "https://mail.google.com/"],
      [GMAIL_READONLY_SCOPE, GMAIL_READONLY_SCOPE],
    ].map((scopes) => ({ scopes })),
  )("rejects missing, different or extra scopes: $scopes", ({ scopes }) => {
    expect(
      () => new FakeListingEmailReader([{ ...fixture(), scopes }]),
    ).toThrow("INVALID_FIXTURE");
  });
  it("rejects system/mismatched labels and ignores external fixture mutation", async () => {
    expect(
      () =>
        new FakeListingEmailReader([
          { ...fixture(), label: { id: "rentals", type: "system" } },
        ]),
    ).toThrow("INVALID_FIXTURE");
    expect(
      () =>
        new FakeListingEmailReader([
          { ...fixture(), label: { id: "other", type: "user" } },
        ]),
    ).toThrow("INVALID_FIXTURE");
    const f = fixture();
    const reader = new FakeListingEmailReader([f]);
    f.connection.userId = "mallory";
    f.connection.labelId = "other";
    f.messages[0].labelIds = [];
    expect((await reader.read("alice", window())).messages).toHaveLength(5);
    await expect(reader.read("mallory", window())).rejects.toThrow("NOT_FOUND");
  });
  it.each([0, -1, 21, 1.5, NaN, Infinity])(
    "rejects invalid total limit %s",
    async (maxMessages) => {
      await expect(
        new FakeListingEmailReader([fixture()]).read(
          "alice",
          window({ maxMessages }),
        ),
      ).rejects.toThrow("INVALID_WINDOW");
    },
  );
  it("does not permit changing the label or widening the time range", async () => {
    const reader = new FakeListingEmailReader([fixture()]);
    for (const w of [
      window({ labelId: "inbox" }),
      window({ startedAt: "2000-01-01T00:00:00Z" }),
    ])
      await expect(reader.read("alice", w)).rejects.toThrow("INVALID_WINDOW");
  });
  it("isolates connections and cursors even when connection belongs to the same owner", async () => {
    const reader = new FakeListingEmailReader(
      [fixture(), fixture("b", "bob"), fixture("a2")],
      { pageSize: 1 },
    );
    const first = await reader.read("alice", window());
    const before = reader.inspect("alice", "a");
    await expect(reader.read("bob", window())).rejects.toThrow("NOT_FOUND");
    await expect(
      reader.read("bob", window({ connectionId: "missing" })),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      reader.read(
        "bob",
        window({ connectionId: "b", cursor: first.nextCursor }),
      ),
    ).rejects.toThrow("INVALID_CURSOR");
    await expect(
      reader.read(
        "alice",
        window({ connectionId: "a2", cursor: first.nextCursor }),
      ),
    ).rejects.toThrow("INVALID_CURSOR");
    expect(reader.inspect("bob", "a")).toEqual({
      connection: null,
      cursorCount: 0,
    });
    expect(reader.inspect("alice", "a")).toEqual(before);
    expect(
      (await reader.read("alice", window({ cursor: first.nextCursor })))
        .messages,
    ).toHaveLength(1);
  });
  it("pages in stable order without duplicates and keeps the operation-wide 20 limit", async () => {
    const f = fixture();
    f.messages = [...f.messages].reverse();
    const reader: ListingEmailReader = new FakeListingEmailReader([f], {
      pageSize: 3,
    });
    let cursor: string | null = null;
    const bodies: string[] = [];
    let pages = 0;
    do {
      const result = await reader.read("alice", window({ cursor }));
      bodies.push(...result.messages.map((m) => m.rawMime));
      cursor = result.nextCursor;
      pages++;
      expect(pages).toBeLessThan(9);
    } while (cursor);
    expect(pages).toBe(7);
    expect(bodies).toEqual(
      fixture()
        .messages.slice(0, 20)
        .map((m) => m.rawMime),
    );
    expect(new Set(bodies).size).toBe(20);
  });
  it("binds the total limit and rejects tampering, replay and stale concurrent cursors", async () => {
    const reader = new FakeListingEmailReader([fixture()], { pageSize: 1 });
    const first = await reader.read("alice", window({ maxMessages: 3 }));
    await expect(
      reader.read("alice", window({ cursor: first.nextCursor })),
    ).rejects.toThrow("INVALID_CURSOR");
    await expect(
      reader.read(
        "alice",
        window({ maxMessages: 3, cursor: `${first.nextCursor}x` }),
      ),
    ).rejects.toThrow("INVALID_CURSOR");
    const results = await Promise.allSettled([
      reader.read(
        "alice",
        window({ maxMessages: 3, cursor: first.nextCursor }),
      ),
      reader.read(
        "alice",
        window({ maxMessages: 3, cursor: first.nextCursor }),
      ),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(reader.inspect("alice", "a").cursorCount).toBe(1);
  });
  it("expires cursors; explicit restart invalidates old cursor without widening the range", async () => {
    let now = 0;
    const reader = new FakeListingEmailReader([fixture()], {
      now: () => now,
      cursorTtlMs: 10,
      pageSize: 1,
    });
    const first = await reader.read("alice", window());
    now = 10;
    await expect(
      reader.read("alice", window({ cursor: first.nextCursor })),
    ).rejects.toThrow("INVALID_CURSOR");
    const restarted = await reader.read("alice", window());
    expect(restarted.messages).toEqual(first.messages);
    expect(restarted.nextCursor).not.toBe(first.nextCursor);
    expect(reader.inspect("alice", "a").cursorCount).toBe(1);
  });
  it("does not advance or discard a cursor when MIME validation fails", async () => {
    const f = fixture();
    f.messages = [
      message("valid"),
      { ...message("invalid", start + 1), rawMime: "SECRET_INVALID_MIME" },
    ];
    const reader = new FakeListingEmailReader([f], { pageSize: 1 });
    const first = await reader.read("alice", window());
    const before = reader.inspect("alice", "a");
    await expect(
      reader.read("alice", window({ cursor: first.nextCursor })),
    ).rejects.toThrow("INVALID_MESSAGE");
    expect(reader.inspect("alice", "a")).toEqual(before);
  });
  it("disconnect deletes fake token and every cursor, is idempotent and leaves other owners intact", async () => {
    const reader = new FakeListingEmailReader([fixture(), fixture("b", "bob")]);
    const first = await reader.read("alice", window());
    await reader.read("bob", window({ connectionId: "b" }));
    const bob = reader.inspect("bob", "b");
    await reader.disconnect("bob", "a");
    expect(
      reader.inspect("alice", "a").connection?.encryptedRefreshToken,
    ).toBeTruthy();
    await reader.disconnect("alice", "a");
    await reader.disconnect("alice", "a");
    expect(reader.inspect("alice", "a")).toEqual({
      connection: null,
      cursorCount: 0,
    });
    expect(reader.inspect("bob", "b")).toEqual(bob);
    await expect(
      reader.read("alice", window({ cursor: first.nextCursor })),
    ).rejects.toThrow("NOT_FOUND");
  });
  it("performs no network or logging and exposes no message content in diagnostics", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const fake = new FakeListingEmailReader([fixture()]);
    const reader: ListingEmailReader = fake;
    await reader.read("alice", window());
    expect(JSON.stringify(fake.inspect("alice", "a"))).not.toMatch(
      /rawMime|suumo|Content-Type/,
    );
    await reader.disconnect("alice", "a");
    expect(fetch).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});

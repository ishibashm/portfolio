// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { GmailAccountService } from "@/lib/gmail/account";
import { GmailListingEmailReader } from "@/lib/gmail/reader";
import { GMAIL_READONLY_SCOPE } from "@/lib/listingEmailConnection";
import { seal, unseal } from "@/lib/gmail/security";
import type {
  GmailConnectionRecord,
  GmailConnectionStore,
} from "@/lib/gmail/store";
const owner = "owner";
const grant = {
  access_token: "ACCESS_SECRET",
  refresh_token: "REFRESH_SECRET",
  token_type: "Bearer",
  expires_in: 3600,
  scope: GMAIL_READONLY_SCOPE,
};
const response = (value: unknown) => new Response(JSON.stringify(value));
function setup() {
  let record: GmailConnectionRecord = {
    id: "connection",
    userId: owner,
    labelId: null,
    startedAt: new Date("2020-01-01Z"),
    sealedState: seal(
      {
        refreshToken: "REFRESH_SECRET",
        scope: GMAIL_READONLY_SCOPE,
        cursor: null,
      },
      owner,
      "connection",
    ),
  };
  const save = vi.fn(
    async (
      sealedState: string | null,
      selection?: { labelId: string; startedAt: Date },
    ) => {
      if (sealedState) record = { ...record, sealedState, ...selection };
    },
  );
  const store: GmailConnectionStore = {
    withConnection: async (_owner, _id, operation) => operation(record, save),
  };
  const create = vi
    .fn<(record: GmailConnectionRecord) => Promise<void>>()
    .mockResolvedValue(undefined);
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url) =>
    String(url).includes("/token")
      ? response(grant)
      : response({
          labels: [
            { id: "INBOX", name: "Inbox", type: "system" },
            {
              id: "Label_1",
              name: "物件通知",
              type: "user",
              messagesTotal: 999,
            },
          ],
        }),
  );
  return {
    account: new GmailAccountService(store, create, transport),
    transport,
    create,
    store,
    save,
    record: () => record,
  };
}
beforeEach(() => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_ID", "id");
  vi.stubEnv("LISTING_EMAIL_GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv(
    "LISTING_EMAIL_GOOGLE_REDIRECT_URI",
    "https://example.com/api/relocation/email/gmail/callback",
  );
  vi.stubEnv(
    "LISTING_EMAIL_ENCRYPTION_KEY",
    Buffer.alloc(32, 3).toString("base64"),
  );
  vi.stubEnv("LISTING_EMAIL_ENCRYPTION_KEY_ID", "test");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("REAL_NETWORK_FORBIDDEN"),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("exchanges code with verifier, saves only encrypted refresh token and leaves label unselected", async () => {
  const s = setup();
  const id = await s.account.exchange(owner, "CODE_SECRET", "VERIFIER_SECRET");
  const record = s.create.mock.calls[0][0];
  expect(record.id).toBe(id);
  expect(record.labelId).toBeNull();
  expect(JSON.stringify(record)).not.toMatch(
    /CODE_SECRET|VERIFIER_SECRET|REFRESH_SECRET|ACCESS_SECRET/,
  );
  expect(unseal(record.sealedState, owner, id)).toEqual({
    refreshToken: "REFRESH_SECRET",
    scope: GMAIL_READONLY_SCOPE,
    cursor: null,
  });
  const form = new URLSearchParams(String(s.transport.mock.calls[0][1]?.body));
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code_verifier")).toBe("VERIFIER_SECRET");
  expect(s.transport.mock.calls[0][1]?.redirect).toBe("error");
});
it.each([
  "",
  "gmail.readonly",
  "https://mail.google.com/",
  `${GMAIL_READONLY_SCOPE} openid`,
  undefined,
])(
  "rejects missing or non-exact scope %s without persistence",
  async (scope) => {
    const s = setup();
    s.transport.mockResolvedValue(response({ ...grant, scope }));
    await expect(
      s.account.exchange(owner, "code", "verifier"),
    ).rejects.toThrow();
    expect(s.create).not.toHaveBeenCalled();
  },
);
it("rejects missing refresh token and revokes the unusable grant", async () => {
  const s = setup();
  s.transport.mockResolvedValue(
    response({ ...grant, refresh_token: undefined }),
  );
  await expect(s.account.exchange(owner, "code", "verifier")).rejects.toThrow(
    "OAUTH_GRANT",
  );
  expect(s.create).not.toHaveBeenCalled();
  expect(s.transport.mock.calls[1][0]).toBe(
    "https://oauth2.googleapis.com/revoke",
  );
});
it("database failure attempts revoke without leaking credentials", async () => {
  const s = setup();
  s.create.mockRejectedValue(new Error("REFRESH_SECRET"));
  await expect(s.account.exchange(owner, "code", "verifier")).rejects.toThrow(
    "OAUTH_SAVE_FAILED",
  );
  expect(s.transport.mock.calls[1][0]).toBe(
    "https://oauth2.googleapis.com/revoke",
  );
});
it("lists only user labels with id/name and checks ownership before fetch", async () => {
  const s = setup();
  await expect(s.account.listLabels("other", "connection")).rejects.toThrow(
    "NOT_FOUND",
  );
  await expect(
    s.account.listLabels(owner, "foreign-connection"),
  ).rejects.toThrow("NOT_FOUND");
  expect(s.transport).not.toHaveBeenCalled();
  expect(await s.account.listLabels(owner, "connection")).toEqual({
    labels: [{ id: "Label_1", name: "物件通知" }],
  });
  expect(s.save).not.toHaveBeenCalled();
});
it("selects a server-verified user label with current time and clears cursor", async () => {
  const s = setup();
  s.transport.mockImplementation(async (url) =>
    String(url).includes("/token")
      ? response(grant)
      : response({ id: "Label_1", name: "通知", type: "user" }),
  );
  s.record().sealedState = seal(
    {
      refreshToken: "REFRESH_SECRET",
      scope: GMAIL_READONLY_SCOPE,
      cursor: {
        handle: "11111111-2222-4333-8444-555555555555",
        pageToken: "old",
        maxMessages: 20,
        examined: 1,
        seen: [],
        expiresAt: Date.now() + 60000,
        labelId: "old-label",
        startedAt: "2020-01-01T00:00:00.000Z",
      },
    },
    owner,
    "connection",
  );
  const before = Date.now();
  const result = await s.account.selectLabel(owner, "connection", "Label_1");
  expect(s.record().labelId).toBe("Label_1");
  expect(s.record().startedAt.getTime()).toBeGreaterThanOrEqual(before);
  expect(result).toEqual({
    selected: {
      connectionId: "connection",
      labelId: "Label_1",
      startedAt: s.record().startedAt.toISOString(),
    },
  });
  expect(unseal(s.record().sealedState, owner, "connection")).toMatchObject({
    cursor: null,
  });
});
it.each(["system", "missing"])(
  "rejects %s label without changing selection",
  async (type) => {
    const s = setup();
    s.transport.mockImplementation(async (url) =>
      String(url).includes("/token")
        ? response(grant)
        : response({
            id: type === "missing" ? "different" : "INBOX",
            name: "Inbox",
            type: "system",
          }),
    );
    await expect(
      s.account.selectLabel(owner, "connection", "INBOX"),
    ).rejects.toThrow("INVALID_LABEL");
    expect(s.record().labelId).toBeNull();
    expect(s.save).not.toHaveBeenCalled();
  },
);
it("unselected connections cannot read messages; OFF blocks all account operations", async () => {
  const s = setup();
  await expect(
    new GmailListingEmailReader(s.store, s.transport).read(owner, {
      connectionId: "connection",
      labelId: "INBOX",
      startedAt: s.record().startedAt.toISOString(),
      maxMessages: 20,
      cursor: null,
    }),
  ).rejects.toThrow("INVALID_WINDOW");
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "");
  await expect(s.account.exchange(owner, "code", "verifier")).rejects.toThrow(
    "GMAIL_DISABLED",
  );
  await expect(s.account.listLabels(owner, "connection")).rejects.toThrow(
    "GMAIL_DISABLED",
  );
  await expect(
    s.account.selectLabel(owner, "connection", "Label_1"),
  ).rejects.toThrow("GMAIL_DISABLED");
  expect(s.transport).not.toHaveBeenCalled();
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createMcpConsentService } from "@/lib/mcpConsent";
import { MCP_PERSONAL_RESOURCE } from "@/lib/mcpAuthorizationConfig";

const userId = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const time = Date.parse("2026-10-11T00:00:00Z");
const client = {
  clientId: "test-client",
  clientName: "Test",
  redirectUris: ["https://client.invalid/callback"],
};
const interaction = () => ({
  uid: "i".repeat(32),
  exp: Math.floor(time / 1000) + 600,
  prompt: { name: "login" },
  params: {
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: "read:profiles",
    resource: MCP_PERSONAL_RESOURCE,
    response_type: "code",
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
    state: "client-state",
  },
});
const findFirst = vi.fn();
let clock = time;
const service = createMcpConsentService({
  db: { user_configs: { findFirst } } as unknown as PrismaClient,
  signingKey: randomBytes(32),
  now: () => clock,
});
const load = () => service.load(userId, interaction(), client);
beforeEach(() => {
  clock = time;
  vi.clearAllMocks();
  findFirst.mockResolvedValue({
    presets: [
      {
        id: "one",
        name: "同名",
        birthDate: "1990-01-01",
        baseLat: 35,
        secret: "never-return",
      },
      { id: "two", name: "同名" },
    ],
  });
});
describe("browser consent without a public entry point", () => {
  it("reads only the authenticated owner's presets and projects id/name", async () => {
    const view = await load();
    expect(findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { user_id: userId },
      select: { presets: true },
    });
    expect(view.profiles).toEqual([
      { id: "one", name: "同名" },
      { id: "two", name: "同名" },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/1990|baseLat|never-return/);
    const ticket = service.issueTicket(view);
    expect(ticket).not.toContain(userId);
    expect(
      service.verifySubmission(view, {
        ticket,
        decision: "allow",
        profileIds: ["two"],
      }),
    ).toEqual({ decision: "allow", profileIds: ["two"] });
  });
  it.each([undefined, "dev-bypass-id", "email@example.invalid"])(
    "rejects unverified subject %s before DB",
    async (id) => {
      await expect(service.load(id, interaction(), client)).rejects.toThrow(
        "LOGIN_REQUIRED",
      );
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it.each([
    { exp: time / 1000 },
    { session: { accountId: other } },
    { prompt: { name: "select_account" } },
    { result: { login: { accountId: userId } } },
    { uid: "../bad" },
  ])("rejects stale or mismatched interaction %#", async (patch) => {
    await expect(
      service.load(userId, { ...interaction(), ...patch }, client),
    ).rejects.toThrow("INVALID_REQUEST");
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each([
    { redirect_uri: "https://client.invalid/callback/evil" },
    { client_id: "other" },
    { resource: "https://evil.invalid" },
    { resource: [MCP_PERSONAL_RESOURCE] },
    { scope: "openid read:profiles" },
    { code_challenge_method: "plain" },
    { response_type: "token" },
    { code_challenge: undefined },
  ])("rejects protocol mismatch %#", async (patch) => {
    await expect(
      service.load(
        userId,
        { ...interaction(), params: { ...interaction().params, ...patch } },
        client,
      ),
    ).rejects.toThrow("INVALID_REQUEST");
    expect(findFirst).not.toHaveBeenCalled();
  });
  it("binds CSRF to user, interaction, parameters and displayed selection", async () => {
    const view = await load();
    const ticket = service.issueTicket(view);
    for (const patch of [
      { userId: other },
      { uid: "j".repeat(32) },
      { clientId: "other" },
      { redirectUri: "https://evil.invalid" },
      { binding: "changed-state" },
      { profiles: [{ id: "new", name: "new" }] },
      { profiles: [{ id: "one", name: "renamed" }] },
    ])
      expect(() =>
        service.verifySubmission(
          { ...view, ...patch },
          { ticket, decision: "allow", profileIds: ["one"] },
        ),
      ).toThrow("INVALID_REQUEST");
    for (const profileIds of [[], ["other"], ["one", "one"]])
      expect(() =>
        service.verifySubmission(view, {
          ticket,
          decision: "allow",
          profileIds,
        }),
      ).toThrow("INVALID_REQUEST");
    expect(() =>
      service.verifySubmission(view, {
        ticket: `${ticket.slice(0, -1)}!`,
        decision: "allow",
        profileIds: ["one"],
      }),
    ).toThrow("INVALID_REQUEST");
    clock += 300_000;
    expect(() =>
      service.verifySubmission(view, {
        ticket,
        decision: "allow",
        profileIds: ["one"],
      }),
    ).toThrow("INVALID_REQUEST");
  });
  it("supports refusal and empty cloud data without inventing profiles", async () => {
    findFirst.mockResolvedValue(null);
    const view = await load();
    expect(view.profiles).toEqual([]);
    expect(
      service.verifySubmission(view, {
        ticket: service.issueTicket(view),
        decision: "deny",
        profileIds: [],
      }),
    ).toEqual({ decision: "deny", profileIds: [] });
  });
  it.each(
    [
      {},
      [{ id: "one" }],
      [
        { id: "one", name: "A" },
        { id: "one", name: "B" },
      ],
      Array.from({ length: 101 }, (_, i) => ({ id: String(i), name: "A" })),
    ].map((presets) => [presets]),
  )("rejects malformed/oversized cloud profiles %#", async (presets) => {
    findFirst.mockResolvedValue({ presets });
    await expect(load()).rejects.toThrow("INVALID_REQUEST");
  });
  it("sanitizes database errors without logging", async () => {
    const log = vi.spyOn(console, "error");
    findFirst.mockRejectedValue(new Error("private-birth-token"));
    await expect(load()).rejects.toMatchObject({
      message: "TEMPORARILY_UNAVAILABLE",
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

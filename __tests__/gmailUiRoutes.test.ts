// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createGmailStatusHandler } from "@/lib/gmail/status";
import { GET } from "@/app/api/relocation/email/gmail/status/route";
import { CandidateError } from "@/lib/listingCandidateApi";
import { googleJson } from "@/lib/gmail/transport";
const req = () =>
  new NextRequest("https://example.com/api/relocation/email/gmail/status");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("status route defaults disabled before real auth/DB access", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "");
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: "GMAIL_DISABLED" });
  expect(fetch).not.toHaveBeenCalled();
});
it("status contract requires auth and returns only minimal metadata from owner-scoped repository", async () => {
  vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
  let reached = false;
  const denied = createGmailStatusHandler({
    user: async () => {
      throw new CandidateError(401, "LOGIN_REQUIRED", "ログインしてください。");
    },
    list: async () => {
      reached = true;
      return [];
    },
  });
  expect((await denied(req())).status).toBe(401);
  expect(reached).toBe(false);
  // In-memory contract fixture; no auth/Prisma module mocks or external services.
  const handler = createGmailStatusHandler({
    user: async () => "owner",
    list: async (owner) => {
      expect(owner).toBe("owner");
      return [
        {
          id: "connection",
          labelId: null,
          startedAt: new Date("2026-09-24Z"),
          sealedState: "SECRET",
        },
      ];
    },
  });
  const response = await handler(req());
  expect(await response.json()).toEqual({
    connections: [
      {
        id: "connection",
        labelId: null,
        startedAt: "2026-09-24T00:00:00.000Z",
      },
    ],
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each(["invalid_grant", "invalid_client"])(
  "maps token error %s to a fixed code without leaking descriptions",
  async (code) => {
    vi.stubEnv("LISTING_EMAIL_GMAIL_ENABLED", "true");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: code, error_description: "SECRET" }),
          { status: 400 },
        ),
      );
    await expect(
      googleJson(
        globalThis.fetch,
        "https://oauth2.googleapis.com/token",
        { method: "POST" },
        Date.now() + 3000,
      ),
    ).rejects.toThrow(
      code === "invalid_grant" ? "GMAIL_RECONNECT" : "GMAIL_PROVIDER",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

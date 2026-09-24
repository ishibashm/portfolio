// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
  listingCandidate: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: db.getAuthUser,
  toUserId: (u: { id: string }) => u.id,
}));
import { POST, GET } from "@/app/api/relocation/candidates/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/relocation/candidates/[id]/route";
import { POST as GEOCODE } from "@/app/api/relocation/candidates/geocode/route";
import { computeDayKigaku } from "@/lib/dayKigakuClient";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";
const userId = "11111111-2222-4333-8444-555555555555";
const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const id = "12345678-1234-4234-8234-123456789012";
const context = {
  birthDate: "1990-01-10",
  targetDate: "2026-10-05",
  baseLat: "35",
  baseLon: "135",
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;
const input = () => ({
  requestKey: crypto.randomUUID(),
  url: "https://suumo.jp/chintai/123/",
  target: {
    lat: 35.4,
    lon: 135.5,
    source: "pin",
    approximate: false,
    confirmed: true,
  },
  context,
});
const req = (
  method: string,
  body?: unknown,
  suffix = "",
  origin = "https://example.com",
) =>
  new NextRequest(`https://example.com/api/relocation/candidates${suffix}`, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const args = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  db.getAuthUser.mockResolvedValue({ id: userId });
  db.$queryRaw.mockResolvedValue([{ hits: 1 }]);
  db.$executeRaw.mockResolvedValue(1);
  db.$transaction.mockImplementation(async (fn) => fn(db));
  db.listingCandidate.findUnique.mockResolvedValue(null);
  db.listingCandidate.count.mockResolvedValue(0);
  db.listingCandidate.findMany.mockResolvedValue([]);
  db.listingCandidate.create.mockImplementation(async ({ data }) => ({
    ...data,
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
});
describe("candidate API", () => {
  it("requires login for all entry points", async () => {
    db.getAuthUser.mockResolvedValue(null);
    for (const res of [
      await POST(req("POST", input())),
      await GET(req("GET")),
      await GET_ONE(req("GET"), args),
      await PATCH(req("PATCH", {}), args),
      await DELETE(req("DELETE"), args),
      await GEOCODE(req("POST", { address: "京都市" })),
    ])
      expect(res.status).toBe(401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("requires same origin and rejects spoofed owner", async () => {
    expect(
      (await POST(req("POST", input(), "", "https://evil.example"))).status,
    ).toBe(403);
    expect(
      (await POST(req("POST", { ...input(), userId: otherId }))).status,
    ).toBe(400);
    expect(db.listingCandidate.create).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "recomputes existing board with classical=%s, never fetches reference",
    async (useClassical) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const p = input();
      p.context = { ...context, useClassical } as typeof context;
      const res = await POST(req("POST", p));
      expect(res.status).toBe(201);
      const data = db.listingCandidate.create.mock.calls[0][0].data;
      const direction = directionFromBearing(
        bearingBetween(35, 135, 35.4, 135.5),
        useClassical ? "traditional" : "physical",
      );
      const cell = computeDayKigaku(p.context)!.byDirection[direction];
      expect(data.direction).toBe(direction);
      expect(data.judgment).toMatchObject({
        tier: cell.tier,
        blocked: cell.blocked,
        doyouSatsu: cell.doyouSatsu,
      });
      expect(JSON.stringify(data)).not.toContain(context.birthDate);
      expect(data.userId).toBe(userId);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(fetch).not.toHaveBeenCalled();
      fetch.mockRestore();
    },
  );
  it("same request retries return the original row, different content conflicts", async () => {
    const p = input();
    await POST(req("POST", p));
    const row = db.listingCandidate.create.mock.calls[0][0].data;
    db.listingCandidate.findUnique.mockResolvedValue({ ...row, id });
    expect((await POST(req("POST", p))).status).toBe(200);
    expect((await POST(req("POST", { ...p, memo: "changed" }))).status).toBe(
      409,
    );
    expect(db.listingCandidate.create).toHaveBeenCalledTimes(1);
  });
  it("refuses municipality, same point and missing conditions", async () => {
    const p = input();
    expect(
      (
        await POST(
          req("POST", {
            ...p,
            target: { ...p.target, source: "municipality" },
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await POST(
          req("POST", { ...p, target: { ...p.target, lat: 35, lon: 135 } }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await POST(
          req("POST", { ...p, context: { ...p.context, birthDate: "" } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req("POST", {
            ...p,
            context: { ...p.context, targetDate: "2026-02-30" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(db.listingCandidate.create).not.toHaveBeenCalled();
  });
  it("checks capacity under the transaction lock", async () => {
    db.listingCandidate.count.mockResolvedValue(500);
    expect((await POST(req("POST", input()))).status).toBe(429);
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.listingCandidate.create).not.toHaveBeenCalled();
  });
  it("uses shared rate limit and rejects oversized input without echoing it", async () => {
    db.$queryRaw.mockResolvedValue([{ hits: 21 }]);
    const res = await POST(req("POST", input()));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    db.$queryRaw.mockResolvedValue([{ hits: 1 }]);
    const large = await POST(
      req("POST", { ...input(), memo: "private".repeat(4000) }),
    );
    expect(large.status).toBe(400);
    expect(await large.text()).not.toContain("private");
  });
  it("lists only the authenticated owner and never reads another owner's cursor", async () => {
    await GET(req("GET", undefined, `?userId=${otherId}`));
    expect(db.listingCandidate.findMany.mock.calls[0][0].where).toEqual({
      userId,
    });
    db.listingCandidate.findFirst.mockResolvedValue(null);
    expect(
      (
        await GET(
          req(
            "GET",
            undefined,
            `?cursor=${Buffer.from(id).toString("base64url")}`,
          ),
        )
      ).status,
    ).toBe(400);
    expect(db.listingCandidate.findFirst.mock.calls[0][0].where).toEqual({
      userId,
      id,
    });
  });
  it("get/update/delete hide other owner and missing rows identically", async () => {
    db.listingCandidate.findFirst.mockResolvedValue(null);
    db.listingCandidate.deleteMany.mockResolvedValue({ count: 0 });
    expect((await GET_ONE(req("GET"), args)).status).toBe(404);
    expect(
      (
        await PATCH(
          req("PATCH", { memo: "memo", updatedAt: "2026-09-21T00:00:00.000Z" }),
          args,
        )
      ).status,
    ).toBe(404);
    expect((await DELETE(req("DELETE"), args)).status).toBe(404);
    for (const call of db.listingCandidate.findFirst.mock.calls)
      expect(call[0].where).toEqual({ userId, id });
    expect(db.listingCandidate.deleteMany).toHaveBeenCalledWith({
      where: { userId, id },
    });
  });
  it("only memo/title can change and detects lost updates", async () => {
    db.listingCandidate.findFirst.mockResolvedValue({ id });
    db.listingCandidate.updateMany.mockResolvedValue({ count: 0 });
    expect(
      (
        await PATCH(
          req("PATCH", { lat: 35, updatedAt: "2026-09-21T00:00:00.000Z" }),
          args,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PATCH(
          req("PATCH", { memo: "memo", updatedAt: "2026-09-21T00:00:00.000Z" }),
          args,
        )
      ).status,
    ).toBe(409);
    expect(db.listingCandidate.updateMany.mock.calls[0][0].where).toMatchObject(
      { userId, id },
    );
  });
  it.each([
    "https://suumo.jp/",
    "https://www.homes.co.jp/",
    "https://www.shamaison.com/",
    "https://www.eheya.net/",
    "https://bit.ly/a",
    "javascript:alert(1)",
  ])("geocoder never forwards %s", async (address) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect((await GEOCODE(req("POST", { address }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("geocode is fail-closed until enabled, enabled path only uses GSI", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("LISTING_CANDIDATE_GSI_ENABLED", "false");
    expect(
      (await GEOCODE(req("POST", { address: "京都市中京区" }))).status,
    ).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("LISTING_CANDIDATE_GSI_ENABLED", "true");
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify([{ geometry: { coordinates: [135.7, 35] } }]),
      ),
    );
    const res = await GEOCODE(req("POST", { address: "京都市中京区" }));
    expect(res.status).toBe(200);
    expect(String(fetch.mock.calls[0][0])).toMatch(
      /^https:\/\/msearch.gsi.go.jp\//,
    );
    expect(await res.json()).toMatchObject({
      approximate: true,
      source: "gsi",
    });
    fetch.mockResolvedValue(new Response("[]"));
    expect(
      (await GEOCODE(req("POST", { address: "京都市中京区" }))).status,
    ).toBe(422);
    fetch.mockRejectedValue(new Error("network"));
    expect(
      (await GEOCODE(req("POST", { address: "京都市中京区" }))).status,
    ).toBe(503);
    vi.unstubAllEnvs();
    fetch.mockRestore();
  });
});

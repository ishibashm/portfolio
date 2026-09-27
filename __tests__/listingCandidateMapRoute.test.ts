// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const db = vi.hoisted(() => ({ getAuthUser: vi.fn(), $queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: db }));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: db.getAuthUser,
  toUserId: (u: { id: string }) => u.id,
}));
import { POST } from "@/app/api/relocation/candidates/geocode/batch/route";
import { GSI_ENDPOINT } from "@/lib/gsiGeocode";
import { LISTING_MAP_ADDRESS_CAP } from "@/lib/listingCandidateMap";
const request = (addresses: string[], origin = "https://example.com") =>
  new NextRequest(
    "https://example.com/api/relocation/candidates/geocode/batch",
    {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ addresses }),
    },
  );
const answer = () => Response.json([{ geometry: { coordinates: [135, 35] } }]);
beforeEach(() => {
  vi.stubEnv("LISTING_CANDIDATE_GSI_ENABLED", "true");
  db.getAuthUser.mockResolvedValue({ id: "owner" });
  db.$queryRaw.mockResolvedValue([{ hits: 1 }]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("requires authentication and same origin even when disabled", async () => {
  vi.stubEnv("LISTING_CANDIDATE_GSI_ENABLED", "false");
  db.getAuthUser.mockResolvedValue(null);
  expect((await POST(request(["架空市"]))).status).toBe(401);
  expect((await POST(request(["架空市"], "https://evil.example"))).status).toBe(
    403,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["", "false"])(
  "flag %s returns disabled without provider calls",
  async (flag) => {
    vi.stubEnv("LISTING_CANDIDATE_GSI_ENABLED", flag);
    const response = await POST(request(["架空市"]));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "GEOCODE_DISABLED" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("deduplicates normalized addresses per request, uses only GSI and throttles sequential calls", async () => {
  const times: number[] = [];
  let active = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    expect(String(url).startsWith(`${GSI_ENDPOINT}?q=`)).toBe(true);
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(active++).toBe(0);
    times.push(Date.now());
    await Promise.resolve();
    active--;
    return answer();
  });
  const res = await POST(
    request([" 架空市１丁目 ", "架空市1丁目", "架空市2丁目"]),
  );
  expect(res.status).toBe(200);
  expect((await res.json()).results).toEqual([
    { address: "架空市1丁目", point: { lat: 35, lon: 135 } },
    { address: "架空市2丁目", point: { lat: 35, lon: 135 } },
  ]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(240);
  await POST(request(["架空市1丁目"]));
  expect(fetch).toHaveBeenCalledTimes(3); // No cross-request address cache.
});
it("caps distinct addresses on the server", async () => {
  const res = await POST(
    request(Array.from({ length: 12 }, (_, i) => `架空市${i + 1}丁目`)),
  );
  const body = await res.json();
  expect(body.truncated).toBe(true);
  expect(body.results).toHaveLength(LISTING_MAP_ADDRESS_CAP);
  expect(fetch).toHaveBeenCalledTimes(LISTING_MAP_ADDRESS_CAP);
});
it("never fetches listing URLs; missing, overseas and failed results remain unresolved", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(
      Response.json([{ geometry: { coordinates: [0, 0] } }]),
    )
    .mockRejectedValueOnce(new Error("offline"));
  const res = await POST(
    request([
      "https://suumo.jp/chintai/1/",
      "架空市1丁目",
      "架空市2丁目",
      "架空市3丁目",
    ]),
  );
  expect(res.status).toBe(200);
  expect(
    (await res.json()).results.every((r: { point?: unknown }) => !r.point),
  ).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(3);
  for (const [url] of vi.mocked(fetch).mock.calls)
    expect(String(url)).toContain(GSI_ENDPOINT);
});
it("rejects invalid and oversized input before fetching", async () => {
  expect((await POST(request(["a".repeat(257)]))).status).toBe(400);
  expect((await POST(request(Array(201).fill("架空市")))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("honors the existing shared provider rate limit", async () => {
  db.$queryRaw
    .mockResolvedValueOnce([{ hits: 1 }])
    .mockResolvedValueOnce([{ hits: 31 }]);
  expect((await POST(request(["架空市"]))).status).toBe(429);
  expect(fetch).not.toHaveBeenCalled();
});
it("stops new lookups at the request deadline and preserves partial results", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(0);
  vi.mocked(fetch).mockImplementation(async () => {
    clock.mockReturnValue(31000);
    return answer();
  });
  const res = await POST(request(["架空市1丁目", "架空市2丁目"]));
  expect(await res.json()).toMatchObject({
    results: [
      { address: "架空市1丁目", point: { lat: 35, lon: 135 } },
      { address: "架空市2丁目" },
    ],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

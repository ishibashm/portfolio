// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { db, rows, prismaMock } from "./fortunePrismaMock";
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
import {
  fortuneLimits,
  fortuneRequest,
  fortuneSubject,
  reserveFortune,
  FORTUNE_WORST_YEN,
} from "@/lib/fortuneGuard";
import { createFortuneReportService } from "@/lib/fortuneReport";
const day = "2026-10-30";
const profile = { birthDate: "1990-05-15", lat: 35.68, lon: 139.76 };
beforeEach(() => {
  rows.length = 0;
  vi.clearAllMocks();
  vi.stubEnv("AI_FORTUNE_HTML_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
it("parses option B defaults, invalid values and zero", () => {
  expect(fortuneLimits({})).toEqual({
    daily: 50,
    monthly: 1000,
    budget: 300,
    user: 2,
    ip: 4,
  });
  for (const value of ["-1", "bad", "Infinity", "", "1.2"])
    expect(fortuneLimits({ AI_FORTUNE_DAILY_LIMIT: value }).daily).toBe(50);
  expect(
    fortuneLimits({
      AI_FORTUNE_DAILY_LIMIT: "0",
      AI_FORTUNE_MONTHLY_BUDGET_JPY: "0.5",
    }),
  ).toMatchObject({ daily: 0, budget: 0.5 });
});
it.each([
  "",
  "Googlebot",
  "bingbot",
  "crawler",
  "spider",
  "preview",
  "HeadlessChrome",
])("skips UA %s", (ua) => {
  expect(fortuneRequest(new Headers({ "user-agent": ua })).skip).toBe(true);
});
it.each([
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "purpose",
  "sec-purpose",
])("skips %s", (name) => {
  expect(
    fortuneRequest(new Headers({ "user-agent": "Mozilla", [name]: "prefetch" }))
      .skip,
  ).toBe(true);
});
it.each([
  "AI_FORTUNE_DAILY_LIMIT",
  "AI_FORTUNE_MONTHLY_LIMIT",
  "AI_FORTUNE_MONTHLY_BUDGET_JPY",
  "AI_FORTUNE_USER_DAILY_LIMIT",
  "AI_FORTUNE_IP_DAILY_LIMIT",
])("zero %s blocks generation", async (name) => {
  vi.stubEnv(name, "0");
  const generate = vi.fn();
  await createFortuneReportService(generate)("u", profile);
  expect(generate).not.toHaveBeenCalled();
  expect(db.apiUsage.create).not.toHaveBeenCalled();
});
it("counts previous days toward monthly caps and charges null usage conservatively", async () => {
  rows.push({
    id: "old",
    day: "2026-10-01",
    route: "ai-fortune-html",
    input_tokens: null,
    output_tokens: null,
  });
  vi.stubEnv("AI_FORTUNE_MONTHLY_LIMIT", "1");
  expect(await reserveFortune(day, "u", "hashed", "f")).toBeNull();
  vi.stubEnv("AI_FORTUNE_MONTHLY_LIMIT", "300");
  vi.stubEnv("AI_FORTUNE_MONTHLY_BUDGET_JPY", String(FORTUNE_WORST_YEN * 1.5));
  expect(await reserveFortune(day, "u", "hashed", "f")).toBeNull();
});
it.each(["read", "reserve", "lock"])(
  "fails closed on DB %s error",
  async (operation) => {
    const mock =
      operation === "read"
        ? db.apiUsage.findMany
        : operation === "reserve"
          ? db.apiUsage.create
          : db.$queryRaw;
    mock.mockRejectedValueOnce(new Error("private"));
    const generate = vi.fn();
    expect(
      (await createFortuneReportService(generate)("u", profile))?.srcdoc,
    ).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  },
);
it("reserves before generation, updates usage and caches; never stores raw IP", async () => {
  const request = fortuneRequest(
    new Headers({
      "user-agent": "Mozilla",
      "x-forwarded-for": "192.0.2.1, 10.0.0.1",
    }),
  );
  expect(request.ipHash).toBe(fortuneSubject("192.0.2.1"));
  const generate = vi.fn(async (_facts, record) => {
    expect(rows[0].input_tokens).toBeNull();
    await record({ inputTokens: 123, outputTokens: 45 });
    return "";
  });
  const service = createFortuneReportService(generate);
  await service("u", profile, new Date(), request);
  await service("u", profile, new Date(), request);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(rows[0]).toMatchObject({ input_tokens: 123, output_tokens: 45 });
  expect(JSON.stringify(rows)).not.toContain("192.0.2.1");
  await createFortuneReportService(generate)("u", profile, new Date(), request);
  expect(generate).toHaveBeenCalledTimes(1);
});
it("skips request before DB and fails to fallback on token-update error", async () => {
  const generate = vi.fn(async (_facts, record) => {
    await record({ inputTokens: 1, outputTokens: 1 });
    return "";
  });
  await createFortuneReportService(generate)("u", profile, new Date(), {
    skip: true,
    ipHash: "hash",
  });
  expect(db.apiUsage.findMany).not.toHaveBeenCalled();
  db.apiUsage.update.mockRejectedValueOnce(new Error("private"));
  expect(
    (await createFortuneReportService(generate)("u", profile))?.srcdoc,
  ).toBeNull();
  expect(rows[0].input_tokens).toBeNull();
});
it.each([
  "AI_FORTUNE_DAILY_LIMIT",
  "AI_FORTUNE_USER_DAILY_LIMIT",
  "AI_FORTUNE_IP_DAILY_LIMIT",
])("enforces populated %s across service instances", async (name) => {
  vi.stubEnv(name, "1");
  expect(await reserveFortune(day, "u", "ip-hash", "first")).not.toBeNull();
  expect(await reserveFortune(day, "u", "ip-hash", "different")).toBeNull();
  expect(rows).toHaveLength(1);
});
it("charges actual tokens when both counts are known", async () => {
  rows.push({
    id: "old",
    day,
    route: "ai-fortune-html",
    input_tokens: 1000000,
    output_tokens: 1000000,
  });
  vi.stubEnv("AI_FORTUNE_MONTHLY_BUDGET_JPY", "79.7");
  expect(await reserveFortune(day, "u", "ip-hash", "f")).toBeNull();
});

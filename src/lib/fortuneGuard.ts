import { createHash, createHmac } from "node:crypto";
import prisma from "@/lib/prisma";
import { MODEL_PRICES, tokensFromAiSdkUsage } from "./apiUsage";

export const FORTUNE_ROUTE = "ai-fortune-html";
export const MAX_FORTUNE_FACT_BYTES = 16000;
// Two SDK steps: allow 32k input tokens (facts, tool schema, prompt and
// repeated context) and 2 × 2200 output tokens. Missing usage stays reserved.
export const FORTUNE_WORST_YEN = (32000 * 15.934 + 4400 * 63.736) / 1e6;
export type FortuneUsage = { inputTokens?: number; outputTokens?: number };
export function fortuneLimits(
  env: Record<string, string | undefined> = process.env,
) {
  const read = (name: string, fallback: number, integer = true) => {
    const raw = env[name]?.trim();
    const n = raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 0 && (!integer || Number.isSafeInteger(n))
      ? n
      : fallback;
  };
  return {
    daily: read("AI_FORTUNE_DAILY_LIMIT", 20),
    monthly: read("AI_FORTUNE_MONTHLY_LIMIT", 300),
    budget: read("AI_FORTUNE_MONTHLY_BUDGET_JPY", 100, false),
    user: read("AI_FORTUNE_USER_DAILY_LIMIT", 2),
    ip: read("AI_FORTUNE_IP_DAILY_LIMIT", 4),
  };
}
export function fortuneSubject(value: string) {
  const secret = process.env.API_SECRET_KEY || process.env.NEXTAUTH_SECRET;
  return (
    secret
      ? createHmac("sha256", secret)
      : createHash("sha256").update("fortune-html-subject-v1:")
  )
    .update(value)
    .digest("hex")
    .slice(0, 32);
}
export function fortuneRequest(h: { get(name: string): string | null }) {
  const ua = h.get("user-agent")?.trim();
  return {
    skip:
      !ua ||
      /bot|crawler|spider|preview|headless/i.test(ua) ||
      h.get("next-router-prefetch") !== null ||
      h.get("next-router-segment-prefetch") !== null ||
      /prefetch/i.test(
        `${h.get("purpose") ?? ""} ${h.get("sec-purpose") ?? ""}`,
      ),
    ipHash: fortuneSubject(
      (
        h.get("x-forwarded-for")?.split(",")[0] ||
        h.get("x-real-ip") ||
        "unknown"
      ).trim(),
    ),
  };
}
export async function reserveFortune(
  day: string,
  userId: string,
  ipHash: string,
  inputHash: string,
) {
  const limits = fortuneLimits();
  const user = `:u:${fortuneSubject(userId)}:`;
  const ip = `i:${ipHash}:`;
  const route = `${FORTUNE_ROUTE}${user}${ip}f:${inputHash}`;
  // READ COMMITTED after a transaction-scoped global lock sees prior commits.
  // All fortune writers use this lock; no schema/unique index is required.
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(736194028)::text`;
      const rows = await tx.apiUsage.findMany({
        where: {
          day: { startsWith: day.slice(0, 7) },
          route: { startsWith: FORTUNE_ROUTE },
        },
        select: {
          day: true,
          route: true,
          input_tokens: true,
          output_tokens: true,
        },
      });
      const today = rows.filter((r) => r.day === day);
      const price = MODEL_PRICES.find(
        (p) => p.model === "gemini-2.5-flash-lite",
      )!;
      const spend = rows.reduce(
        (sum, r) =>
          sum +
          (r.input_tokens === null || r.output_tokens === null
            ? FORTUNE_WORST_YEN
            : (r.input_tokens * price.inputYenPerMTok! +
                r.output_tokens * price.outputYenPerMTok!) /
              1e6),
        0,
      );
      if (
        today.length >= limits.daily ||
        rows.length >= limits.monthly ||
        spend + FORTUNE_WORST_YEN > limits.budget ||
        today.filter((r) => r.route.includes(user)).length >= limits.user ||
        today.filter((r) => r.route.includes(ip)).length >= limits.ip ||
        today.some(
          (r) => r.route.includes(user) && r.route.endsWith(`f:${inputHash}`),
        )
      )
        return null;
      return tx.apiUsage.create({
        data: {
          day,
          provider: "google",
          model: "gemini-2.5-flash-lite",
          route,
          input_tokens: null,
          output_tokens: null,
        },
      });
    },
    { isolationLevel: "ReadCommitted" },
  );
}
export async function finishFortune(id: string, usage: FortuneUsage) {
  const tokens = tokensFromAiSdkUsage(usage);
  await prisma.apiUsage.update({
    where: { id },
    data: {
      input_tokens: tokens.inputTokens ?? null,
      output_tokens: tokens.outputTokens ?? null,
    },
  });
}

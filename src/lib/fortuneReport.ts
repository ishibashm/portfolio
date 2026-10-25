import { createHash } from "node:crypto";
import { calculateMcpDirections } from "./mcpDirections";
import { calculateTimeSlots, timeSlotsInputSchema } from "./timeSlots";
import { toJapanDateString } from "@/utils/japanDate";
import {
  buildFortuneSrcdoc,
  decorateFortuneHtml,
  fallbackFortuneHtml,
  type FortuneFact,
} from "./fortuneHtml";
import { fortuneHtmlEnabled } from "./mcpAgentConfig";

export const fortuneProfileSchema = timeSlotsInputSchema.pick({
  birthDate: true,
  lat: true,
  lon: true,
});
export type FortuneProfile = { birthDate: string; lat: number; lon: number };
export function fortuneFacts(
  profile: FortuneProfile,
  day: string,
): FortuneFact[] {
  const directions = calculateMcpDirections({
    birthDate: profile.birthDate,
    lon: profile.lon,
    date: day,
  });
  if (!directions.ok) throw new Error("FORTUNE_CALCULATION_UNAVAILABLE");
  const times = calculateTimeSlots({ ...profile, date: day });
  return [
    { label: "対象日（日本時間）", value: directions.payload.date },
    { label: "本命星", value: String(directions.payload.honmeiStar) },
    ...directions.payload.directions.map((d) => ({
      label: d.label,
      value: `${d.tier} / ${d.status}`,
    })),
    ...times.slots.map((s) => ({
      label: `${s.branch}（${s.start} ～ ${s.end}）`,
      value: s.label,
    })),
  ];
}

export type FortuneReportData = {
  facts: FortuneFact[];
  srcdoc: string | null;
  fallbackHtml: string;
};
type Entry = { day: string; result: Promise<FortuneReportData> };
/** Process-local, bounded state. Single-flight includes fallback results. */
export function createFortuneReportService(
  generate: (facts: FortuneFact[]) => Promise<string>,
) {
  const cache = new Map<string, Entry>();
  const users = new Map<string, number>();
  let rateDay = "";
  let globalCalls = 0;
  return async (
    userId: string,
    profile: FortuneProfile,
    now = new Date(),
  ): Promise<FortuneReportData | null> => {
    if (!fortuneHtmlEnabled()) return null;
    const day = toJapanDateString(now);
    if (rateDay !== day) {
      rateDay = day;
      globalCalls = 0;
      users.clear();
      cache.clear();
    }
    const key = createHash("sha256")
      .update(JSON.stringify([userId, profile, day]))
      .digest("hex");
    const hit = cache.get(key);
    if (hit) return hit.result;
    const facts = fortuneFacts(profile, day);
    const fallback: FortuneReportData = {
      facts,
      srcdoc: null,
      fallbackHtml: fallbackFortuneHtml(facts),
    };
    // At most 20 generations per process/JST day, 2 per user. No retries.
    if (globalCalls >= 20 || (users.get(userId) ?? 0) >= 2) return fallback;
    globalCalls++;
    users.set(userId, (users.get(userId) ?? 0) + 1);
    const result = (async () => {
      try {
        const html = decorateFortuneHtml(await generate(facts), facts);
        return html
          ? { ...fallback, srcdoc: buildFortuneSrcdoc(html) }
          : fallback;
      } catch {
        // Never log SDK errors: they may contain prompts, credentials or profile data.
        return fallback;
      }
    })();
    cache.set(key, { day, result });
    return result;
  };
}

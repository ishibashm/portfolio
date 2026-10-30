import {
  reserveFortune,
  finishFortune,
  MAX_FORTUNE_FACT_BYTES,
  type FortuneUsage,
} from "./fortuneGuard";
import { directionLabelName } from "./directionLabels";
import { TIER_JP } from "@/utils/tierDisplay";
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
const japanDate = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const japanDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
    {
      label: "対象日（日本時間）",
      value: japanDate.format(
        new Date(directions.payload.date + "T00:00:00+09:00"),
      ),
    },
    { label: "本命星", value: String(directions.payload.honmeiStar) },
    ...directions.payload.directions.map((d) => ({
      label: d.label,
      value: `${TIER_JP[d.tier]} / ${directionLabelName(d.status)}`,
    })),
    ...times.slots.map((s) => ({
      label: `${s.branch}（${japanDateTime.format(new Date(s.start))} ～ ${japanDateTime.format(new Date(s.end))}・日本時間）`,
      value: s.label,
    })),
  ];
}

export type FortuneReportData = {
  facts: FortuneFact[];
  srcdoc: string | null;
  fallbackHtml: string;
  note?: string;
};
type Entry = { day: string; result: Promise<FortuneReportData> };
/** Process-local cache + DB-backed global caps (fortuneGuard). Single-flight includes fallback results. */
export function createFortuneReportService(
  generate: (
    facts: FortuneFact[],
    recordUsage: (usage: FortuneUsage) => Promise<void>,
  ) => Promise<string>,
) {
  const cache = new Map<string, Entry>();
  let rateDay = "";
  return async (
    userId: string,
    profile: FortuneProfile,
    now = new Date(),
    request = { skip: false, ipHash: "unknown" },
  ): Promise<FortuneReportData | null> => {
    if (!fortuneHtmlEnabled()) return null;
    const day = toJapanDateString(now);
    if (rateDay !== day) {
      rateDay = day;
      cache.clear();
    }
    const key = createHash("sha256")
      .update(JSON.stringify([userId, profile, day]))
      .digest("hex");
    const hit = !request.skip && cache.get(key);
    if (hit) return hit.result;
    const facts = fortuneFacts(profile, day);
    const fallback: FortuneReportData = {
      facts,
      srcdoc: null,
      fallbackHtml: fallbackFortuneHtml(facts),
    };
    if (
      request.skip ||
      Buffer.byteLength(JSON.stringify(facts)) > MAX_FORTUNE_FACT_BYTES
    )
      return fallback;
    const result = (async () => {
      try {
        const reservation = await reserveFortune(
          day,
          userId,
          request.ipHash,
          key,
        );
        if (!reservation)
          return {
            ...fallback,
            note: "本日のAI装飾は上限に達したため、計算結果のみ表示しています。",
          };
        const html = decorateFortuneHtml(
          await generate(facts, (usage) =>
            finishFortune(reservation.id, usage),
          ),
          facts,
        );
        return html
          ? { ...fallback, srcdoc: buildFortuneSrcdoc(html) }
          : fallback;
      } catch {
        // Never log SDK errors: they may contain prompts, credentials or profile data.
        return fallback;
      }
    })();
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { day, result });
    return result;
  };
}

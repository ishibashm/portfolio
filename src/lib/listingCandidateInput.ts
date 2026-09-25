import { listingDetailsSchema } from "./listingDetails";
import { z } from "zod";
import { isInJapan } from "@/lib/japanBounds";

/** No network: a listing URL is only a user-operated reference link. */
export function normalizeCandidateUrl(raw: string): string | null {
  if (raw.length > 2048 || /[\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    // Reject all IP literals, local names and non-standard ports; no DNS lookup.
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      !host.includes(".") ||
      host.endsWith(".") ||
      /[\[\]:]/.test(host) ||
      /^\d+(\.\d+)*$/.test(host) ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
      (u.port && u.port !== "443")
    )
      return null;
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^(fbclid|gclid|msclkid)$/i.test(key))
        u.searchParams.delete(key);
      else if (
        /token|auth|session|secret|password|email|signature|credential|api.?key|redirect|return.?url/i.test(
          key,
        )
      )
        return null;
    }
    const decoded = decodeURIComponent(u.pathname + u.search);
    if (
      /[\u0000-\u001f\u007f@]/.test(decoded) ||
      /bearer|eyJ[A-Za-z0-9_-]{10,}/i.test(decoded)
    )
      return null;
    return u.toString().length <= 2048 ? u.toString() : null;
  } catch {
    return null;
  }
}

export function classifyCandidateInput(
  raw: string,
):
  | { kind: "url"; url: string }
  | { kind: "coordinates"; lat: number; lon: number }
  | { kind: "address"; address: string }
  | { kind: "invalid" } {
  const text = raw.trim();
  if (!text) return { kind: "invalid" };
  if (
    /^[a-z][a-z0-9+.-]*:|\/\/|www\.|[a-z0-9-]+\.(?:com|jp|net|org)\b/i.test(
      text,
    )
  ) {
    const url = normalizeCandidateUrl(text);
    return url ? { kind: "url", url } : { kind: "invalid" };
  }
  const m = text.match(/^(-?\d+(?:\.\d+)?)\s*[,、\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const lat = Number(m[1]),
      lon = Number(m[2]);
    return isInJapan(lat, lon)
      ? { kind: "coordinates", lat, lon }
      : { kind: "invalid" };
  }
  if (/^(?:NaN|Infinity|-Infinity)/i.test(text)) return { kind: "invalid" };
  // One address only. Reject names/contact data/room labels instead of guessing what to remove.
  if (
    text.length > 256 ||
    /[\r\n<>@]|https?:|\d{2,4}-\d{2,4}-\d{4}|号室|様|氏名|電話/.test(text)
  )
    return { kind: "invalid" };
  return { kind: "address", address: text.normalize("NFKC") };
}
const point = z
  .object({ lat: z.number().finite(), lon: z.number().finite() })
  .refine((p) => isInJapan(p.lat, p.lon));
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
export const candidateContextSchema = z
  .object({
    baseLat: z.string().min(1).max(30),
    baseLon: z.string().min(1).max(30),
    birthDate: z.union([date, z.iso.datetime({ offset: true })]),
    targetDate: date,
    useClassical: z.boolean(),
    involuntaryMove: z.boolean(),
    tenchusatsuMode: z.enum([
      "strict",
      "month_day",
      "day_only",
      "weaken",
      "off",
    ]),
    directionFilterMode: z.enum([
      "composite",
      "personal_kigaku",
      "personal_bazi",
      "environmental",
      "personal_kigaku_environmental",
      "personal_kigaku_bazi",
      "environmental_bazi",
    ]),
  })
  .strict()
  .refine((c) => isInJapan(Number(c.baseLat), Number(c.baseLon)));
export const candidateTextSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  memo: z.string().trim().max(1000).nullable().optional(),
});
export const candidateCreateSchema = candidateTextSchema
  .extend({
    details: listingDetailsSchema.optional(),
    requestKey: z.uuid(),
    url: z
      .string()
      .transform((s, ctx) => {
        const result = normalizeCandidateUrl(s);
        if (!result) {
          ctx.addIssue({ code: "custom", message: "URL" });
          return z.NEVER;
        }
        return result;
      })
      .nullable()
      .optional(),
    target: z
      .object({
        lat: z.number().finite(),
        lon: z.number().finite(),
        source: z.enum([
          "pin",
          "coordinates",
          "gsi",
          "normalize",
          "nominatim",
          "municipality",
        ]),
        approximate: z.boolean(),
        confirmed: z.literal(true),
      })
      .strict()
      .refine((p) => point.safeParse(p).success),
    context: candidateContextSchema,
  })
  .strict();
export type CandidateInput = z.infer<typeof candidateCreateSchema>;

import { z } from "zod";

export const GUIDANCE_DIRECTIONS = {
  N: "北",
  NE: "北東",
  E: "東",
  SE: "南東",
  S: "南",
  SW: "南西",
  W: "西",
  NW: "北西",
} as const;
export type GuidanceDirection = keyof typeof GUIDANCE_DIRECTIONS;
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const parsed = new Date(v + "T00:00:00Z");
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === v &&
      v >= "1900-01-01" &&
      v <= "2100-12-01"
    );
  });
export const guidanceValuesSchema = z
  .object({
    birthDate: date.optional(),
    municipality: z.string().trim().min(1).max(80).optional(),
    date: date.optional(),
    direction: z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]).optional(),
  })
  .strict();
export type GuidanceValues = z.infer<typeof guidanceValuesSchema>;
export const GUIDANCE_FIELDS = {
  birthDate: "生年月日",
  municipality: "出発地の市区町村",
  date: "検討する日",
  direction: "相談したい方位",
} as const;
export type GuidanceField = keyof GuidanceValues;
export type GuidanceIntent = "move" | "days" | "towns" | "star";
export interface GuidanceLink {
  label: string;
  href: string;
}
export interface GuidanceCard {
  intent: GuidanceIntent;
  values: GuidanceValues;
  fields: GuidanceField[];
  links: GuidanceLink[];
  candidates?: { code: string; name: string }[];
}
export interface GuidanceSource {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
}
const REQUIRED: Record<GuidanceIntent, GuidanceField[]> = {
  move: ["birthDate", "municipality", "date", "direction"],
  days: ["birthDate", "municipality", "date", "direction"],
  towns: ["municipality", "direction"],
  star: ["birthDate"],
};
export function guidanceIntent(text: string): GuidanceIntent | undefined {
  if (/記事|意味|とは|仕組み|考え方/.test(text)) return;
  if (/吉日|日取り/.test(text)) return "days";
  if (/引越|引っ越|吉方位/.test(text)) return "move";
  if (/街|市区町村/.test(text)) return "towns";
  if (/本命星/.test(text)) return "star";
}
export function guidancePlan(
  intent: GuidanceIntent,
  values: GuidanceValues,
): GuidanceCard {
  return {
    intent,
    values,
    fields: REQUIRED[intent].filter((key) => !values[key]).slice(0, 2),
    links: [],
  };
}
export function validGuidanceDate(value: unknown): value is string {
  return date.safeParse(value).success;
}
export function guidanceDirection(text: string): GuidanceDirection | undefined {
  const found = [
    ...text.matchAll(
      /(?:^|[\s、。:：]|から|は|方位)(北東|南東|南西|北西|北|東|南|西)(?=の|へ|に|で|を|が|方面|方位|[\s、。]|$)/g,
    ),
  ].at(-1)?.[1];
  return Object.entries(GUIDANCE_DIRECTIONS).find(
    ([, label]) => label === found,
  )?.[0] as GuidanceDirection | undefined;
}
/** Only explicit user-authored labels are read. Never infer a birthday from a moving date. */
export function guidanceValuesFromText(text: string): GuidanceValues {
  const values: GuidanceValues = {};
  const normalized = text
    .normalize("NFKC")
    .replace(
      /(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:日)?/g,
      (_, y: string, m: string, d: string) =>
        `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
    );
  for (const line of normalized.split(/[\n。]/)) {
    const dates = line.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    if (dates.length === 1 && validGuidanceDate(dates[0])) {
      if (/生年月日|生まれ|誕生日/.test(line)) values.birthDate = dates[0];
      else if (/予定|検討|引越|引っ越|日取り/.test(line))
        values.date = dates[0];
    }
    const city = line.match(
      /(?:出発地[：:\s]*|^)([一-龯ぁ-んァ-ヶー]+(?:市[一-龯ぁ-んァ-ヶー]*区|市|区|町|村))(?=から|[、\s。]|$)/,
    )?.[1];
    if (city) values.municipality = city;
  }
  values.direction = guidanceDirection(text);
  return values;
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
const originSchema = z.object({
  code: z.string().regex(/^\d{5}$/),
  name: z.string(),
  lat: z.number().min(20).max(46),
  lon: z.number().min(122).max(154),
});
/** A location URL uses only a municipality's public representative point from tool output. */
export function guidanceOrigin(value: unknown) {
  return originSchema.safeParse(value);
}
export function guidanceLinks(
  values: GuidanceValues,
  sources: GuidanceSource[],
): GuidanceLink[] {
  const origin = sources
    .flatMap((source) =>
      source.tool === "search_municipality"
        ? records(record(source.output).results)
        : source.tool === "area_directions"
          ? [record(record(source.output).origin)]
          : [],
    )
    .map(guidanceOrigin)
    .find((r) => r.success && r.data.name === values.municipality);
  if (!origin?.success || !values.direction) return [];
  const links: GuidanceLink[] = [];
  const add = (day?: string) => {
    const query = new URLSearchParams({
      baseLat: String(origin.data.lat),
      baseLon: String(origin.data.lon),
      direction: values.direction!,
    });
    if (day) query.set("targetDate", day);
    links.push({
      label: day
        ? `${day}・${GUIDANCE_DIRECTIONS[values.direction!]}の街を見る`
        : `${GUIDANCE_DIRECTIONS[values.direction!]}の街を見る`,
      href: `/relocation/arbitrage?${query}`,
    });
  };
  for (const source of sources) {
    const output = record(source.output);
    if (
      source.tool === "judge_directions" &&
      validGuidanceDate(output.date) &&
      output.date === values.date &&
      source.input.birthDate === values.birthDate &&
      source.input.lon === origin.data.lon &&
      records(output.directions).some((d) => d.direction === values.direction)
    )
      add(output.date);
    if (
      source.tool === "find_auspicious_days" &&
      source.input.birthDate === values.birthDate &&
      source.input.lon === origin.data.lon
    ) {
      const direction = records(output.directions).find(
        (d) => d.direction === values.direction,
      );
      for (const day of records(direction?.bestDays).slice(0, 3))
        if (validGuidanceDate(day.date)) add(day.date);
    }
    if (
      source.tool === "area_directions" &&
      record(output.origin).code === origin.data.code &&
      records(output.directions).some(
        (d) => d.direction === values.direction,
      ) &&
      !values.date
    )
      add();
  }
  return [...new Map(links.map((link) => [link.href, link])).values()].slice(
    0,
    3,
  );
}

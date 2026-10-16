import { z } from "zod";

export const sitePathSchema = z
  .string()
  .max(500)
  .refine((href) => {
    if (
      !/^(\/(?!\/)|\.{1,2}\/|#|https:\/\/cloud-palette\.com\/)/.test(href) ||
      /[\\\s<>\u0000-\u001f\u007f]/.test(href)
    )
      return false;
    try {
      return (
        new URL(href, "https://cloud-palette.com").origin ===
        "https://cloud-palette.com"
      );
    } catch {
      return false;
    }
  });
const plain = z
  .string()
  .min(1)
  .max(400)
  .refine((s) => !/<[^>]*>|\bon\w+\s*=/i.test(s));
const direction = z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const town = z
  .object({
    code: z.string().regex(/^\d{5}$/),
    name: plain,
    pref: plain.optional(),
    rentPerSqm: z.number().finite().nonnegative().optional(),
    prefectureRank: z.number().int().positive().optional(),
    url: sitePathSchema,
  })
  .strict();
export const answerBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("compass"),
      date: plain.optional(),
      directions: z
        .array(
          z
            .object({
              direction,
              label: plain,
              status: plain,
              tier: z.enum(["S", "A", "B", "C", "D", "X"]).optional(),
            })
            .strict(),
        )
        .max(8),
    })
    .strict(),
  z
    .object({
      type: z.literal("towns"),
      towns: z.array(town).max(100),
      direction: direction.optional(),
      label: plain.optional(),
      remaining: z.number().int().nonnegative().optional(),
      moreUrl: sitePathSchema.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("rentTable"), towns: z.array(town).max(100) })
    .strict(),
  z
    .object({
      type: z.literal("days"),
      days: z
        .array(
          z.object({ date: z.iso.date(), direction, label: plain }).strict(),
        )
        .max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("articles"),
      articles: z
        .array(
          z
            .object({ title: plain, description: plain, url: sitePathSchema })
            .strict(),
        )
        .max(10),
    })
    .strict(),
  z.object({ type: z.literal("callout"), text: plain }).strict(),
  z.object({ type: z.literal("text"), text: z.string().max(12000) }).strict(),
]);
export type AnswerBlock = z.infer<typeof answerBlockSchema>;
export function parseAnswerBlocks(value: unknown): AnswerBlock[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    const parsed = answerBlockSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
export const showBlocksSchema = z
  .object({
    blocks: z
      .array(
        z
          .object({
            type: z.enum([
              "compass",
              "towns",
              "days",
              "rentTable",
              "articles",
              "text",
              "callout",
            ]),
            ids: z.array(z.string().min(1).max(200)).max(20),
            text: plain
              .refine(
                (s) => !/[0-9０-９]/.test(s),
                "数値は道具結果のブロックで表示してください。",
              )
              .optional(),
          })
          .strict()
          .refine((b) =>
            b.type === "callout"
              ? !!b.text && b.ids.length === 0
              : b.text === undefined,
          ),
      )
      .max(20),
  })
  .strict();

/** Parsed schemas give stable property order, including across NDJSON events. */
export function uniqueAnswerBlocks(
  blocks: AnswerBlock[],
  seen = new Set<string>(),
): AnswerBlock[] {
  return blocks.filter((block) => {
    const key = JSON.stringify(block);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Apply the card budget across the entire answer, including multiple tool results. */
export function limitTownCards(blocks: AnswerBlock[]): AnswerBlock[] {
  let remaining = 18;
  const byDirection = new Map<string, number>();
  return blocks.map((block) => {
    if (block.type !== "towns") return block;
    const allowance = block.direction
      ? (byDirection.get(block.direction) ?? 6)
      : 6;
    const towns = block.towns.slice(0, Math.min(remaining, allowance));
    remaining -= towns.length;
    if (block.direction)
      byDirection.set(block.direction, allowance - towns.length);
    return {
      ...block,
      towns,
      ...(block.moreUrl
        ? {
            remaining:
              (block.remaining ?? 0) + block.towns.length - towns.length,
          }
        : {}),
    };
  });
}

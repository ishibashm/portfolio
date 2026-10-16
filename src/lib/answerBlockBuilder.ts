import { z } from "zod";
import {
  parseAnswerBlocks,
  showBlocksSchema,
  type AnswerBlock,
} from "./answerBlocks";

const record = z.record(z.string(), z.unknown());
function obj(v: unknown): Record<string, unknown> {
  const r = record.safeParse(v);
  return r.success ? r.data : {};
}
function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(obj) : [];
}
/** Only actual tool output enters these projections; no model-supplied numbers. */
export function blocksFromTool(tool: string, output: unknown): AnswerBlock[] {
  const data = obj(output);
  if (tool === "judge_directions")
    return parseAnswerBlocks([
      {
        type: "compass",
        date: data.date,
        directions: rows(data.directions).map((d) => ({
          direction: d.direction,
          label: d.label,
          status: d.status,
          tier: d.tier,
        })),
      },
    ]);
  if (tool === "find_auspicious_days")
    return parseAnswerBlocks([
      {
        type: "days",
        days: rows(data.directions)
          .flatMap((d) =>
            rows(d.bestDays).map((day) => ({
              date: day.date,
              direction: d.direction,
              label: d.label,
            })),
          )
          .slice(0, 100),
      },
    ]);
  if (
    ["search_municipality", "area_directions", "prefecture_summary"].includes(
      tool,
    )
  ) {
    const source =
      tool === "search_municipality"
        ? rows(data.results)
        : tool === "area_directions"
          ? rows(data.directions).flatMap((d) => rows(d.nearest))
          : rows(data.byDirection).flatMap((d) => rows(d.municipalities));
    const towns = source
      .slice(0, 100)
      .map((t) => ({
        code: t.code,
        name: t.name,
        pref:
          t.pref ??
          data.pref ??
          (typeof t.name === "string"
            ? t.name.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/)?.[0]
            : undefined),
        ...(typeof t.rentPerSqm === "number"
          ? { rentPerSqm: t.rentPerSqm }
          : {}),
        ...(typeof t.prefectureRank === "number"
          ? { prefectureRank: t.prefectureRank }
          : {}),
        url: `/houi/area/${t.code}`,
      }));
    return towns.length
      ? parseAnswerBlocks([
          { type: "towns", towns },
          {
            type: "rentTable",
            towns: towns.filter((t) => t.rentPerSqm !== undefined),
          },
        ])
      : [];
  }
  if (tool === "search_articles" || tool === "get_article") {
    const articles = (
      tool === "search_articles"
        ? rows(data.articles)
        : data.found === true
          ? [data]
          : []
    )
      .filter(
        (a) =>
          typeof a.slug === "string" &&
          /^[a-z0-9][a-z0-9-]{0,119}$/.test(a.slug),
      )
      .map((a) => ({
        title: a.title,
        description: a.description,
        url: `/blog/${a.slug}`,
      }));
    return articles.length
      ? parseAnswerBlocks([{ type: "articles", articles }])
      : [];
  }
  return [];
}
export type BlockSources = Map<string, { tool: string; output: unknown }>;
export function selectBlocks(
  input: unknown,
  sources: BlockSources,
): AnswerBlock[] {
  const selection = showBlocksSchema.parse(input);
  // Validate the entire selection before emitting anything.
  for (const b of selection.blocks)
    for (const id of b.ids)
      if (!sources.has(id)) throw new Error("未知の道具呼び出しidです。");
  return selection.blocks.flatMap((b) =>
    b.type === "callout"
      ? parseAnswerBlocks([{ type: "callout", text: b.text }])
      : b.ids.flatMap((id) => {
          const s = sources.get(id)!;
          return blocksFromTool(s.tool, s.output).filter(
            (block) => block.type === b.type,
          );
        }),
  );
}

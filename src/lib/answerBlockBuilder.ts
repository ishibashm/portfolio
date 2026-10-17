import { z } from "zod";
import {
  parseAnswerBlocks,
  uniqueAnswerBlocks,
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
export function blocksFromTool(
  tool: string,
  output: unknown,
  sources: BlockSources = new Map(),
): AnswerBlock[] {
  const data = obj(output);
  if (tool === "area_directions") {
    const judgment = [...sources.values()]
      .reverse()
      .find((s) => s.tool === "judge_directions");
    const favorable = new Set(
      rows(obj(judgment?.output).directions)
        .filter((d) =>
          [
            "OPTIMAL",
            "OPTIMAL_REGULAR",
            "OPTIMAL_BOOST",
            "大吉",
            "吉",
          ].includes(String(d.status)),
        )
        .map((d) => d.direction),
    );
    let budget = 18;
    return rows(data.directions)
      .filter((d) => favorable.has(d.direction))
      .flatMap((d) => {
        const candidates = rows(d.nearest);
        const towns = blocksFromTool("search_municipality", {
          results: candidates.slice(0, Math.min(6, budget)),
        }).find((b) => b.type === "towns");
        const shown = towns?.type === "towns" ? towns.towns : [];
        budget -= shown.length;
        const total = typeof d.count === "number" ? d.count : candidates.length;
        const origin = obj(data.origin);
        return parseAnswerBlocks([
          {
            type: "towns",
            towns: shown,
            direction: d.direction,
            label: d.label,
            remaining: Math.max(0, total - shown.length),
            moreUrl:
              typeof origin.code === "string" && /^\d{5}$/.test(origin.code)
                ? `/houi/area/${origin.code}`
                : "/houi/area",
          },
        ]);
      });
  }
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
  if (["search_municipality", "prefecture_summary"].includes(tool)) {
    const source =
      tool === "search_municipality"
        ? rows(data.results)
        : rows(data.byDirection).flatMap((d) => rows(d.municipalities));
    const towns = source.slice(0, 100).map((t) => ({
      code: t.code,
      name: t.name,
      pref:
        t.pref ??
        data.pref ??
        (typeof t.name === "string"
          ? t.name.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/)?.[0]
          : undefined),
      ...(typeof t.rentPerSqm === "number" ? { rentPerSqm: t.rentPerSqm } : {}),
      ...(typeof t.prefectureRank === "number"
        ? { prefectureRank: t.prefectureRank }
        : {}),
      url: `/houi/area/${t.code}`,
    }));
    return towns.length
      ? parseAnswerBlocks([
          { type: "towns", towns },
          ...(towns.some((t) => t.rentPerSqm !== undefined)
            ? [
                {
                  type: "rentTable",
                  towns: towns.filter((t) => t.rentPerSqm !== undefined),
                },
              ]
            : []),
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
        url:
          a.kind === "glossary"
            ? "/guide/glossary"
            : a.kind === "spec"
              ? "/llms.txt"
              : `/blog/${a.slug}`,
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
  return uniqueAnswerBlocks(
    selection.blocks.flatMap((b) =>
      b.type === "callout"
        ? parseAnswerBlocks([{ type: "callout", text: b.text }])
        : b.ids.flatMap((id) => {
            const s = sources.get(id)!;
            return blocksFromTool(s.tool, s.output, sources).filter(
              (block) => block.type === b.type,
            );
          }),
    ),
  );
}

import {
  guidanceIntent,
  guidancePlan,
  guidanceLinks,
  guidanceValuesFromText,
  guidanceValuesSchema,
  guidanceOrigin,
  record,
  records,
  validGuidanceDate,
  type GuidanceCard,
  type GuidanceSource,
  type GuidanceValues,
  type GuidanceIntent,
} from "./askGuidance";
import type { ChainCaller } from "./mcpChain";
import { contentYears } from "./kigakuContent";
import { toJapanDateString } from "@/utils/japanDate";

function resultCard(
  intent: GuidanceIntent,
  values: GuidanceValues,
  sources: GuidanceSource[],
): GuidanceCard {
  const card = guidancePlan(intent, values);
  if (card.fields.length) return card;
  if (intent === "star") {
    const result = sources.find((s) => s.tool === "get_honmei_star");
    const star = record(result?.output).honmeiStar;
    const year = Number(toJapanDateString(new Date()).slice(0, 4));
    if (
      typeof star === "number" &&
      Number.isInteger(star) &&
      star >= 1 &&
      star <= 9 &&
      contentYears().includes(year)
    ) {
      card.links = [
        { label: "この本命星の吉方位を見る", href: `/houi/${year}/${star}` },
      ];
    }
  } else card.links = guidanceLinks(values, sources);
  return card;
}

/** Called only with server-observed executions and user-authored history/profile data. */
export function guidanceFromResults(
  question: string,
  userText: string,
  sources: GuidanceSource[],
  person?: { birthDate?: string; residence?: string },
): GuidanceCard | undefined {
  const intent =
    guidanceIntent(question) ??
    (/記事|意味|とは|仕組み|考え方/.test(question)
      ? undefined
      : sources.some((s) => s.tool === "find_auspicious_days")
        ? "days"
        : sources.some((s) => s.tool === "judge_directions")
          ? "move"
          : sources.some((s) => s.tool === "area_directions")
            ? "towns"
            : sources.some((s) => s.tool === "get_honmei_star")
              ? "star"
              : undefined);
  if (!intent) return;
  const values = guidanceValuesFromText(userText);
  if (person?.birthDate && validGuidanceDate(person.birthDate))
    values.birthDate ??= person.birthDate;
  if (person?.residence) values.municipality ??= person.residence;
  for (const source of sources) {
    if (validGuidanceDate(source.input.birthDate))
      values.birthDate = source.input.birthDate;
    if (
      source.tool === "judge_directions" &&
      validGuidanceDate(record(source.output).date)
    )
      values.date = record(source.output).date as string;
    if (source.tool === "find_auspicious_days") {
      const from = record(source.output).from ?? source.input.from;
      if (validGuidanceDate(from)) values.date = from;
    }
    const origin =
      source.tool === "area_directions"
        ? guidanceOrigin(record(source.output).origin)
        : null;
    if (origin?.success) values.municipality = origin.data.name;
    if (source.tool === "search_municipality") {
      const candidates = records(record(source.output).results)
        .map(guidanceOrigin)
        .filter((r) => r.success);
      const calculation = sources.find((s) =>
        ["judge_directions", "find_auspicious_days"].includes(s.tool),
      );
      const matching = calculation
        ? candidates.filter(
            (r) => r.success && r.data.lon === calculation.input.lon,
          )
        : candidates;
      const selected =
        matching.length === 1
          ? matching[0]
          : matching.find(
              (r) => r.success && r.data.name === values.municipality,
            );
      if (selected?.success) values.municipality = selected.data.name;
    }
  }
  const birthdays = new Set(
    sources.map((s) => s.input.birthDate).filter(validGuidanceDate),
  );
  if (birthdays.size > 1) delete values.birthDate;
  const valid = guidanceValuesSchema.safeParse(values);
  return resultCard(intent, valid.success ? valid.data : {}, sources);
}

/** A form continuation never calls a model; URLs come from the fresh tool results. */
export async function resolveGuidance(
  intent: GuidanceIntent,
  values: GuidanceValues,
  call: ChainCaller,
  signal: AbortSignal,
  searchOnly = false,
): Promise<GuidanceCard> {
  const card = guidancePlan(intent, values);
  if (searchOnly && !values.municipality) return card;
  const sources: GuidanceSource[] = [];
  const execute = async (tool: string, input: Record<string, unknown>) => {
    const output = await call(tool, input, signal, 8000);
    sources.push({ tool, input, output });
    return record(output);
  };
  if (values.municipality && (searchOnly || !card.fields.length)) {
    const output = await execute("search_municipality", {
      query: values.municipality,
      limit: 10,
    });
    const candidates = records(output.results)
      .map(guidanceOrigin)
      .flatMap((r) => (r.success ? [r.data] : []));
    const origin =
      candidates.find((c) => c.name === values.municipality) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (searchOnly || !origin)
      return {
        ...card,
        fields: ["municipality"],
        candidates: candidates.map(({ code, name }) => ({ code, name })),
      };
    values = { ...values, municipality: origin.name };
    if (intent === "towns")
      await execute("area_directions", { code: origin.code, perDirection: 1 });
    if (intent === "move")
      await execute("judge_directions", {
        birthDate: values.birthDate,
        lon: origin.lon,
        date: values.date,
      });
    if (intent === "days")
      await execute("find_auspicious_days", {
        birthDate: values.birthDate,
        lon: origin.lon,
        from: values.date,
        days: 30,
        maxDaysPerDirection: 3,
      });
  }
  if (card.fields.length) return card;
  if (intent === "star")
    await execute("get_honmei_star", { birthDate: values.birthDate });
  return resultCard(intent, values, sources);
}

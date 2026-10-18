import {
  guidanceIntent,
  guidanceValuesFromText,
  record,
  records,
  validGuidanceDate,
  type GuidanceSource,
} from "./askGuidance";
import { needsAgentBirth, needsAgentOrigin } from "./agentInput";

export type AnswerFieldId = "birthYear" | "origin" | "period" | "conditions";
export interface AskOrigin {
  lat: number;
  lon: number;
  code?: string;
  name?: string;
}
type Person = { birthDate?: string; residence?: string; origin?: AskOrigin };

export function isAskConsultation(text: string): boolean {
  const intent = guidanceIntent(text);
  return (
    intent === "move" ||
    intent === "days" ||
    intent === "towns" ||
    needsAgentBirth(text) ||
    needsAgentOrigin(text)
  );
}

/** Birthdays are never interpreted as a requested calculation date. */
export function explicitConsultationDate(text: string): string | undefined {
  const lines = text.normalize("NFKC").split(/[\n。]/);
  for (const line of lines.reverse()) {
    if (/生年月日|生まれ|誕生日/.test(line)) continue;
    const match = line.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);
    if (!match) continue;
    const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (validGuidanceDate(date)) return date;
  }
}

export function askAnswerFields(
  text: string,
  people: Person[] = [],
  sources: GuidanceSource[] = [],
): AnswerFieldId[] {
  const intent = guidanceIntent(text);
  if (!["move", "days", "towns"].includes(intent ?? "")) return [];
  const values = guidanceValuesFromText(text);
  const birthKnown =
    Boolean(values.birthDate) ||
    (people.length > 0 && people.every((p) => p.birthDate)) ||
    sources.some(
      (s) => s.tool === "get_honmei_star" && record(s.output).birthDate,
    );
  const originKnown =
    people.some(
      (p) => p.origin?.lon !== undefined || p.origin?.code || p.residence,
    ) ||
    Boolean(values.municipality) ||
    /出発地は.+(?:市|区|町|村)です|(?:市|区|町|村)から/.test(text) ||
    sources.some((s) =>
      ["judge_directions", "find_auspicious_days"].includes(s.tool)
        ? typeof s.input.lon === "number"
        : s.tool === "area_directions"
          ? Boolean(record(s.output).origin)
          : s.tool === "search_municipality" &&
            records(record(s.output).results).length === 1,
    );
  const periodKnown =
    Boolean(explicitConsultationDate(text)) ||
    /今月|来月|再来月|今年|来年|半年|\d+\s*[〜~～-]?\s*\d*\s*(?:か月|ヶ月|カ月|月|年)(?:後|以内|中|ごろ)|時期は(?:まだ決めていません|未定)|\d{1,2}月/.test(
      text
        .normalize("NFKC")
        .split(/[\n。]/)
        .filter((line) => !/生年月日|生まれ|誕生日/.test(line))
        .join("\n"),
    );
  const fields: AnswerFieldId[] = [];
  if (!birthKnown) fields.push("birthYear");
  if (!originKnown) fields.push("origin");
  if ((intent === "move" || intent === "days") && !periodKnown)
    fields.push("period");
  if (intent === "towns" || /街|候補/.test(text)) fields.push("conditions");
  return fields.slice(0, 3);
}

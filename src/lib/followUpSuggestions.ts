export const FOLLOW_UP_LIMITS = {
  min: 2,
  max: 4,
  characters: 60,
} as const;

export const FOLLOW_UP_ENVELOPE_START = "<<<CP_FOLLOW_UPS>>>";
export const FOLLOW_UP_ENVELOPE_END = "<<<CP_END_FOLLOW_UPS>>>";

export interface SuggestionPerson {
  name: string;
  birthDate?: string;
  residence?: string;
}

const JAPANESE_CHARACTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const MARKUP_OR_URL =
  /https?:\/\/|www\.|[<>\[\]{}\x60*_#~\\]|&(?:#\d+|#x[\da-f]+|[a-z]+);/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const LIST_PREFIX = /^(?:(?:[-*•]|\d+[.)、])\s*)+/u;

function sanitizeOne(value: unknown): string | undefined {
  if (typeof value !== "string" || CONTROL_CHARACTER.test(value)) return;
  let text = value.trim().replace(LIST_PREFIX, "").replace(/\s+/gu, " ").trim();
  if (!text || MARKUP_OR_URL.test(text) || !JAPANESE_CHARACTER.test(text))
    return;
  if (!/[?？]$/u.test(text)) text += "？";
  if (text.length > FOLLOW_UP_LIMITS.characters) return;
  return text;
}

/** Treat model and network values as untrusted before displaying a chip. */
export function sanitizeFollowUpSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const suggestions: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const suggestion = sanitizeOne(candidate);
    if (!suggestion) continue;
    const key = suggestion.normalize("NFKC").toLocaleLowerCase("ja");
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push(suggestion);
    if (suggestions.length === FOLLOW_UP_LIMITS.max) break;
  }
  return suggestions.length >= FOLLOW_UP_LIMITS.min ? suggestions : [];
}

function japaneseBirthDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return;
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}

/**
 * 空の会話に出す候補。選んだ人の値以外の日付・地名は入れない。
 * 値が無い場合は、引越しの目的だけを尋ねる汎用候補にする。
 */
export function initialConsultationSuggestions(
  people: SuggestionPerson[],
): string[] {
  const selected = people.slice(0, 8);
  if (!selected.length)
    return [
      "引越しに良い方位を相談したい？",
      "引越しの日取りを相談したい？",
      "条件に合う街を探したい？",
    ];

  const names = selected
    .map((person) => person.name.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("と");
  const sharedResidence = selected[0]?.residence?.trim();
  const sameResidence =
    sharedResidence &&
    selected.every((person) => person.residence?.trim() === sharedResidence)
      ? sharedResidence
      : undefined;
  const firstBirthDate = japaneseBirthDate(selected[0]?.birthDate);
  const candidates = [
    sameResidence
      ? `${sameResidence}からの引越し方位を相談したい？`
      : `${names || "選んだ人"}に合う引越し方位を相談したい？`,
    selected.length === 1 && firstBirthDate
      ? `${firstBirthDate}生まれの${names}に合う日取りを相談したい？`
      : `${names || "選んだ人"}に合う日取りを相談したい？`,
    sameResidence
      ? `${sameResidence}から見た街の候補を探したい？`
      : "条件に合う街を探したい？",
  ];
  const sanitized = sanitizeFollowUpSuggestions(candidates);
  return sanitized.length
    ? sanitized
    : ["引越しの方位を相談したい？", "引越しの日取りを相談したい？"];
}

export function formatFollowUpEnvelope(value: unknown): string {
  const suggestions = sanitizeFollowUpSuggestions(value);
  if (!suggestions.length) return "";
  return `\n\n${FOLLOW_UP_ENVELOPE_START}\n${JSON.stringify(suggestions)}\n${FOLLOW_UP_ENVELOPE_END}`;
}

export function extractFollowUpEnvelope(value: string): {
  text: string;
  suggestions: string[];
} {
  const start = value.lastIndexOf(FOLLOW_UP_ENVELOPE_START);
  if (start < 0) return { text: value, suggestions: [] };
  const payloadStart = start + FOLLOW_UP_ENVELOPE_START.length;
  const end = value.indexOf(FOLLOW_UP_ENVELOPE_END, payloadStart);
  const before = value.slice(0, start).trimEnd();
  if (end < 0) return { text: before, suggestions: [] };
  const after = value.slice(end + FOLLOW_UP_ENVELOPE_END.length).trim();
  const text = [before, after].filter(Boolean).join("\n\n");
  try {
    return {
      text,
      suggestions: sanitizeFollowUpSuggestions(
        JSON.parse(value.slice(payloadStart, end).trim()),
      ),
    };
  } catch {
    return { text, suggestions: [] };
  }
}

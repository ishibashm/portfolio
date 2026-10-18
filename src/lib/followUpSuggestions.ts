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
  const text = value
    .trim()
    .replace(LIST_PREFIX, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!text || MARKUP_OR_URL.test(text) || !JAPANESE_CHARACTER.test(text))
    return;
  if (/[?？]$|ですか|ますか|でしょうか|教えてください/u.test(text)) return;
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

// 都道府県は複合地名の中でも個別に照合する。
const PREFECTURES =
  /北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県/gu;
const PLACE_TOKEN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+(?:都|道|府|県|市|区|町|村|駅)/gu;

/** 地名を追加する候補は、会話・選択人物・道具結果・回答の裏付けが必要。 */
export function dropUngroundedPlaceSuggestions(
  suggestions: string[],
  contextText: string,
): string[] {
  const context = contextText.normalize("NFKC");
  return suggestions.filter((suggestion) => {
    const text = suggestion.normalize("NFKC");
    const tokens = [
      ...(text.match(PREFECTURES) ?? []),
      ...text
        .replace(/都道府県|市区町村/g, " ")
        .split(/から|まで|より|について|[のをにはへでと、。\s]/u)
        .flatMap((part) => part.match(PLACE_TOKEN) ?? []),
    ];
    return tokens.every((token) => context.includes(token));
  });
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
      "引越しに良い方位を相談したい",
      "引越しの日取りを相談したい",
      "条件に合う街を探したい",
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
      ? `${sameResidence}からの引越し方位を相談したい`
      : `${names || "選んだ人"}に合う引越し方位を相談したい`,
    selected.length === 1 && firstBirthDate
      ? `${firstBirthDate}生まれの${names}に合う日取りを相談したい`
      : `${names || "選んだ人"}に合う日取りを相談したい`,
    sameResidence
      ? `${sameResidence}から見た街の候補を探したい`
      : "条件に合う街を探したい",
  ];
  const sanitized = sanitizeFollowUpSuggestions(candidates);
  return sanitized.length
    ? sanitized
    : ["引越しの方位を相談したい", "引越しの日取りを相談したい"];
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

import type { AskOrigin } from "./askAnswerFields";
import { AGENT_PAUSED_REASON, AGENT_PAUSED_TEXT } from "./agentPausedText";

export const ASK_DATA_STORAGE_KEY = "cloud_palette_ask_data_v2";
export const LEGACY_ASK_STORAGE_KEY = "cloud_palette_ask_chat_v1";

export const ASK_DATA_LIMITS = {
  conversations: 30,
  messagesPerConversation: 40,
  messageCharacters: 12000,
  draftCharacters: 500,
  people: 20,
  selectedPeople: 8,
  memories: 100,
  memoryCharacters: 600,
  payloadBytes: 256 * 1024,
} as const;

export interface AskStoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskPerson {
  id: string;
  name: string;
  /** 旧データに現住地しかない場合だけ空。新規登録では必須にする。 */
  birthDate: string;
  birthPlace?: string;
  residence?: string;
  origin?: AskOrigin;
  /**
   * サイトの使用中プロフィール・保存済みプロフィール・同行者との
   * 紐付け。同じ人を /ask でも手入力した場合に二重表示しないために使う。
   * モデルへは送らない。
   */
  sourceIds?: string[];
  /** サイト全体で使用中のプロフィールなら true。 */
  active?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredAskPerson {
  sourceId: string;
  name: string;
  birthDate: string;
  birthPlace?: string;
  residence?: string;
  origin?: AskOrigin;
  active?: boolean;
}

export interface AskConversation {
  id: string;
  title: string;
  titleEdited: boolean;
  /** Input values are never stored here; only suppress repeated guidance. */
  guidancePrompted?: boolean;
  /** Preserve manual selection/removal across workspace reloads. */
  personSelectionChanged?: boolean;
  createdAt: string;
  updatedAt: string;
  messages: AskStoredMessage[];
  draft: string;
  personIds: string[];
}

export interface AskMemoryItem {
  id: string;
  sourceConversationId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface AskWorkspace {
  version: 2;
  activeConversationId: string;
  conversations: AskConversation[];
  people: AskPerson[];
  memories: AskMemoryItem[];
  updatedAt: string;
}

export interface AskStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const BIRTH_DATE_PATTERN = /^(?:19|20)\d{2}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function id(value: unknown): string | null {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

function timestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    return fallback;
  return new Date(value).toISOString();
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | undefined {
  const parsed = text(value, max);
  return parsed || undefined;
}

function birthDate(value: unknown): string {
  if (typeof value !== "string" || !BIRTH_DATE_PATTERN.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : "";
}

function parseMessage(value: unknown): AskStoredMessage | null {
  const item = record(value);
  if (!item || (item.role !== "user" && item.role !== "assistant")) return null;
  const content = text(item.content, ASK_DATA_LIMITS.messageCharacters);
  return content ? { role: item.role, content } : null;
}

function parsePerson(value: unknown, fallbackNow: string): AskPerson | null {
  const item = record(value);
  const personId = id(item?.id);
  const name = text(item?.name, 40);
  if (!item || !personId || !name) return null;
  const createdAt = timestamp(item.createdAt, fallbackNow);
  return {
    id: personId,
    name,
    birthDate: birthDate(item.birthDate),
    ...(optionalText(item.birthPlace, 80)
      ? { birthPlace: optionalText(item.birthPlace, 80) }
      : {}),
    ...(optionalText(item.residence, 80)
      ? { residence: optionalText(item.residence, 80) }
      : {}),
    ...(Array.isArray(item.sourceIds)
      ? {
          sourceIds: [
            ...new Set(
              item.sourceIds.flatMap((value) => {
                const source = optionalText(value, 100);
                return source ? [source] : [];
              }),
            ),
          ].slice(0, 20),
        }
      : {}),
    ...(item.active === true ? { active: true } : {}),
    createdAt,
    updatedAt: timestamp(item.updatedAt, createdAt),
  };
}

function normalizedIdentity(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\s　・、。]/gu, "");
  return /^(?:本人|自分|私|わたし)$/u.test(normalized)
    ? "__self__"
    : normalized;
}

function samePlace(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = normalizedIdentity(left);
  const b = normalizedIdentity(right);
  return (
    a === b ||
    (Math.min(a.length, b.length) >= 4 && (a.endsWith(b) || b.endsWith(a)))
  );
}

function sameRegisteredPerson(
  person: AskPerson,
  candidate: RegisteredAskPerson,
): boolean {
  if (person.sourceIds?.includes(candidate.sourceId)) return true;
  if (!person.birthDate || person.birthDate !== candidate.birthDate)
    return false;
  return (
    normalizedIdentity(person.name) === normalizedIdentity(candidate.name) ||
    samePlace(person.residence, candidate.residence)
  );
}

function registeredPersonId(sourceId: string): string {
  // FNV-1a: sourceId が URL や日本語を含んでも、保存用 ID は安全な字に限る。
  let hash = 0x811c9dc5;
  for (let index = 0; index < sourceId.length; index++) {
    hash ^= sourceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `registered_${(hash >>> 0).toString(36)}`;
}

function registeredSourcePriority(sourceId: string): number {
  if (sourceId.startsWith("settings:")) return 3;
  if (sourceId.startsWith("profile:")) return 2;
  if (sourceId.startsWith("party:")) return 1;
  return 0;
}

/**
 * /ask 独自の人物と、他の画面で登録済みの人物を 1 つの選択肢にする。
 *
 * 先に /ask の id を残すのは、既存会話の personIds を書き換えずに済ませるため。
 * sourceIds を一度紐付ければ、登録元で名前や場所が変わっても同じ人として更新できる。
 */
export function mergeRegisteredAskPeople(
  current: AskPerson[],
  registered: RegisteredAskPerson[],
  now: string,
): AskPerson[] {
  const people = current.map((person) => {
    const copy = {
      ...person,
      ...(person.sourceIds ? { sourceIds: [...person.sourceIds] } : {}),
    };
    if (copy.sourceIds?.length && copy.active) delete copy.active;
    return copy;
  });

  for (const candidate of registered) {
    const name = text(candidate.name, 40);
    const parsedBirthDate = birthDate(candidate.birthDate);
    const sourceId = text(candidate.sourceId, 100);
    if (!name || !parsedBirthDate || !sourceId) continue;
    const match = people.find((person) =>
      sameRegisteredPerson(person, {
        ...candidate,
        name,
        birthDate: parsedBirthDate,
        sourceId,
      }),
    );
    const birthPlace = optionalText(candidate.birthPlace, 80);
    const residence = optionalText(candidate.residence, 80);
    if (match) {
      const linkedPriority = Math.max(
        -1,
        ...(match.sourceIds ?? []).map(registeredSourcePriority),
      );
      if (
        !match.sourceIds?.length ||
        registeredSourcePriority(sourceId) >= linkedPriority
      ) {
        match.name = name;
        match.birthDate = parsedBirthDate;
        if (birthPlace) match.birthPlace = birthPlace;
        if (residence) match.residence = residence;
        match.origin = candidate.origin;
      }
      match.sourceIds = [
        ...new Set([...(match.sourceIds ?? []), sourceId]),
      ].slice(0, 20);
      match.active =
        match.active === true || candidate.active === true ? true : undefined;
      match.updatedAt = now;
      continue;
    }
    if (people.length >= ASK_DATA_LIMITS.people) break;
    people.push({
      id: registeredPersonId(sourceId),
      name,
      birthDate: parsedBirthDate,
      ...(birthPlace ? { birthPlace } : {}),
      ...(residence ? { residence } : {}),
      sourceIds: [sourceId],
      ...(candidate.origin ? { origin: candidate.origin } : {}),
      ...(candidate.active === true ? { active: true } : {}),
      createdAt: now,
      updatedAt: now,
    });
  }

  return uniqueById(people).slice(0, ASK_DATA_LIMITS.people);
}

function parseConversation(
  value: unknown,
  fallbackNow: string,
): AskConversation | null {
  const item = record(value);
  const conversationId = id(item?.id);
  if (!item || !conversationId) return null;
  const createdAt = timestamp(item.createdAt, fallbackNow);
  const messages = Array.isArray(item.messages)
    ? item.messages
        .slice(-ASK_DATA_LIMITS.messagesPerConversation)
        .flatMap((message) => {
          const parsed = parseMessage(message);
          return parsed ? [parsed] : [];
        })
    : [];
  const personIds = Array.isArray(item.personIds)
    ? [
        ...new Set(
          item.personIds.flatMap((value) => (id(value) ? [id(value)!] : [])),
        ),
      ].slice(0, ASK_DATA_LIMITS.selectedPeople)
    : [];
  return {
    id: conversationId,
    title: text(item.title, 80) || titleFromMessages(messages),
    titleEdited: item.titleEdited === true,
    ...(item.guidancePrompted === true ? { guidancePrompted: true } : {}),
    ...(item.personSelectionChanged === true
      ? { personSelectionChanged: true }
      : {}),
    createdAt,
    updatedAt: timestamp(item.updatedAt, createdAt),
    messages,
    draft:
      typeof item.draft === "string"
        ? item.draft.slice(0, ASK_DATA_LIMITS.draftCharacters)
        : "",
    personIds,
  };
}

/** Older workspaces did not record completion status. Drop known failure conclusions. */
export function isUnavailableConclusion(value: string): boolean {
  const conclusion = value.includes("主な回答・結論：")
    ? value.split("主な回答・結論：").slice(1).join("主な回答・結論：")
    : value;
  if (
    conclusion.includes(AGENT_PAUSED_REASON) ||
    conclusion.includes(AGENT_PAUSED_TEXT)
  )
    return true;
  return /一時的にお休み|AI回答の利用枠が一時的に止ま|本日のAI回答の枠が終わ|回答に必要な結果を取得できません|回答を始められません|回答を受け取れません|回答を中止しました|本日のAI無料枠に達|AIまたは道具の処理に失敗|道具の失敗・時間上限・中断|エラーが発生|回答に失敗しました|回答の受信が途中で終了|日次.*(?:上限|枠)|本日.*(?:上限|使い切)/u.test(
    conclusion,
  );
}

function parseMemory(
  value: unknown,
  fallbackNow: string,
): AskMemoryItem | null {
  const item = record(value);
  const memoryId = id(item?.id);
  const sourceConversationId = id(item?.sourceConversationId);
  const memoryText = text(item?.text, ASK_DATA_LIMITS.memoryCharacters);
  if (
    !item ||
    !memoryId ||
    !sourceConversationId ||
    !memoryText ||
    isUnavailableConclusion(memoryText)
  )
    return null;
  const createdAt = timestamp(item.createdAt, fallbackNow);
  return {
    id: memoryId,
    sourceConversationId,
    text: memoryText,
    createdAt,
    updatedAt: timestamp(item.updatedAt, createdAt),
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function parseAskWorkspace(
  value: unknown,
  fallbackNow = new Date().toISOString(),
): AskWorkspace | null {
  const workspace = record(value);
  if (!workspace || workspace.version !== 2) return null;
  const conversations = uniqueById(
    (Array.isArray(workspace.conversations) ? workspace.conversations : [])
      // 新しい会話は一覧の先頭へ足すため、上限超過データでも先頭を残す。
      .slice(0, ASK_DATA_LIMITS.conversations)
      .flatMap((item) => {
        const parsed = parseConversation(item, fallbackNow);
        return parsed ? [parsed] : [];
      }),
  );
  if (!conversations.length) return null;
  const people = uniqueById(
    (Array.isArray(workspace.people) ? workspace.people : [])
      .slice(-ASK_DATA_LIMITS.people)
      .flatMap((item) => {
        const parsed = parsePerson(item, fallbackNow);
        return parsed ? [parsed] : [];
      }),
  );
  const personIds = new Set(people.map((person) => person.id));
  for (const conversation of conversations) {
    conversation.personIds = conversation.personIds.filter((personId) =>
      personIds.has(personId),
    );
  }
  const memories = dedupeAskMemories(
    (Array.isArray(workspace.memories) ? workspace.memories : [])
      .slice(-ASK_DATA_LIMITS.memories)
      .flatMap((item) => {
        const parsed = parseMemory(item, fallbackNow);
        return parsed ? [parsed] : [];
      }),
  );
  const requestedActiveId = id(workspace.activeConversationId);
  const activeConversationId = conversations.some(
    (conversation) => conversation.id === requestedActiveId,
  )
    ? requestedActiveId!
    : conversations[0].id;
  return {
    version: 2,
    activeConversationId,
    conversations,
    people,
    memories,
    updatedAt: timestamp(workspace.updatedAt, fallbackNow),
  };
}

export function parseAskWorkspaceJson(
  raw: string | null,
  fallbackNow = new Date().toISOString(),
): AskWorkspace | null {
  if (!raw) return null;
  try {
    return parseAskWorkspace(JSON.parse(raw), fallbackNow);
  } catch {
    return null;
  }
}

export function titleFromMessages(messages: AskStoredMessage[]): string {
  const firstQuestion = messages.find(
    (message) => message.role === "user",
  )?.content;
  return firstQuestion
    ? firstQuestion.replace(/\s+/g, " ").slice(0, 32)
    : "新しい相談";
}

function plainSummary(value: string, max: number): string {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\[\]()`*_#~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function summarizeConsultation(
  userMessages: string[],
  assistantMessage: string,
): string {
  if (isUnavailableConclusion(assistantMessage)) return "";
  const questions = userMessages
    .slice(-3)
    .map((message) => plainSummary(message, 100))
    .filter(Boolean)
    .join("／")
    .slice(0, 250);
  // 問いだけで600文字を使い切らず、選んだ日・方位などが入りやすい
  // 回答側の領域を必ず残す。
  const conclusion = plainSummary(assistantMessage, 320);
  if (!questions || !conclusion) return "";
  return `相談内容：${questions}\n主な回答・結論：${conclusion}`.slice(
    0,
    ASK_DATA_LIMITS.memoryCharacters,
  );
}

export function memoryFromConversation(
  conversation: Pick<AskConversation, "id" | "messages">,
  now: string,
): AskMemoryItem | null {
  const latestAssistant = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  if (!latestAssistant) return null;
  const summary = summarizeConsultation(
    conversation.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content),
    latestAssistant,
  );
  return summary
    ? {
        id: `memory_${conversation.id}`.slice(0, 100),
        sourceConversationId: conversation.id,
        text: summary,
        createdAt: now,
        updatedAt: now,
      }
    : null;
}

export function migrateLegacyAskWorkspace(
  raw: string | null,
  now = new Date().toISOString(),
): AskWorkspace | null {
  if (!raw) return null;
  try {
    const legacy = record(JSON.parse(raw));
    if (!legacy || legacy.version !== 1 || !Array.isArray(legacy.messages))
      return null;
    const messages = legacy.messages
      .slice(-ASK_DATA_LIMITS.messagesPerConversation)
      .flatMap((item) => {
        const parsed = parseMessage(item);
        return parsed ? [parsed] : [];
      });
    const rawProfile = record(legacy.profile) ?? {};
    const legacyBirthDate = birthDate(rawProfile.birthDate);
    const residence = optionalText(rawProfile.residence, 80);
    const people: AskPerson[] =
      legacyBirthDate || residence
        ? [
            {
              id: "legacy_person",
              name: "本人",
              birthDate: legacyBirthDate,
              ...(residence ? { residence } : {}),
              createdAt: now,
              updatedAt: now,
            },
          ]
        : [];
    const conversation: AskConversation = {
      id: "legacy_conversation",
      title: titleFromMessages(messages),
      titleEdited: false,
      createdAt: now,
      updatedAt: now,
      messages,
      draft:
        typeof legacy.draft === "string"
          ? legacy.draft.slice(0, ASK_DATA_LIMITS.draftCharacters)
          : "",
      personIds: people.map((person) => person.id),
    };
    const memory = memoryFromConversation(conversation, now);
    return {
      version: 2,
      activeConversationId: conversation.id,
      conversations: [conversation],
      people,
      memories: memory ? [memory] : [],
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

export function readLocalAskWorkspace(
  storage: AskStorage,
  now = new Date().toISOString(),
): AskWorkspace | null {
  try {
    const current = parseAskWorkspaceJson(
      storage.getItem(ASK_DATA_STORAGE_KEY),
      now,
    );
    if (current) return current;
    const migrated = migrateLegacyAskWorkspace(
      storage.getItem(LEGACY_ASK_STORAGE_KEY),
      now,
    );
    if (!migrated) return null;
    storage.setItem(ASK_DATA_STORAGE_KEY, JSON.stringify(migrated));
    storage.removeItem(LEGACY_ASK_STORAGE_KEY);
    return migrated;
  } catch {
    return null;
  }
}

export function isAskWorkspaceEmpty(workspace: AskWorkspace): boolean {
  return (
    workspace.people.length === 0 &&
    workspace.memories.length === 0 &&
    workspace.conversations.every(
      (conversation) =>
        conversation.messages.length === 0 && !conversation.draft.trim(),
    )
  );
}

/** Keep one memory across conversations, including legacy saved duplicates. */
export function dedupeAskMemories(items: AskMemoryItem[]): AskMemoryItem[] {
  const seen = new Set<string>();
  return uniqueById(items).filter((item) => {
    const key = item.text.normalize("NFKC").replace(/\s+/gu, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

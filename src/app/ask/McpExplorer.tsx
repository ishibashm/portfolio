"use client";
import { AnswerChips } from "./AnswerChips";
import {
  isAskConsultation,
  type AnswerFieldId,
  type AskOrigin,
} from "@/lib/askAnswerFields";
import { nearestMunicipality } from "@/lib/nearestMunicipality";
import { AGENT_PAUSED_REASON, AGENT_PAUSED_TEXT } from "@/lib/agentPausedText";
import FaqPanel from "@/components/FaqPanel";
import { ANSWER_SOURCE_LABELS, type AnswerSource } from "@/lib/answerSource";

import dynamic from "next/dynamic";
import { AskGuidancePanel } from "@/components/home/AskGuidancePanel";
import {
  guidanceValuesFromText,
  type GuidanceCard,
  type GuidanceValues,
} from "@/lib/askGuidance";
import { shirubeInvitation } from "@/lib/shirubeInvitations";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { AnswerBlocks } from "@/components/home/AnswerBlocks";
import { AgentAnswer } from "@/components/home/AgentAnswer";
import { AgentBirthYear } from "@/components/home/AgentBirthYear";
import {
  ASK_DATA_LIMITS,
  ASK_DATA_STORAGE_KEY,
  LEGACY_ASK_STORAGE_KEY,
  isAskWorkspaceEmpty,
  dedupeAskMemories,
  mergeRegisteredAskPeople,
  memoryFromConversation,
  parseAskWorkspace,
  parseAskWorkspaceJson,
  readLocalAskWorkspace,
  titleFromMessages,
  type AskConversation,
  type AskMemoryItem,
  type AskPerson,
  type RegisteredAskPerson,
  type AskStoredMessage,
  type AskWorkspace,
} from "@/lib/askData";
import { parseAnswerBlocks, type AnswerBlock } from "@/lib/answerBlocks";
import {
  extractAgentInput,
  isAgentGeneralQuestion,
  needsAgentBirth,
  needsAgentOrigin,
} from "@/lib/agentInput";
import {
  initialConsultationSuggestions,
  sanitizeFollowUpSuggestions,
} from "@/lib/followUpSuggestions";
import {
  GuideAvatar,
  GuideChatAvatar,
} from "@/components/guide/GuideCharacter";
import type {
  AgentConversationMessage,
  AgentEvent,
  AgentPerson,
} from "@/lib/mcpAgent";
import type { ChainEvent } from "@/lib/mcpChain";
import {
  loadSettings,
  readSettingsSync,
  settingNumber,
  settingString,
} from "@/lib/userSettings";
import { findActiveProfile } from "@/lib/activeProfile";
import { loadProfilePresets } from "@/lib/profilePresetSync";
import {
  readSharedParty,
  readTimingParty,
  type PartyMemberInput,
} from "@/lib/partyMemberInput";
import {
  AskMemoryPanel,
  AskPeoplePanel,
  ConversationNavigation,
  ShirubeGuide,
  type PersonEdits,
} from "./AskWorkspacePanels";
import { SaveOfferCard, type SaveOfferStatus } from "./SaveOfferCard";
import {
  saveOfferLoginPath,
  type SaveOfferCard as SaveOfferCardData,
  type SaveOfferFieldKey,
  type SaveOfferStage,
} from "@/lib/saveOffer";
import {
  readResumeParam,
  stashConversationForResume,
  withResumedConversation,
} from "@/lib/saveOfferResume";
import type { ReminderOfferCard as ReminderOfferCardData } from "@/lib/reminderText";
import { ReminderOfferCard } from "./ReminderOfferCard";

const GrokVoice = dynamic(() => import("@/components/home/GrokVoice"), {
  ssr: false,
});

type CallEvent = Extract<ChainEvent, { type: "call" }>;
type AgentToolCall = Extract<AgentEvent, { type: "tool-call" }> & {
  result?: Extract<AgentEvent, { type: "tool-result" }>;
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  state: "streaming" | "done" | "error";
  blocks?: AnswerBlock[];
  tools?: AgentToolCall[];
  reasons?: string[];
  suggestions?: string[];
  answerFields?: AnswerFieldId[];
  answerSource?: AnswerSource;
  /** サーバーが書いた保存の提案。端末にもアカウントにも保存しない。 */
  guidance?: GuidanceCard;
  saveOffer?: { card: SaveOfferCardData; status: SaveOfferStatus };
  /** サーバーが署名したお知らせの提案（ログイン中だけ届く）。保存しない。 */
  reminderOffers?: ReminderOfferCardData[];
};
type ChatConversation = Omit<AskConversation, "messages"> & {
  messages: ChatMessage[];
};

export {
  ASK_DATA_STORAGE_KEY,
  LEGACY_ASK_STORAGE_KEY as ASK_CONVERSATION_STORAGE_KEY,
} from "@/lib/askData";
const MAX_API_HISTORY_MESSAGES = 10;
const MAX_API_HISTORY_CHARACTERS = 7000;
const MAX_API_MEMORY_CHARACTERS = 3000;
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];
let messageSequence = 0;

const toolLabels: Record<string, string> = {
  get_kanshi: "暦と干支を確認",
  get_honmei_star: "本命星を確認",
  judge_directions: "方位の吉凶を確認",
  find_auspicious_days: "日取りの候補を確認",
  search_municipality: "市区町村を検索",
  area_directions: "方位ごとの街を確認",
  prefecture_summary: "地域情報を確認",
  search_articles: "参考記事を検索",
  get_article: "参考記事を確認",
};

function nextMessageId() {
  messageSequence += 1;
  return `${Date.now()}-${messageSequence}`;
}

function nextEntityId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${nextMessageId()}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function samePersonLabel(left: string, right: string) {
  const normalize = (value: string) => {
    const normalized = value
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .replace(/[\s　]/gu, "");
    return /^(?:本人|自分|私|わたし)$/u.test(normalized)
      ? "__self__"
      : normalized;
  };
  return normalize(left) === normalize(right);
}

function samePersonResidence(left: string | undefined, right: string) {
  if (!left || !right.trim()) return false;
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/[\s　・、。]/gu, "");
  const a = normalize(left);
  const b = normalize(right);
  return (
    a === b ||
    (Math.min(a.length, b.length) >= 4 && (a.endsWith(b) || b.endsWith(a)))
  );
}

function newConversation(
  now: string,
  draft = "",
  personIds: string[] = [],
): ChatConversation {
  return {
    id: nextEntityId("conversation"),
    title: "新しい相談",
    titleEdited: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
    draft,
    personIds,
  };
}

function stopStreamingConversation(
  conversation: ChatConversation,
  now: string,
): ChatConversation {
  if (!conversation.messages.some((message) => message.state === "streaming"))
    return conversation;
  return {
    ...conversation,
    updatedAt: now,
    messages: conversation.messages.map((message) =>
      message.state === "streaming"
        ? {
            ...message,
            content: message.content || "回答を中止しました。",
            state: "error",
          }
        : message,
    ),
  };
}

function toChatConversation(conversation: AskConversation): ChatConversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({
      ...message,
      id: nextMessageId(),
      state: "done",
    })),
  };
}

function storedMessages(messages: ChatMessage[]): AskStoredMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .slice(-ASK_DATA_LIMITS.messagesPerConversation)
    .map(({ role, content }) => ({ role, content }));
}

function likelySignedIn() {
  if (typeof document === "undefined") return false;
  return (
    process.env.NODE_ENV === "development" ||
    /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/.test(document.cookie)
  );
}

function partyCandidate(
  member: PartyMemberInput,
  source: "shared" | "timing",
): RegisteredAskPerson | null {
  const name = member.name.trim();
  const birthDate =
    typeof member.birthDate === "string" ? member.birthDate.slice(0, 10) : "";
  if (!name || !birthDate) return null;
  return {
    sourceId: `party:${source}:${member.id}`,
    name,
    birthDate,
  };
}

const originCache = new Map<string, Promise<AskOrigin>>();
async function resolveOrigin(lat: number, lon: number): Promise<AskOrigin> {
  const key = `${lat},${lon}`;
  let result = originCache.get(key);
  if (!result) {
    result = import("@/lib/municipalityCoords").then(
      ({ MUNICIPALITY_POINTS }) => {
        const nearest = nearestMunicipality(lat, lon, MUNICIPALITY_POINTS);
        return {
          lat,
          lon,
          ...(nearest ? { code: nearest.code, name: nearest.name } : {}),
        };
      },
    );
    originCache.set(key, result);
  }
  return result;
}
async function savedAskOrigin(settings = readSettingsSync()) {
  const lat = settingNumber(settings, "base_lat");
  const lon = settingNumber(settings, "base_lon");
  if (
    lat === undefined ||
    lon === undefined ||
    lat < 20 ||
    lat > 46 ||
    lon < 122 ||
    lon > 154
  )
    return;
  return resolveOrigin(lat, lon);
}

async function loadRegisteredAskPeople(): Promise<RegisteredAskPerson[]> {
  const [{ settings }, { presets }] = await Promise.all([
    loadSettings(),
    loadProfilePresets(fetch, window.localStorage),
  ]);
  const active = findActiveProfile(presets, settings);
  const origin = await savedAskOrigin(settings);
  const activeBirthDate = settingString(settings, "birth_date")?.slice(0, 10);
  const activeResidence = settingString(settings, "base_label")?.trim();
  const activeBirthPlace = settingString(settings, "birth_label")?.trim();
  const registered: RegisteredAskPerson[] = presets.map((preset) => {
    const isActive = preset.id === active?.id;
    return {
      sourceId: `profile:${preset.id}`,
      name: preset.name,
      birthDate:
        isActive && activeBirthDate
          ? activeBirthDate
          : preset.birthDate.slice(0, 10),
      ...(isActive && activeBirthPlace
        ? { birthPlace: activeBirthPlace }
        : preset.birthLabel
          ? { birthPlace: preset.birthLabel }
          : {}),
      ...(isActive && activeResidence
        ? { residence: activeResidence }
        : preset.baseLabel
          ? { residence: preset.baseLabel }
          : {}),
      ...(isActive ? { active: true, origin } : {}),
    };
  });
  if (!active && activeBirthDate)
    registered.unshift({
      sourceId: "settings:active",
      origin,
      name: "本人",
      birthDate: activeBirthDate,
      ...(activeBirthPlace ? { birthPlace: activeBirthPlace } : {}),
      ...(activeResidence ? { residence: activeResidence } : {}),
      active: true,
    });

  const party = [
    ...readSharedParty(window.localStorage).members.map((member) => ({
      member,
      source: "shared" as const,
    })),
    ...readTimingParty(window.localStorage).members.map((member) => ({
      member,
      source: "timing" as const,
    })),
  ];
  for (const { member, source } of party) {
    const candidate = partyCandidate(member, source);
    if (candidate) registered.push(candidate);
  }
  return registered;
}

function memoriesForApi(
  memories: AskMemoryItem[],
  activeConversationId: string,
) {
  const selected: string[] = [];
  let characters = 0;
  for (const memory of [...memories]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((item) => item.sourceConversationId !== activeConversationId)) {
    if (selected.length >= 12) break;
    const remaining = MAX_API_MEMORY_CHARACTERS - characters;
    if (remaining <= 0) break;
    const value = memory.text.slice(0, remaining);
    if (!value.trim()) continue;
    selected.unshift(value);
    characters += value.length;
  }
  return selected;
}

function historyForApi(
  messages: ChatMessage[],
  availableCharacters: number,
): AgentConversationMessage[] {
  const history: AgentConversationMessage[] = [];
  let remaining = availableCharacters;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (history.length >= MAX_API_HISTORY_MESSAGES || remaining <= 0) break;
    const message = messages[index];
    if (!message.content.trim()) continue;
    const content = message.content.slice(0, Math.min(4000, remaining));
    if (!content.trim()) continue;
    history.unshift({ role: message.role, content });
    remaining -= content.length;
  }
  return history;
}

function followUps(messages: ChatMessage[]) {
  const lastQuestion = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (!lastQuestion) return initialConsultationSuggestions([]);
  if (/街|市|区|町|村|方位/.test(lastQuestion))
    return [
      "候補の街を3つに絞って",
      "家賃や暮らしやすさも比べて",
      "おすすめの日取りも調べて",
    ];
  if (/日|時期|いつ|暦/.test(lastQuestion))
    return [
      "その中で最もよい日を教えて",
      "避けたほうがよい日も教えて",
      "方位も合わせて確認して",
    ];
  return [
    "もう少し具体的に教えて",
    "選ぶときの注意点を教えて",
    "次に確認することを教えて",
  ];
}

function ToolStatus({ message }: { message: ChatMessage }) {
  const tools = message.tools ?? [];
  const reasons = message.reasons ?? [];
  return (
    <>
      {message.state === "streaming" && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse rounded-full bg-amber-500"
          />
          必要な情報を確認しています…
        </p>
      )}
      {(message.state !== "streaming" || tools.length > 0) && (
        <details className="mt-4 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            {tools.length > 0
              ? `確認に使った道具：${tools.length}件`
              : "回答の確認状況"}
          </summary>
          <div className="mt-3 space-y-3">
            {tools.length === 0 && (
              <p>
                {message.state === "error"
                  ? "回答を完了できませんでした。入力を確認して、もう一度お試しください。"
                  : "今回は追加の計算道具を使わず、会話の内容から回答しました。"}
              </p>
            )}
            {tools.map((call) => (
              <div key={call.id} className="rounded-lg bg-white p-3">
                <p className="font-medium text-slate-800">
                  {toolLabels[call.tool] ?? "情報を確認"}
                </p>
                <p className="mt-1">
                  {call.result?.summary ?? "確認を完了できませんでした。"}
                </p>
                {call.result && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">
                      詳しい入出力を見る
                    </summary>
                    <p className="mt-2 break-all">
                      道具：{call.tool}／所要時間：{call.result.durationMs}ms
                    </p>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2">
                      {JSON.stringify(
                        {
                          input: call.input,
                          output: call.result.output ?? {
                            error: call.result.summary,
                          },
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {reasons.length > 0 && (
              <div>
                <p className="font-medium text-slate-700">処理からのお知らせ</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </>
  );
}

function ConversationMessage({
  message,
  showName = true,
  saveOfferCounts,
  onSaveOffer,
  guidanceSaved,
  guidancePrevious,
  onDismissGuidance,
}: {
  message: ChatMessage;
  showName?: boolean;
  guidanceSaved?: AskPerson;
  guidancePrevious?: GuidanceValues;
  onDismissGuidance?: (messageId: string) => void;
  saveOfferCounts?: Partial<Record<SaveOfferFieldKey, number>>;
  onSaveOffer?: (messageId: string, action: "accept" | "decline") => void;
}) {
  if (message.role === "user")
    return (
      <article
        className="ml-auto w-fit max-w-[86%] rounded-2xl rounded-br-md bg-slate-800 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-white sm:max-w-[72%]"
        data-chat-role="user"
      >
        <h2 className="sr-only">あなた</h2>
        {message.content}
      </article>
    );
  return (
    <div
      className="flex w-full items-start gap-2 sm:gap-3"
      data-chat-role="assistant"
    >
      <GuideChatAvatar />
      <div className="min-w-0 flex-1 sm:max-w-[88%] sm:flex-none">
        {showName && (
          <p className="mb-1 ml-1 text-xs font-semibold text-indigo-700">
            しるべ
          </p>
        )}
        <article
          className={`rounded-2xl rounded-tl-md border bg-white/95 p-4 shadow-sm sm:p-5 ${
            message.state === "error" ? "border-red-200" : "border-stone-200"
          }`}
        >
          {message.answerSource && (
            <p className="mb-2 text-xs font-semibold">
              {ANSWER_SOURCE_LABELS[message.answerSource]}
            </p>
          )}
          {message.content ? (
            <AgentAnswer text={message.content} />
          ) : (
            <p className="text-sm text-slate-600">
              {message.state === "streaming"
                ? "回答を考えています…"
                : "回答本文を表示できませんでした。もう一度お試しください。"}
            </p>
          )}
          {message.blocks && message.blocks.length > 0 && (
            <AnswerBlocks blocks={message.blocks} />
          )}
          <ToolStatus message={message} />
          {message.guidance && onDismissGuidance && (
            <AskGuidancePanel
              initial={message.guidance}
              saved={guidanceSaved}
              previous={guidancePrevious}
              onDismiss={() => onDismissGuidance(message.id)}
            />
          )}
          {!message.guidance && message.saveOffer && onSaveOffer && (
            <SaveOfferCard
              card={message.saveOffer.card}
              status={message.saveOffer.status}
              counts={saveOfferCounts}
              onAccept={() => onSaveOffer(message.id, "accept")}
              onDecline={() => onSaveOffer(message.id, "decline")}
            />
          )}
          {!message.guidance &&
            message.reminderOffers?.map((card) => (
              <ReminderOfferCard
                key={`${card.date}:${card.direction}`}
                card={card}
              />
            ))}
        </article>
      </div>
    </div>
  );
}

function postSaveOffer(
  stage: SaveOfferStage,
  surface: "home" | "ask",
  conversationKey?: string,
) {
  void fetch("/api/save-offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 押してすぐログイン画面へ移るので、移動後も送り切る。
    keepalive: true,
    body: JSON.stringify({
      stage,
      surface,
      ...(conversationKey ? { conversationKey } : {}),
    }),
  }).catch(() => {});
}

export function McpExplorer({
  agentEnabled = false,
  voiceEnabled = false,
  mock = false,
  initialQuestion = "",
  persistConversation = false,
}: {
  agentEnabled?: boolean;
  voiceEnabled?: boolean;
  mock?: boolean;
  initialQuestion?: string;
  persistConversation?: boolean;
}) {
  const guidancePrompted = useRef(new Set<string>());
  const invitationHandled = useRef(false);
  const invitationPending = useRef<string | null>(null);
  const invitationForm = useRef<HTMLFormElement>(null);
  const initialInput = extractAgentInput(initialQuestion);
  const [conversations, setConversations] = useState<ChatConversation[]>([
    {
      id: "session_conversation",
      title: "新しい相談",
      titleEdited: false,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      messages: [],
      draft: initialQuestion,
      personIds: [],
    },
  ]);
  const [activeConversationId, setActiveConversationId] = useState(
    "session_conversation",
  );
  const [people, setPeople] = useState<AskPerson[]>([]);
  const [memories, setMemories] = useState<AskMemoryItem[]>([]);
  const [voiceMessages, setVoiceMessages] = useState<
    { role: string; text: string }[]
  >([]);
  const [voiceTools, setVoiceTools] = useState<AgentToolCall[]>([]);
  const [calculationBlocks, setCalculationBlocks] = useState<AnswerBlock[]>([]);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [calculationReasons, setCalculationReasons] = useState<string[]>([]);
  const [calculationFollowUps, setCalculationFollowUps] = useState<string[]>(
    [],
  );
  const [calculationComplete, setCalculationComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [calculationOnly, setCalculationOnly] = useState(false);
  const [birthDate, setBirthDate] = useState(initialInput.birthDate);
  const [municipality, setMunicipality] = useState(initialInput.municipality);
  const [year, setYear] = useState(initialInput.year);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [privacyRevision, setPrivacyRevision] = useState(0);
  const [savedOrigin, setSavedOrigin] = useState<AskOrigin>();
  useEffect(() => {
    let cancelled = false;
    void savedAskOrigin()
      .then((origin) => {
        if (!cancelled) setSavedOrigin(origin);
      })
      .catch(() => {
        if (!cancelled) setSavedOrigin(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [privacyRevision]);
  const [remaining, setRemaining] = useState<string>();
  const [voiceSignedIn, setVoiceSignedIn] = useState<boolean | null>(null);
  const [storageReady, setStorageReady] = useState(!persistConversation);
  const [registeredPeopleReady, setRegisteredPeopleReady] = useState(
    !agentEnabled || !persistConversation,
  );
  const [workspaceUpdatedAt, setWorkspaceUpdatedAt] = useState(
    "1970-01-01T00:00:00.000Z",
  );
  const [cloudStorage, setCloudStorage] = useState<
    "local" | "saving" | "saved" | "error"
  >("local");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  // トップのチャットは会話 id が固定なので、提案を会話ごとに数える鍵を別に持つ。
  const [homeConversationKey] = useState(() => nextEntityId("home"));
  const [resumedConversationId, setResumedConversationId] = useState<
    string | null
  >(null);
  // 戻ったあと、アカウントへの送信が実際に成功してから「保存しました」と言う。
  const resumePending = useRef(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const remainingRevision = useRef(0);
  const conversationRevision = useRef(0);
  const registeredPeopleRevision = useRef(0);
  const cloudWorkspacePresent = useRef(false);
  const composing = useRef(false);
  const followLatest = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const calculationQuestionRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [billingPaused, setBillingPaused] = useState(false);
  const useAgent = agentEnabled && !calculationOnly;
  const activeConversation =
    conversations.find(
      (conversation) => conversation.id === activeConversationId,
    ) ?? conversations[0];
  const messages = activeConversation?.messages ?? EMPTY_CHAT_MESSAGES;
  const question = activeConversation?.draft ?? "";
  const chosenOrigins = useRef(new Map<string, AskOrigin>());
  const selectedPeople = people.filter((person) =>
    activeConversation?.personIds.includes(person.id),
  );

  function setMessages(update: SetStateAction<ChatMessage[]>) {
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== activeConversationId) return conversation;
        const nextMessages =
          typeof update === "function" ? update(conversation.messages) : update;
        return {
          ...conversation,
          title: conversation.titleEdited
            ? conversation.title
            : titleFromMessages(storedMessages(nextMessages)),
          updatedAt: now,
          messages: nextMessages,
        };
      }),
    );
  }

  function setQuestion(value: string) {
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              draft: value.slice(0, ASK_DATA_LIMITS.draftCharacters),
              updatedAt: now,
            }
          : conversation,
      ),
    );
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (
      !persistConversation ||
      !storageReady ||
      !registeredPeopleReady ||
      invitationHandled.current
    )
      return;
    const invitation = shirubeInvitation(
      new URLSearchParams(window.location.search).get("start"),
    );
    if (!invitation) return;
    const abort = new AbortController();
    void fetch("/api/mcp-chain/status", {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("status");
        return response.json();
      })
      .then((status) => {
        if (abort.signal.aborted || invitationHandled.current) return;
        invitationHandled.current = true;
        if (
          !agentEnabled ||
          status.enabled !== true ||
          status.paused ||
          status.remaining?.requests === 0
        ) {
          window.location.assign(invitation.calculationHref);
          return;
        }
        const now = new Date().toISOString();
        const conversation = newConversation(now, invitation.question);
        invitationPending.current = conversation.id;
        setConversations((current) =>
          [conversation, ...current].slice(0, ASK_DATA_LIMITS.conversations),
        );
        setActiveConversationId(conversation.id);
        setWorkspaceUpdatedAt(now);
        const url = new URL(window.location.href);
        url.searchParams.delete("start");
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
      })
      .catch(() => {
        if (!abort.signal.aborted)
          window.location.assign(invitation.calculationHref);
      });
    return () => abort.abort();
  }, [persistConversation, storageReady, registeredPeopleReady, agentEnabled]);

  useEffect(() => {
    if (
      invitationPending.current !== activeConversationId ||
      !question ||
      running ||
      !invitationForm.current
    )
      return;
    invitationPending.current = null;
    invitationForm.current.requestSubmit();
  }, [activeConversationId, question, running]);

  useEffect(() => {
    if (!persistConversation) return;
    const now = new Date().toISOString();
    let local: AskWorkspace | null = null;
    try {
      local = readLocalAskWorkspace(localStorage, now);
    } catch {
      // localStorage can be unavailable when browser storage is disabled.
    }
    const blank = newConversation(now, initialQuestion);
    const fallback: AskWorkspace = local ?? {
      version: 2,
      activeConversationId: blank.id,
      conversations: [blank],
      people: [],
      memories: [],
      updatedAt: now,
    };
    const resumeId = readResumeParam(window.location.search);
    const applyWorkspace = (loaded: AskWorkspace) => {
      // 「結果を保存する」からログインして戻ったら、押したときの会話を開く。
      const workspace = withResumedConversation(loaded, local, resumeId);
      if (resumeId && workspace.activeConversationId === resumeId) {
        setResumedConversationId(resumeId);
        resumePending.current = true;
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("resume");
          window.history.replaceState(null, "", url.pathname + url.search);
        } catch {
          // URL を書き換えられなくても会話は開ける。
        }
      }
      setConversations(workspace.conversations.map(toChatConversation));
      setActiveConversationId(workspace.activeConversationId);
      setPeople(workspace.people);
      setMemories(workspace.memories);
      setWorkspaceUpdatedAt(workspace.updatedAt);
    };
    if (!likelySignedIn()) {
      applyWorkspace(fallback);
      setStorageReady(true);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/ask-data", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("cloud-unavailable");
        const body: unknown = await response.json();
        const candidate =
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>).data
            : null;
        const remote = parseAskWorkspace(candidate, now);
        cloudWorkspacePresent.current = Boolean(remote);
        const chosen =
          remote && (!local || remote.updatedAt > fallback.updatedAt)
            ? remote
            : fallback;
        applyWorkspace(chosen);
        setCloudEnabled(true);
        setCloudStorage("saved");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          applyWorkspace(fallback);
          setCloudStorage("error");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setStorageReady(true);
      });
    return () => controller.abort();
  }, [initialQuestion, persistConversation]);

  useEffect(() => {
    if (!agentEnabled || !persistConversation || !storageReady) return;
    let alive = true;
    const revision = registeredPeopleRevision.current;
    void loadRegisteredAskPeople()
      .then((registered) => {
        if (!alive || revision !== registeredPeopleRevision.current) return;
        if (registered.length) {
          const now = new Date().toISOString();
          setPeople((current) =>
            mergeRegisteredAskPeople(current, registered, now),
          );
          setWorkspaceUpdatedAt(now);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive && revision === registeredPeopleRevision.current)
          setRegisteredPeopleReady(true);
      });
    return () => {
      alive = false;
    };
  }, [agentEnabled, persistConversation, storageReady]);

  useEffect(() => {
    if (!persistConversation || !storageReady) return;
    const serializedConversations: AskConversation[] = conversations.map(
      (conversation) => ({
        ...conversation,
        messages: storedMessages(conversation.messages),
      }),
    );
    const workspace: AskWorkspace = {
      version: 2,
      activeConversationId,
      conversations: serializedConversations,
      people,
      memories,
      updatedAt: workspaceUpdatedAt,
    };
    if (isAskWorkspaceEmpty(workspace)) {
      try {
        localStorage.removeItem(ASK_DATA_STORAGE_KEY);
        localStorage.removeItem(LEGACY_ASK_STORAGE_KEY);
      } catch {
        // localStorage can be unavailable when browser storage is disabled.
      }
      // 匿名なら「保存データなし」で十分。ログイン中は空の状態も送らないと、
      // クラウドに残った最後の会話が次回の読込で復活する。
      // ただしクラウドにも何も無い初回表示では、空の既定値を新規保存しない。
      if (!cloudEnabled || !cloudWorkspacePresent.current) return;
    } else {
      try {
        localStorage.setItem(ASK_DATA_STORAGE_KEY, JSON.stringify(workspace));
        localStorage.removeItem(LEGACY_ASK_STORAGE_KEY);
      } catch {
        // Private browsing and storage quotas can make localStorage unavailable.
      }
    }
    if (!cloudEnabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setCloudStorage("saving");
      // 応答前に中断しても、サーバー側では保存が完了していることがある。
      // 以後に全削除されたら空状態を送れるよう、送信開始時点で印を付ける。
      cloudWorkspacePresent.current = true;
      void fetch("/api/ask-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: workspace }),
        signal: controller.signal,
      })
        .then((response) => {
          if (response.ok) cloudWorkspacePresent.current = true;
          setCloudStorage(response.ok ? "saved" : "error");
          if (response.ok && resumePending.current) {
            resumePending.current = false;
            setResumeSaved(true);
            postSaveOffer("resumed", "ask");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setCloudStorage("error");
        });
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeConversationId,
    cloudEnabled,
    conversations,
    memories,
    people,
    persistConversation,
    storageReady,
    workspaceUpdatedAt,
  ]);

  useEffect(() => {
    if (!agentEnabled) return;
    const revision = remainingRevision.current;
    const controller = new AbortController();
    void fetch("/api/mcp-chain/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        setBillingPaused(data.paused === "billing");
        if (data.remaining && revision === remainingRevision.current)
          setRemaining(String(data.remaining.requests));
        if (
          typeof data.voiceSignedIn === "boolean" &&
          revision === remainingRevision.current
        )
          setVoiceSignedIn(data.voiceSignedIn);
      })
      // 状態が取れなくても「確認中」で止めない。最終判定はサーバーの 401。
      .catch(() => {
        if (!controller.signal.aborted)
          setVoiceSignedIn((current) => current ?? true);
      });
    return () => controller.abort();
  }, [agentEnabled]);

  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (municipality.length < 2) {
        setSuggestions([]);
        return;
      }
      void fetch(
        "/api/mcp-chain/municipalities?q=" + encodeURIComponent(municipality),
        { signal: abort.signal },
      )
        .then((response) => response.json())
        .then((data) => setSuggestions(data.names ?? []))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [municipality]);

  useEffect(() => {
    if (!followLatest.current) return;
    threadEndRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages, voiceMessages, voiceTools]);

  useEffect(() => {
    const clear = () => {
      conversationRevision.current += 1;
      registeredPeopleRevision.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      try {
        localStorage.removeItem(ASK_DATA_STORAGE_KEY);
        localStorage.removeItem(LEGACY_ASK_STORAGE_KEY);
      } catch {
        // localStorage can be unavailable when browser storage is disabled.
      }
      const now = new Date().toISOString();
      const blank = newConversation(now);
      setPrivacyRevision((revision) => revision + 1);
      setConversations([blank]);
      setActiveConversationId(blank.id);
      setPeople([]);
      setMemories([]);
      setWorkspaceUpdatedAt(now);
      setBirthDate("");
      setMunicipality("");
      setYear("");
      setVoiceMessages([]);
      setVoiceTools([]);
      setCalculationBlocks([]);
      setCalls([]);
      setCalculationReasons([]);
      setCalculationFollowUps([]);
      setCalculationComplete(false);
      setMessage("");
      setRunning(false);
      cloudWorkspacePresent.current = false;
      setCloudEnabled(false);
      setCloudStorage("local");
      setRegisteredPeopleReady(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ASK_DATA_STORAGE_KEY && event.newValue) {
        const workspace = parseAskWorkspaceJson(event.newValue);
        if (!workspace) return;
        conversationRevision.current += 1;
        abortRef.current?.abort();
        setConversations(workspace.conversations.map(toChatConversation));
        setActiveConversationId(workspace.activeConversationId);
        setPeople(workspace.people);
        setMemories(workspace.memories);
        setWorkspaceUpdatedAt(workspace.updatedAt);
        setRunning(false);
        return;
      }
      if (
        event.key === null ||
        (event.key === ASK_DATA_STORAGE_KEY && event.newValue === null)
      )
        clear();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("account-data-cleared", clear);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("account-data-cleared", clear);
    };
  }, []);

  async function locate(lat: number, lon: number) {
    const response = await fetch(
      `/api/geocode/reverse?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`,
    );
    const data = await response.json();
    const name = data.data?.name;
    return typeof name === "string" ? name : "";
  }

  async function locateCurrentMunicipality(): Promise<string> {
    if (!navigator.geolocation) {
      setMessage("この端末では位置情報を利用できません。");
      throw new Error("geolocation-unavailable");
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void locate(position.coords.latitude, position.coords.longitude)
            .then((name) => {
              if (!name) throw new Error("municipality-not-found");
              resolve(name);
            })
            .catch(() => {
              setMessage("市区町村を取得できませんでした。");
              reject(new Error("municipality-not-found"));
            });
        },
        () => {
          setMessage("位置情報を取得できませんでした。");
          reject(new Error("geolocation-denied"));
        },
      );
    });
  }

  function savePerson(edits: PersonEdits) {
    const now = new Date().toISOString();
    const duplicate = !edits.id
      ? people.find(
          (person) =>
            person.birthDate === edits.birthDate &&
            (samePersonLabel(person.name, edits.name) ||
              samePersonResidence(person.residence, edits.residence)),
        )
      : undefined;
    if (duplicate) {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                personIds: [
                  ...new Set([...conversation.personIds, duplicate.id]),
                ].slice(0, ASK_DATA_LIMITS.selectedPeople),
                updatedAt: now,
              }
            : conversation,
        ),
      );
      setWorkspaceUpdatedAt(now);
      setMessage(`${duplicate.name}は登録済みのため、相談対象に選びました。`);
      return;
    }
    if (!edits.id && people.length >= ASK_DATA_LIMITS.people) {
      setMessage(
        "保存できる人物は20人までです。不要な人物を削除してから追加してください。",
      );
      return;
    }
    const personId = edits.id ?? nextEntityId("person");
    const person: AskPerson = {
      id: personId,
      name: edits.name.trim().slice(0, 40),
      birthDate: edits.birthDate,
      ...(edits.birthPlace.trim()
        ? { birthPlace: edits.birthPlace.trim().slice(0, 80) }
        : {}),
      ...(edits.residence.trim()
        ? { residence: edits.residence.trim().slice(0, 80) }
        : {}),
      createdAt:
        people.find((candidate) => candidate.id === personId)?.createdAt ?? now,
      updatedAt: now,
    };
    setPeople((current) => {
      const exists = current.some((candidate) => candidate.id === personId);
      return exists
        ? current.map((candidate) =>
            candidate.id === personId ? person : candidate,
          )
        : [...current, person];
    });
    setWorkspaceUpdatedAt(now);
    if (!edits.id)
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                personIds: [...conversation.personIds, personId].slice(
                  0,
                  ASK_DATA_LIMITS.selectedPeople,
                ),
                updatedAt: now,
              }
            : conversation,
        ),
      );
    setMessage(`${person.name}を相談プロフィールに保存しました。`);
  }

  function deletePerson(personId: string) {
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setPeople((current) => current.filter((person) => person.id !== personId));
    setConversations((current) =>
      current.map((conversation) => ({
        ...conversation,
        personIds: conversation.personIds.filter((id) => id !== personId),
        updatedAt: conversation.personIds.includes(personId)
          ? now
          : conversation.updatedAt,
      })),
    );
  }

  function togglePerson(personId: string) {
    const selected = activeConversation?.personIds.includes(personId) ?? false;
    if (
      !selected &&
      (activeConversation?.personIds.length ?? 0) >=
        ASK_DATA_LIMITS.selectedPeople
    ) {
      setMessage("相談対象は一度に8人まで選べます。");
      return;
    }
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== activeConversationId) return conversation;
        return {
          ...conversation,
          personIds: selected
            ? conversation.personIds.filter((id) => id !== personId)
            : [...conversation.personIds, personId],
          updatedAt: now,
        };
      }),
    );
  }

  function chooseGuidePerson(personId?: string) {
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              personIds: personId ? [personId] : [],
              updatedAt: now,
            }
          : conversation,
      ),
    );
  }

  function peopleForQuestion(text: string): AgentPerson[] | undefined {
    const userQuestions = [
      ...messages
        .filter((item) => item.role === "user")
        .map((item) => item.content),
      text,
    ];
    const needsNoProfile = isAgentGeneralQuestion(text);
    if (needsNoProfile) return undefined;
    const consultation = userQuestions.some(isAskConsultation);
    const includeBirth = consultation || userQuestions.some(needsAgentBirth);
    const includeResidence =
      consultation || userQuestions.some(needsAgentOrigin);
    if (!includeBirth && !includeResidence) return undefined;
    const profiles = selectedPeople.map((person) => ({
      id: person.id,
      name: person.name,
      ...(includeResidence &&
      (chosenOrigins.current.get(`${activeConversationId}:${person.id}`) ??
        person.origin)
        ? {
            origin:
              chosenOrigins.current.get(
                `${activeConversationId}:${person.id}`,
              ) ?? person.origin,
          }
        : {}),
      ...(includeBirth && person.birthDate
        ? { birthDate: person.birthDate }
        : {}),
      ...(includeBirth && person.birthPlace
        ? { birthPlace: person.birthPlace }
        : {}),
      ...(includeResidence && person.residence
        ? { residence: person.residence }
        : {}),
    }));
    return profiles.length ? profiles : undefined;
  }

  function updateAssistant(
    id: string,
    update: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((item) => (item.id === id ? update(item) : item)),
    );
  }

  const surface = persistConversation ? "ask" : "home";
  const saveOfferKey = persistConversation
    ? activeConversationId
    : homeConversationKey;
  const saveOfferCounts: Partial<Record<SaveOfferFieldKey, number>> =
    persistConversation
      ? {
          conversations: conversations.filter(
            (conversation) => conversation.messages.length > 0,
          ).length,
          memories: memories.length,
          people: people.length,
        }
      : { conversations: 1, memories: 0, people: 0 };

  function handleSaveOffer(messageId: string, action: "accept" | "decline") {
    const target = messages.find((item) => item.id === messageId);
    if (!target?.saveOffer || target.saveOffer.status !== "open") return;
    const key = target.saveOffer.card.conversationKey;
    if (action === "decline") {
      postSaveOffer("declined", surface, key);
      updateAssistant(messageId, (current) =>
        current.saveOffer
          ? {
              ...current,
              saveOffer: { ...current.saveOffer, status: "declined" },
            }
          : current,
      );
      return;
    }
    postSaveOffer("accepted", surface, key);
    updateAssistant(messageId, (current) =>
      current.saveOffer
        ? {
            ...current,
            saveOffer: { ...current.saveOffer, status: "accepting" },
          }
        : current,
    );
    // ここでは何もアップロードしない。会話を端末の相談に置いてから
    // ログインへ進み、戻った先の /ask で既存の同期が保存する。
    let resumeId: string | null = activeConversationId;
    if (!persistConversation) {
      try {
        resumeId = stashConversationForResume(localStorage, {
          id: nextEntityId("conversation"),
          messages: storedMessages(messages),
        });
      } catch {
        resumeId = null;
      }
    }
    window.location.assign(
      resumeId ? saveOfferLoginPath(resumeId) : "/login?next=%2Fask",
    );
  }

  async function submitAgent(
    event: FormEvent<HTMLFormElement> | string,
    pickedOrigin?: AskOrigin,
  ) {
    if (typeof event !== "string") event.preventDefault();
    const text = (typeof event === "string" ? event : question).trim();
    if (!text || running) return;
    const revision = conversationRevision.current;
    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: text,
      state: "done",
    };
    const assistantId = nextMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      state: "streaming",
      blocks: [],
      tools: [],
    };
    const profiles = peopleForQuestion(text);
    if (profiles) {
      for (const person of profiles) {
        const selected = selectedPeople.find((p) => p.id === person.id);
        if (pickedOrigin && profiles.length === 1) {
          person.origin = pickedOrigin;
          chosenOrigins.current.set(
            `${activeConversationId}:${person.id}`,
            pickedOrigin,
          );
        } else if (selected?.active && !person.origin) {
          person.origin = savedOrigin;
        }
      }
    }
    const standaloneOrigin =
      pickedOrigin ?? chosenOrigins.current.get(activeConversationId);
    if (pickedOrigin && !profiles?.length)
      chosenOrigins.current.set(activeConversationId, pickedOrigin);
    const remembered = memoriesForApi(memories, activeConversationId);
    const contextCharacters =
      text.length +
      remembered.reduce((total, memory) => total + memory.length, 0) +
      (profiles ?? []).reduce(
        (total, person) =>
          total +
          person.id.length +
          person.name.length +
          (person.birthDate?.length ?? 0) +
          (person.birthPlace?.length ?? 0) +
          (person.residence?.length ?? 0) +
          (person.origin ? JSON.stringify(person.origin).length : 0),
        0,
      );
    const history = historyForApi(
      messages,
      Math.max(0, MAX_API_HISTORY_CHARACTERS - contextCharacters),
    );
    const abort = new AbortController();
    abortRef.current = abort;
    remainingRevision.current += 1;
    followLatest.current = true;
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setQuestion("");
    setMessage("回答を作成しています…");
    setRunning(true);
    try {
      const response = await fetch("/api/mcp-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          mode: "llm",
          question: text,
          ...(history.length ? { history } : {}),
          ...(profiles
            ? { people: profiles }
            : standaloneOrigin
              ? { profile: { origin: standaloneOrigin } }
              : {}),
          ...(remembered.length ? { memories: remembered } : {}),
          conversationKey: saveOfferKey,
        }),
      });
      const left = response.headers.get("X-Agent-Remaining-Requests");
      if (left !== null) setRemaining(left);
      if (!response.ok) {
        const data = await response.json();
        if (data.remaining) setRemaining(String(data.remaining.requests));
        throw new Error(data.error || "回答を始められませんでした。");
      }
      if (!response.body) throw new Error("回答を受け取れませんでした。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      let completedContent = "";
      let offerReceived = messages.some((message) => message.saveOffer);
      const receive = (item: AgentEvent | ChainEvent) => {
        if (item.type === "blocks")
          updateAssistant(assistantId, (current) => ({
            ...current,
            blocks: [
              ...(current.blocks ?? []),
              ...parseAnswerBlocks(item.blocks),
            ],
          }));
        else if (item.type === "text-delta") {
          completedContent += item.text;
          updateAssistant(assistantId, (current) => ({
            ...current,
            content: current.content + item.text,
          }));
        } else if (item.type === "save-offer") {
          // サーバー側でも 1 会話 1 回に絞っているが、画面でも重ねて出さない。
          if (offerReceived) return;
          offerReceived = true;
          updateAssistant(assistantId, (current) => ({
            ...current,
            saveOffer: { card: item.offer, status: "open" },
          }));
          postSaveOffer("shown", surface, item.offer.conversationKey);
        } else if (item.type === "reminder-offer") {
          updateAssistant(assistantId, (current) =>
            (current.reminderOffers ?? []).some(
              (card) =>
                card.date === item.offer.date &&
                card.direction === item.offer.direction,
            ) || (current.reminderOffers?.length ?? 0) >= 3
              ? current
              : {
                  ...current,
                  reminderOffers: [
                    ...(current.reminderOffers ?? []),
                    item.offer,
                  ],
                },
          );
        } else if (item.type === "tool-call")
          updateAssistant(assistantId, (current) => ({
            ...current,
            tools: [...(current.tools ?? []), item],
          }));
        else if (item.type === "tool-result")
          updateAssistant(assistantId, (current) => ({
            ...current,
            tools: (current.tools ?? []).map((call) =>
              call.id === item.id ? { ...call, result: item } : call,
            ),
          }));
        else if (item.type === "done") {
          completed = true;
          if (item.reasons.includes(AGENT_PAUSED_REASON))
            setBillingPaused(true);
          else if (!item.reasons.length) setBillingPaused(false);
          let guidance = "guidance" in item ? item.guidance : undefined;
          // 新しい回答ボタンがある場合、旧フォームで同じ不足項目を重ねて聞かない。
          if (
            "answerFields" in item &&
            item.answerFields &&
            guidance?.intent !== "star" &&
            guidance?.fields.length
          )
            guidance = undefined;
          if (guidance && (guidance.fields.length || !guidance.links.length)) {
            if (
              activeConversation?.guidancePrompted ||
              guidancePrompted.current.has(activeConversationId)
            )
              guidance = undefined;
            else {
              guidancePrompted.current.add(activeConversationId);
              const promptedAt = new Date().toISOString();
              setWorkspaceUpdatedAt(promptedAt);
              setConversations((current) =>
                current.map((conversation) =>
                  conversation.id === activeConversationId
                    ? {
                        ...conversation,
                        guidancePrompted: true,
                        updatedAt: promptedAt,
                      }
                    : conversation,
                ),
              );
            }
          }
          const suggestions = sanitizeFollowUpSuggestions(item.suggestions);
          updateAssistant(assistantId, (current) => ({
            ...current,
            state: "done",
            reasons: item.reasons,
            answerSource: "source" in item ? item.source : undefined,
            answerFields:
              "answerFields" in item ? item.answerFields : undefined,
            ...(guidance ? { guidance } : {}),
            ...(suggestions.length ? { suggestions } : {}),
          }));
          const now = new Date().toISOString();
          const memory =
            "memoryEligible" in item && item.memoryEligible === true
              ? memoryFromConversation(
                  {
                    id: activeConversationId,
                    messages: [
                      ...storedMessages(messages),
                      { role: "user", content: text },
                      { role: "assistant", content: completedContent },
                    ],
                  },
                  now,
                )
              : null;
          if (memory)
            setMemories((current) => {
              const existing = current.find((item) => item.id === memory.id);
              const next = existing
                ? current.map((item) =>
                    item.id === memory.id
                      ? { ...memory, createdAt: item.createdAt }
                      : item,
                  )
                : [...current, memory];
              return dedupeAskMemories(next).slice(-ASK_DATA_LIMITS.memories);
            });
          if (memory) setWorkspaceUpdatedAt(now);
          setMessage(
            item.reasons.length
              ? "回答ができました。確認状況にお知らせがあります。"
              : "回答ができました。",
          );
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          abort.signal.throwIfAborted();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          if (done && pending.trim()) lines.push(pending);
          for (const line of lines) {
            if (!line.trim()) continue;
            receive(JSON.parse(line) as AgentEvent | ChainEvent);
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed) throw new Error("回答の受信が途中で終了しました。");
    } catch (error) {
      if (revision !== conversationRevision.current) return;
      const text = abort.signal.aborted
        ? "回答を中止しました。"
        : error instanceof Error
          ? error.message
          : "回答に失敗しました。";
      updateAssistant(assistantId, (current) => ({
        ...current,
        content: current.content || text,
        state: "error",
      }));
      setMessage(text);
    } finally {
      if (revision === conversationRevision.current) {
        setRunning(false);
        abortRef.current = null;
      }
    }
  }

  async function submitCalculation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    const form = new FormData(event.currentTarget);
    const abort = new AbortController();
    abortRef.current = abort;
    setCalls([]);
    setCalculationBlocks([]);
    setCalculationReasons([]);
    setCalculationFollowUps([]);
    setCalculationComplete(false);
    setMessage("計算しています…");
    setRunning(true);
    try {
      const response = await fetch("/api/mcp-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          birthDate,
          municipality,
          date: form.get("date") || undefined,
          depth: Number(form.get("depth")),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "計算を始められませんでした。");
      }
      if (!response.body) throw new Error("結果を受け取れませんでした。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          abort.signal.throwIfAborted();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          if (done && pending.trim()) lines.push(pending);
          for (const line of lines) {
            if (!line.trim()) continue;
            const item = JSON.parse(line) as ChainEvent | AgentEvent;
            if (item.type === "blocks")
              setCalculationBlocks((current) => [
                ...current,
                ...parseAnswerBlocks(item.blocks),
              ]);
            else if (item.type === "call")
              setCalls((current) => [...current, item]);
            else if (item.type === "done") {
              completed = true;
              if (item.reasons.includes(AGENT_PAUSED_REASON))
                setBillingPaused(true);
              else if (!item.reasons.length) setBillingPaused(false);
              setCalculationReasons(item.reasons);
              setCalculationFollowUps(
                sanitizeFollowUpSuggestions(item.suggestions),
              );
              setCalculationComplete(true);
              setMessage(
                item.reasons.length
                  ? "計算が完了しました。確認状況にお知らせがあります。"
                  : "計算が完了しました。",
              );
            }
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed) throw new Error("結果の受信が途中で終了しました。");
    } catch (error) {
      setMessage(
        abort.signal.aborted
          ? "計算を中止しました。"
          : error instanceof Error
            ? error.message
            : "計算に失敗しました。",
      );
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function startNewChat() {
    if (!activeConversation) return;
    if (
      activeConversation.messages.length === 0 &&
      !activeConversation.draft.trim()
    ) {
      textareaRef.current?.focus();
      return;
    }
    if (conversations.length >= ASK_DATA_LIMITS.conversations) {
      setMessage(
        "保存できる会話は30件までです。不要な会話を削除してから追加してください。",
      );
      return;
    }
    conversationRevision.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const now = new Date().toISOString();
    const conversation = newConversation(now);
    setConversations((current) => [
      conversation,
      ...current.map((item) =>
        item.id === activeConversationId
          ? stopStreamingConversation(item, now)
          : item,
      ),
    ]);
    setWorkspaceUpdatedAt(conversation.updatedAt);
    setActiveConversationId(conversation.id);
    setVoiceMessages([]);
    setVoiceTools([]);
    setMessage("");
    setRunning(false);
    followLatest.current = true;
    textareaRef.current?.focus();
  }

  function openConversation(id: string) {
    if (id === activeConversationId) return;
    conversationRevision.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const now = new Date().toISOString();
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? stopStreamingConversation(conversation, now)
          : conversation,
      ),
    );
    setActiveConversationId(id);
    setWorkspaceUpdatedAt(now);
    setVoiceMessages([]);
    setVoiceTools([]);
    setMessage("");
    setRunning(false);
    followLatest.current = true;
  }

  function renameConversation(id: string, title: string) {
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id
          ? {
              ...conversation,
              title: title.trim().slice(0, 80),
              titleEdited: true,
              updatedAt: now,
            }
          : conversation,
      ),
    );
  }

  function deleteConversation(id: string) {
    const now = new Date().toISOString();
    setWorkspaceUpdatedAt(now);
    setMemories((current) =>
      current.filter((memory) => memory.sourceConversationId !== id),
    );
    const remainingConversations = conversations.filter(
      (conversation) => conversation.id !== id,
    );
    if (id === activeConversationId) {
      conversationRevision.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      const replacement = remainingConversations[0] ?? newConversation(now);
      setActiveConversationId(replacement.id);
      setConversations(
        remainingConversations.length ? remainingConversations : [replacement],
      );
      setRunning(false);
      setVoiceMessages([]);
      setVoiceTools([]);
    } else {
      setConversations(remainingConversations);
    }
  }

  function tree(parentId: number | null): React.ReactNode {
    return (
      <ul className="space-y-3 border-l border-slate-300 pl-3">
        {calls
          .filter((call) => call.parentId === parentId)
          .map((call) => (
            <li key={call.id}>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <h3 className="break-all font-semibold">
                  {toolLabels[call.tool] ?? call.tool}
                </h3>
                <p className="text-xs text-slate-600">
                  深さ{call.depth}・{call.durationMs}ms
                </p>
                <p
                  className={`mt-2 text-sm ${call.error ? "text-red-800" : "text-slate-800"}`}
                >
                  {call.summary}
                </p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">
                    詳しい入出力を見る（出典を含む）
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(
                      {
                        tool: call.tool,
                        input: call.input,
                        output: call.output,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
              {calls.some((child) => child.parentId === call.id) && (
                <div className="mt-3">{tree(call.id)}</div>
              )}
            </li>
          ))}
      </ul>
    );
  }

  const profilePreview = peopleForQuestion(question);
  const guidanceSaved =
    selectedPeople[0] ?? people.find((person) => person.active) ?? people[0];
  const previousConversation = conversations.find(
    (conversation) =>
      conversation.id !== activeConversationId &&
      conversation.messages.some((message) => message.role === "user"),
  );
  const guidancePrevious = previousConversation
    ? guidanceValuesFromText(
        previousConversation.messages
          .filter((message) => message.role === "user")
          .map((message) => message.content)
          .join("\n"),
      )
    : undefined;
  const lastAssistant = [...messages]
    .reverse()
    .find((item) => item.role === "assistant");
  const contextualQuestions = sanitizeFollowUpSuggestions(
    lastAssistant?.suggestions,
  );
  const suggestedQuestions = lastAssistant?.guidance
    ? []
    : contextualQuestions.length
      ? contextualQuestions
      : followUps(messages);
  const calculationContext = `${question} ${municipality}`.trim();
  const calculationFallbackMessages: ChatMessage[] = calculationContext
    ? [
        {
          id: "calculation-follow-up-context",
          role: "user",
          content: calculationContext,
          state: "done",
        },
      ]
    : [];
  const calculationSuggestedQuestions = calculationFollowUps.length
    ? calculationFollowUps
    : followUps(calculationFallbackMessages);
  const showFollowUps =
    messages.length > 0 &&
    messages.at(-1)?.role === "assistant" &&
    messages.at(-1)?.state !== "streaming";

  if (!storageReady || !registeredPeopleReady)
    return (
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white/70 p-5 text-sm text-slate-600">
        保存した相談と登録済みの人物を読み込んでいます…
      </section>
    );

  return (
    <section className="mt-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!agentEnabled && (
            <p className="text-sm text-slate-600">
              AI回答は現在無効です。計算の連鎖だけを表示します。
            </p>
          )}
          {remaining !== undefined && (
            <p className="text-xs text-slate-500">
              この接続の本日のAI無料枠：残り{remaining}
              回（概算・インスタンス内）
            </p>
          )}
          {persistConversation &&
            (cloudEnabled || cloudStorage === "error") && (
              <p className="mt-1 text-xs text-slate-500">
                {cloudStorage === "saving"
                  ? "相談データをアカウントへ保存中…"
                  : cloudStorage === "error"
                    ? "アカウントへ同期できませんでした。端末には保存済みです。"
                    : "相談データはアカウントにも保存されます。"}
              </p>
            )}
        </div>
        {useAgent && !persistConversation && (
          <button
            type="button"
            onClick={startNewChat}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            ＋ 新しいチャット
          </button>
        )}
      </div>

      {agentEnabled && (
        <p className="text-sm leading-relaxed text-slate-600">
          {mock
            ? "開発用モックです。質問にかかわらず、1990年5月5日生まれ・深谷市・2026年11月の固定例を計算します。外部AIには送信しません。"
            : "送信した質問・会話履歴・過去の相談メモ・必要な人物プロフィールと道具の結果をGoogleの生成AIに送ります。本名・連絡先・詳しい住所は入力しないでください。"}
          {persistConversation
            ? cloudEnabled
              ? " 会話・相談メモ・人物プロフィールはこの端末とログイン中のアカウントに保存されます。"
              : " 会話・相談メモ・人物プロフィールはこの端末のブラウザに保存されます。ログイン中はアカウントにも同期します。"
            : " 会話はこの画面を開いている間だけ保持し、サーバーには保存されません。"}
        </p>
      )}

      {useAgent ? (
        <>
          {question.trim() && (
            <p className="text-xs text-slate-600">
              {profilePreview
                ? `この質問と一緒に送る相談対象：${profilePreview
                    .map((person) => person.name)
                    .join("、")}`
                : "この質問では人物プロフィールを送信しません。"}
            </p>
          )}
          {persistConversation && (
            <AskMemoryPanel
              memories={dedupeAskMemories(memories)}
              onDelete={(id) => {
                setWorkspaceUpdatedAt(new Date().toISOString());
                setMemories((current) =>
                  current.filter((memory) => memory.id !== id),
                );
              }}
            />
          )}
        </>
      ) : (
        <section
          aria-labelledby="ask-profile-heading"
          className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5"
        >
          <h2 id="ask-profile-heading" className="font-semibold">
            計算する人
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            計算のみモードは1人ずつ実行します。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              生年月日
              <input
                aria-label="生年月日"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              現在お住まいの市区町村
              <datalist id={listId}>
                {suggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <input
                aria-label="現在お住まいの市区町村"
                list={listId}
                value={municipality}
                onChange={(event) => setMunicipality(event.target.value)}
                minLength={2}
                maxLength={80}
                placeholder="都道府県・市区町村"
                className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-3 text-sm underline underline-offset-2"
            onClick={() =>
              void locateCurrentMunicipality()
                .then(setMunicipality)
                .catch(() => {})
            }
          >
            現在地から市区町村を入力（位置情報の許可が必要）
          </button>
        </section>
      )}

      {agentEnabled && billingPaused && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">
          {AGENT_PAUSED_TEXT}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {agentEnabled && (
          <label className="text-sm">
            <input
              type="checkbox"
              checked={calculationOnly}
              disabled={running}
              onChange={(event) => {
                const checked = event.target.checked;
                if (checked && selectedPeople[0]) {
                  setBirthDate(selectedPeople[0].birthDate);
                  setMunicipality(selectedPeople[0].residence ?? "");
                  setYear(selectedPeople[0].birthDate.slice(0, 4));
                }
                setCalculationOnly(checked);
              }}
            />{" "}
            AIを使わず計算のみ
          </label>
        )}
        {!(selectedPeople.length
          ? selectedPeople.every((p) => p.birthDate)
          : people.some((p) => p.active && p.birthDate)) && (
          <AgentBirthYear key={privacyRevision} />
        )}
      </div>

      {voiceEnabled && useAgent && (
        <>
          {voiceSignedIn === null ? (
            <p className="rounded-2xl border border-slate-200 p-4 text-sm">
              音声のログイン状態を確認しています…
            </p>
          ) : (
            <GrokVoice
              key={`voice-${privacyRevision}`}
              disabled={running}
              signedIn={voiceSignedIn}
              onTranscript={(role, text) =>
                setVoiceMessages((current) => [...current, { role, text }])
              }
              onEvent={(event) => {
                if (event.type === "tool-call")
                  setVoiceTools((current) => [...current, event]);
                if (event.type === "tool-result")
                  setVoiceTools((current) =>
                    current.map((call) =>
                      call.id === event.id ? { ...call, result: event } : call,
                    ),
                  );
              }}
            />
          )}
        </>
      )}

      {useAgent ? (
        <div
          className={
            persistConversation
              ? "min-h-0 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-4"
              : ""
          }
        >
          {persistConversation && (
            <ConversationNavigation
              conversations={conversations}
              activeConversationId={activeConversationId}
              onOpen={openConversation}
              onNew={startNewChat}
              onRename={renameConversation}
              onDelete={deleteConversation}
            />
          )}
          <div className="flex h-[72dvh] min-h-96 min-w-0 flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white/45 shadow-sm sm:h-[min(76dvh,46rem)] sm:min-h-[32rem]">
            <AskPeoplePanel
              people={people}
              selectedIds={activeConversation?.personIds ?? []}
              disabled={running}
              onToggle={togglePerson}
              onSave={savePerson}
              onDelete={deletePerson}
              onLocate={locateCurrentMunicipality}
            />
            <div
              ref={threadRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-busy={running}
              aria-label="会話履歴"
              onScroll={() => {
                const thread = threadRef.current;
                if (!thread) return;
                followLatest.current =
                  thread.scrollHeight - thread.scrollTop - thread.clientHeight <
                  120;
              }}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-5 sm:px-6"
            >
              {messages.length === 0 && voiceMessages.length === 0 && (
                <ShirubeGuide
                  key={activeConversationId}
                  people={people}
                  selectedPeople={selectedPeople}
                  disabled={running}
                  onChoosePerson={chooseGuidePerson}
                  onSave={savePerson}
                  onSuggestion={(suggestion) => {
                    setQuestion(suggestion);
                    textareaRef.current?.focus();
                  }}
                  onLocate={locateCurrentMunicipality}
                />
              )}
              {messages.length === 0 && voiceMessages.length === 0 && (
                <FaqPanel
                  onQuestion={(value) => {
                    setQuestion(value);
                    textareaRef.current?.focus();
                  }}
                />
              )}
              {messages.map((item, index) => (
                <ConversationMessage
                  key={item.id}
                  message={item}
                  showName={
                    item.role === "assistant" &&
                    messages[index - 1]?.role !== "assistant"
                  }
                  saveOfferCounts={saveOfferCounts}
                  onSaveOffer={handleSaveOffer}
                  guidanceSaved={guidanceSaved}
                  guidancePrevious={guidancePrevious}
                  onDismissGuidance={(id) =>
                    updateAssistant(id, (current) => ({
                      ...current,
                      guidance: undefined,
                    }))
                  }
                />
              ))}
              {voiceMessages.map((item, index) => {
                const role = item.role === "user" ? "user" : "assistant";
                const previousRole =
                  index === 0
                    ? messages.at(-1)?.role
                    : voiceMessages[index - 1]?.role;
                return (
                  <ConversationMessage
                    key={`${item.role}-${index}`}
                    message={{
                      id: `voice-${index}`,
                      role,
                      content: item.text,
                      state: "done",
                    }}
                    showName={
                      role === "assistant" && previousRole !== "assistant"
                    }
                  />
                );
              })}
              {voiceTools.length > 0 && (
                <ToolStatus
                  message={{
                    id: "voice-tools",
                    role: "assistant",
                    content: "",
                    state: "done",
                    tools: voiceTools,
                  }}
                />
              )}
              {resumeSaved &&
                resumedConversationId === activeConversationId && (
                  <ConversationMessage
                    message={{
                      id: "save-offer-resumed",
                      role: "assistant",
                      content:
                        "おかえりなさい。この相談をアカウントに保存しました。別の端末からもログインすれば見返せます。",
                      state: "done",
                    }}
                  />
                )}
              <div ref={threadEndRef} />
            </div>

            <form
              ref={invitationForm}
              onSubmit={(event) => void submitAgent(event)}
              className="sticky bottom-0 z-10 shrink-0 rounded-b-3xl border-t border-stone-200 bg-[#faf7f5]/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:p-4"
            >
              <AnswerChips
                key={`${activeConversationId}:${lastAssistant?.id ?? "empty"}`}
                fields={lastAssistant?.answerFields ?? []}
                disabled={running}
                savedOrigin={guidanceSaved?.origin ?? savedOrigin}
                birthDateKnown={Boolean(guidanceSaved?.birthDate)}
                onSend={(text) => void submitAgent(text)}
                onOrigin={(origin) => {
                  void (async () => {
                    const resolved =
                      origin.lat !== undefined && origin.lon !== undefined
                        ? await resolveOrigin(origin.lat, origin.lon)
                        : undefined;
                    await submitAgent(`出発地は${origin.name}です。`, resolved);
                  })();
                }}
              />
              {messages.length > 0 && (
                <div
                  className={`mb-3 flex gap-2 overflow-x-auto pb-1 ${
                    showFollowUps ? "" : "sm:flex-wrap"
                  }`}
                  aria-label={showFollowUps ? "次の質問の候補" : "質問例"}
                >
                  {suggestedQuestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={running}
                      onClick={() => {
                        setQuestion(suggestion);
                        textareaRef.current?.focus();
                      }}
                      className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-2 text-left text-xs leading-relaxed hover:bg-stone-50 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <label className="sr-only" htmlFor="ask-message">
                メッセージ
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  id="ask-message"
                  aria-label="メッセージ"
                  required
                  maxLength={500}
                  value={question}
                  disabled={running}
                  onChange={(event) => setQuestion(event.target.value)}
                  onCompositionStart={() => {
                    composing.current = true;
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                  }}
                  onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                    if (
                      event.key !== "Enter" ||
                      event.shiftKey ||
                      event.nativeEvent.isComposing ||
                      event.keyCode === 229 ||
                      composing.current
                    )
                      return;
                    event.preventDefault();
                    if (question.trim() && !running)
                      event.currentTarget.form?.requestSubmit();
                  }}
                  rows={1}
                  placeholder="ボタンに無いことはここに書けます"
                  className="max-h-40 min-h-10 flex-1 resize-y rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-slate-500 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={running || !question.trim()}
                  className="min-h-14 shrink-0 rounded-2xl bg-slate-800 px-4 text-sm font-semibold text-white disabled:opacity-40 sm:px-6"
                >
                  送信
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="text-xs text-slate-500">
                  Enterで送信・Shift+Enterで改行　{question.length}/500文字
                </span>
                {running && (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="text-xs underline underline-offset-2"
                  >
                    回答を中止
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submitCalculation}
          className="rounded-2xl border border-slate-200 bg-white/80 p-4 sm:p-5"
        >
          <label className="mb-4 block text-sm">
            自由文から入力
            <input
              ref={calculationQuestionRef}
              aria-label="自由文から入力"
              value={question}
              maxLength={500}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
              onChange={(event) => {
                setQuestion(event.target.value);
                const value = extractAgentInput(event.target.value);
                setBirthDate(value.birthDate);
                setYear(value.year);
                setMunicipality(value.municipality);
              }}
              placeholder="生年月日と現在お住まいの市区町村"
            />
          </label>
          {year && !birthDate && (
            <p className="mb-3 text-sm">
              この連鎖では日柱・空亡も使うため、月日を入力してください。本命星だけなら上の端末内計算で年から確認できます。
            </p>
          )}
          <fieldset disabled={running} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              対象日（空欄は日本時間の今日）
              <input
                name="date"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
              />
            </label>
            <label className="text-sm">
              展開の深さ
              <select
                name="depth"
                defaultValue="3"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
              >
                <option value="3">3：出発地の候補まで</option>
                <option value="4">4：候補の街からさらに展開</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={!birthDate || municipality.length < 2}
              className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2"
            >
              道具を順番に呼び出す
            </button>
          </fieldset>
          {running && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="mt-3 text-sm underline"
            >
              計算を中止
            </button>
          )}
        </form>
      )}

      {/* 計算中は案内役が羅盤を見ている。読み上げは直下の status が担うので
          ここは装飾（aria-hidden）。状態の文そのものは変えない。 */}
      {running && (
        <div
          aria-hidden="true"
          data-testid="guide-waiting"
          className="flex items-center gap-3 text-sm text-slate-600"
        >
          <GuideAvatar pose="compass" size="sm" decorative />
          <span>しるべが羅盤で確かめています…</span>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-sm leading-relaxed">
        {message}
      </p>

      {!useAgent && <AnswerBlocks blocks={calculationBlocks} />}
      {!useAgent && calculationComplete && (
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-4">
          <p className="text-sm font-medium text-slate-800">次に確認するなら</p>
          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap"
            aria-label="次の質問の候補"
          >
            {calculationSuggestedQuestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={running}
                onClick={() => {
                  setQuestion(suggestion);
                  calculationQuestionRef.current?.focus();
                }}
                className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-2 text-left text-xs leading-relaxed hover:bg-stone-50 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            選ぶと入力欄に入ります。内容を確認してから編集・送信できます。
          </p>
        </section>
      )}
      {!useAgent && calls.length > 0 && (
        <details className="rounded-2xl border border-stone-200 bg-white/70 p-5">
          <summary className="cursor-pointer font-semibold">
            計算に使った道具：{calls.length}件
          </summary>
          {calculationReasons.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {calculationReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-4">{tree(null)}</div>
        </details>
      )}
    </section>
  );
}

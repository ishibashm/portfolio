"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnswerBlocks } from "@/components/home/AnswerBlocks";
import { AgentAnswer } from "@/components/home/AgentAnswer";
import { AgentBirthYear } from "@/components/home/AgentBirthYear";
import { ASK_CONVERSATION_STORAGE_KEY } from "@/lib/accountData";
import { parseAnswerBlocks, type AnswerBlock } from "@/lib/answerBlocks";
import {
  extractAgentInput,
  isAgentGeneralQuestion,
  needsAgentBirth,
  needsAgentOrigin,
} from "@/lib/agentInput";
import type {
  AgentConversationMessage,
  AgentEvent,
  AgentProfile,
} from "@/lib/mcpAgent";
import type { ChainEvent } from "@/lib/mcpChain";
import {
  readSettingsSync,
  SETTINGS_KEY,
  settingNumber,
  settingString,
} from "@/lib/userSettings";

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
};
type StoredConversation = {
  version: 1;
  messages: Pick<ChatMessage, "role" | "content">[];
  profile: { birthDate: string; residence: string; fromSaved: boolean };
  draft: string;
};

export { ASK_CONVERSATION_STORAGE_KEY } from "@/lib/accountData";
const MAX_STORED_MESSAGES = 40;
const MAX_API_HISTORY_MESSAGES = 10;
const MAX_API_HISTORY_CHARACTERS = 7000;
let messageSequence = 0;

const examples = [
  "1990年5月5日生まれ、深谷市在住。2026年11月に引越すならどの方位とどの日がよい？",
  "長崎市から東にある街を調べて、その街からさらに東の街を教えて。",
  "2026年11月1日の干支と九星気学での日取りの見方を教えて。",
];

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

function readStoredConversation(raw: string | null): StoredConversation | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.messages)) return null;
    const messages = record.messages
      .slice(-MAX_STORED_MESSAGES)
      .flatMap((item): Pick<ChatMessage, "role" | "content">[] => {
        if (!item || typeof item !== "object") return [];
        const message = item as Record<string, unknown>;
        if (
          (message.role !== "user" && message.role !== "assistant") ||
          typeof message.content !== "string" ||
          !message.content.trim() ||
          message.content.length > 12000
        )
          return [];
        return [{ role: message.role, content: message.content }];
      });
    const rawProfile =
      record.profile && typeof record.profile === "object"
        ? (record.profile as Record<string, unknown>)
        : {};
    const birthDate =
      typeof rawProfile.birthDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(rawProfile.birthDate) &&
      rawProfile.birthDate >= "1900-01-01" &&
      rawProfile.birthDate <= "2100-12-01"
        ? rawProfile.birthDate
        : "";
    const residence =
      typeof rawProfile.residence === "string" &&
      rawProfile.residence.trim().length >= 2 &&
      rawProfile.residence.length <= 80
        ? rawProfile.residence.trim()
        : "";
    return {
      version: 1,
      messages,
      profile: {
        birthDate,
        residence,
        fromSaved: rawProfile.fromSaved === true,
      },
      draft: typeof record.draft === "string" ? record.draft.slice(0, 500) : "",
    };
  } catch {
    return null;
  }
}

function historyForApi(
  messages: ChatMessage[],
  questionLength: number,
): AgentConversationMessage[] {
  const history: AgentConversationMessage[] = [];
  let remaining = MAX_API_HISTORY_CHARACTERS - questionLength;
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
  if (!lastQuestion) return examples;
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
    "選ぶときの注意点は？",
    "次に何を確認すればよい？",
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

function ConversationMessage({ message }: { message: ChatMessage }) {
  if (message.role === "user")
    return (
      <article className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-slate-800 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-white sm:max-w-[75%]">
        <h2 className="sr-only">あなた</h2>
        {message.content}
      </article>
    );
  return (
    <article
      className={`max-w-[96%] rounded-2xl rounded-bl-md border bg-white/95 p-4 shadow-sm sm:max-w-[85%] sm:p-5 ${
        message.state === "error" ? "border-red-200" : "border-stone-200"
      }`}
    >
      <h2 className="mb-2 text-xs font-semibold text-slate-500">AI</h2>
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
    </article>
  );
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
  const initialInput = extractAgentInput(initialQuestion);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voiceMessages, setVoiceMessages] = useState<
    { role: string; text: string }[]
  >([]);
  const [voiceTools, setVoiceTools] = useState<AgentToolCall[]>([]);
  const [question, setQuestion] = useState(initialQuestion);
  const [calculationBlocks, setCalculationBlocks] = useState<AnswerBlock[]>([]);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [calculationReasons, setCalculationReasons] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [calculationOnly, setCalculationOnly] = useState(false);
  const [consent, setConsent] = useState(false);
  const [birthDate, setBirthDate] = useState(initialInput.birthDate);
  const [municipality, setMunicipality] = useState(initialInput.municipality);
  const [year, setYear] = useState(initialInput.year);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [privacyRevision, setPrivacyRevision] = useState(0);
  const [remaining, setRemaining] = useState<string>();
  const [storageReady, setStorageReady] = useState(!persistConversation);
  const abortRef = useRef<AbortController | null>(null);
  const remainingRevision = useRef(0);
  const savedVersion = useRef(0);
  const conversationRevision = useRef(0);
  const composing = useRef(false);
  const followLatest = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const useAgent = agentEnabled && !calculationOnly;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!persistConversation) return;
    let stored: StoredConversation | null = null;
    try {
      stored = readStoredConversation(
        localStorage.getItem(ASK_CONVERSATION_STORAGE_KEY),
      );
    } catch {
      // localStorage can be unavailable when browser storage is disabled.
    }
    if (stored) {
      setMessages(
        stored.messages.map((item) => ({
          ...item,
          id: nextMessageId(),
          state: "done",
        })),
      );
      setBirthDate(stored.profile.birthDate);
      setMunicipality(stored.profile.residence);
      setConsent(stored.profile.fromSaved);
      if (!initialQuestion) setQuestion(stored.draft);
    }
    setStorageReady(true);
  }, [initialQuestion, persistConversation]);

  useEffect(() => {
    if (!persistConversation || !storageReady) return;
    if (!messages.length && !birthDate && !municipality && !question) {
      try {
        localStorage.removeItem(ASK_CONVERSATION_STORAGE_KEY);
      } catch {
        // localStorage can be unavailable when browser storage is disabled.
      }
      return;
    }
    const stored: StoredConversation = {
      version: 1,
      messages: messages
        .filter((item) => item.content.trim())
        .slice(-MAX_STORED_MESSAGES)
        .map(({ role, content }) => ({ role, content })),
      profile: {
        birthDate,
        residence: municipality,
        fromSaved: consent,
      },
      draft: question,
    };
    try {
      localStorage.setItem(
        ASK_CONVERSATION_STORAGE_KEY,
        JSON.stringify(stored),
      );
    } catch {
      // Private browsing and storage quotas can make localStorage unavailable.
    }
  }, [
    birthDate,
    consent,
    messages,
    municipality,
    persistConversation,
    question,
    storageReady,
  ]);

  useEffect(() => {
    if (!agentEnabled) return;
    const revision = remainingRevision.current;
    const controller = new AbortController();
    void fetch("/api/mcp-chain/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (data.remaining && revision === remainingRevision.current)
          setRemaining(String(data.remaining.requests));
      })
      .catch(() => {});
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
      savedVersion.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      try {
        localStorage.removeItem(ASK_CONVERSATION_STORAGE_KEY);
      } catch {
        // localStorage can be unavailable when browser storage is disabled.
      }
      setPrivacyRevision((revision) => revision + 1);
      setConsent(false);
      setBirthDate("");
      setMunicipality("");
      setYear("");
      setQuestion("");
      setMessages([]);
      setVoiceMessages([]);
      setVoiceTools([]);
      setCalculationBlocks([]);
      setCalls([]);
      setCalculationReasons([]);
      setMessage("");
      setRunning(false);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ASK_CONVERSATION_STORAGE_KEY) return;
      if (event.key === SETTINGS_KEY || event.key === null) clear();
    };
    window.addEventListener("metaphysical-config-updated", clear);
    window.addEventListener("storage", onStorage);
    window.addEventListener("account-data-cleared", clear);
    return () => {
      window.removeEventListener("metaphysical-config-updated", clear);
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

  async function applySaved(checked: boolean) {
    const version = ++savedVersion.current;
    setConsent(checked);
    if (!checked) {
      setBirthDate("");
      setMunicipality("");
      return;
    }
    const settings = readSettingsSync();
    const birth = settingString(settings, "birth_date")?.slice(0, 10) ?? "";
    setBirthDate(birth);
    let origin = extractAgentInput(
      settingString(settings, "base_label") ?? "",
    ).municipality;
    const lat = settingNumber(settings, "base_lat");
    const lon = settingNumber(settings, "base_lon");
    if (!origin && lat !== undefined && lon !== undefined)
      origin = await locate(lat, lon);
    if (version === savedVersion.current) setMunicipality(origin);
  }

  function profileForQuestion(text: string): AgentProfile | undefined {
    const userQuestions = [
      ...messages
        .filter((item) => item.role === "user")
        .map((item) => item.content),
      text,
    ];
    const explicit = extractAgentInput(text);
    const profile: AgentProfile = {};
    const needsNoProfile = isAgentGeneralQuestion(text);
    if (
      !needsNoProfile &&
      birthDate &&
      userQuestions.some(needsAgentBirth) &&
      !explicit.year
    )
      profile.birthDate = birthDate;
    if (
      !needsNoProfile &&
      municipality &&
      userQuestions.some(needsAgentOrigin) &&
      !explicit.municipality
    )
      profile.residence = municipality;
    return profile.birthDate || profile.residence ? profile : undefined;
  }

  function updateAssistant(
    id: string,
    update: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((item) => (item.id === id ? update(item) : item)),
    );
  }

  async function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
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
    const history = historyForApi(messages, text.length);
    const profile = profileForQuestion(text);
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
          ...(profile ? { profile } : {}),
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
      const receive = (item: AgentEvent | ChainEvent) => {
        if (item.type === "blocks")
          updateAssistant(assistantId, (current) => ({
            ...current,
            blocks: [
              ...(current.blocks ?? []),
              ...parseAnswerBlocks(item.blocks),
            ],
          }));
        else if (item.type === "text-delta")
          updateAssistant(assistantId, (current) => ({
            ...current,
            content: current.content + item.text,
          }));
        else if (item.type === "tool-call")
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
          updateAssistant(assistantId, (current) => ({
            ...current,
            state: "done",
            reasons: item.reasons,
          }));
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
              setCalculationReasons(item.reasons);
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
    conversationRevision.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setVoiceMessages([]);
    setVoiceTools([]);
    setQuestion("");
    setMessage("");
    setRunning(false);
    followLatest.current = true;
    textareaRef.current?.focus();
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

  const profilePreview = profileForQuestion(question);
  const suggestedQuestions = followUps(messages);
  const showFollowUps =
    messages.length > 0 &&
    messages.at(-1)?.role === "assistant" &&
    messages.at(-1)?.state !== "streaming";

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
        </div>
        {useAgent && (
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
            : "送信した質問・会話履歴・必要なプロフィールと道具の結果をGoogleの生成AIに送ります。氏名・連絡先・詳しい住所は入力しないでください。"}
          {persistConversation
            ? " 会話はこの端末のブラウザに保存され、サーバーには保存されません。"
            : " 会話はこの画面を開いている間だけ保持し、サーバーには保存されません。"}
        </p>
      )}

      <section
        aria-labelledby="ask-profile-heading"
        className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="ask-profile-heading" className="font-semibold">
              相談プロフィール
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              一度入力すると、この会話の必要な質問で使います。空欄のままでも相談できます。
            </p>
          </div>
          <label className="text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => void applySaved(event.target.checked)}
            />{" "}
            保存済みプロフィールを読み込む
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            生年月日
            <input
              aria-label="生年月日"
              value={birthDate}
              onChange={(event) => {
                savedVersion.current += 1;
                setConsent(false);
                setBirthDate(event.target.value);
              }}
              type="date"
              min="1900-01-01"
              max="2100-12-01"
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
              onChange={(event) => {
                savedVersion.current += 1;
                setConsent(false);
                setMunicipality(event.target.value);
              }}
              minLength={2}
              maxLength={80}
              placeholder="例：長崎県長崎市"
              className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 font-normal"
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 text-sm underline underline-offset-2"
          onClick={() => {
            const version = ++savedVersion.current;
            if (!navigator.geolocation) {
              setMessage("この端末では位置情報を利用できません。");
              return;
            }
            navigator.geolocation.getCurrentPosition(
              (position) => {
                void locate(position.coords.latitude, position.coords.longitude)
                  .then((name) => {
                    if (version !== savedVersion.current) return;
                    setConsent(false);
                    setMunicipality(name);
                  })
                  .catch(() => setMessage("市区町村を取得できませんでした。"));
              },
              () => setMessage("位置情報を取得できませんでした。"),
            );
          }}
        >
          現在地から市区町村を入力（位置情報の許可が必要）
        </button>
        {useAgent && question.trim() && (
          <p className="mt-3 text-xs text-slate-600">
            {profilePreview
              ? `この質問と一緒に送るプロフィール：${[
                  profilePreview.birthDate
                    ? `生年月日 ${profilePreview.birthDate}`
                    : "",
                  profilePreview.residence
                    ? `市区町村 ${profilePreview.residence}`
                    : "",
                ]
                  .filter(Boolean)
                  .join("、")}`
              : "この質問ではプロフィールを送信しません。"}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        {agentEnabled && (
          <label className="text-sm">
            <input
              type="checkbox"
              checked={calculationOnly}
              disabled={running}
              onChange={(event) => setCalculationOnly(event.target.checked)}
            />{" "}
            AIを使わず計算のみ
          </label>
        )}
        <AgentBirthYear key={privacyRevision} />
      </div>

      {voiceEnabled && useAgent && (
        <GrokVoice
          key={`voice-${privacyRevision}`}
          disabled={running}
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

      {useAgent ? (
        <div className="flex h-[72dvh] min-h-96 flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white/45 shadow-sm sm:h-[min(76dvh,46rem)] sm:min-h-[32rem]">
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
              <div className="mx-auto max-w-xl py-8 text-center">
                <p className="font-serif text-xl font-semibold">
                  方位や引越しについて相談できます
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  プロフィールを先に入れておくと、会話の途中で何度も聞き返されません。
                </p>
              </div>
            )}
            {messages.map((item) => (
              <ConversationMessage key={item.id} message={item} />
            ))}
            {voiceMessages.map((item, index) => (
              <article
                key={`${item.role}-${index}`}
                className="rounded-2xl border bg-white p-4 text-sm whitespace-pre-wrap"
              >
                <strong>{item.role === "user" ? "あなた" : "音声AI"}：</strong>
                {item.text}
              </article>
            ))}
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
            <div ref={threadEndRef} />
          </div>

          <form
            onSubmit={submitAgent}
            className="sticky bottom-0 z-10 shrink-0 rounded-b-3xl border-t border-stone-200 bg-[#faf7f5]/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:p-4"
          >
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
                rows={2}
                placeholder="続けて質問できます"
                className="max-h-40 min-h-14 flex-1 resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base leading-relaxed outline-none focus:border-slate-500 disabled:opacity-60"
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
      ) : (
        <form
          onSubmit={submitCalculation}
          className="rounded-2xl border border-slate-200 bg-white/80 p-4 sm:p-5"
        >
          <label className="mb-4 block text-sm">
            自由文から入力
            <input
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
              placeholder="1990年5月5日生まれ、名古屋市中区"
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
                max="2100-12-01"
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

      <p role="status" aria-live="polite" className="text-sm leading-relaxed">
        {message}
      </p>

      {!useAgent && <AnswerBlocks blocks={calculationBlocks} />}
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

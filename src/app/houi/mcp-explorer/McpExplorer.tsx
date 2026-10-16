"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { AgentBirthYear } from "@/components/home/AgentBirthYear";
import {
  readSettingsSync,
  settingString,
  settingNumber,
} from "@/lib/userSettings";
import { extractAgentInput, withSavedAgentInput } from "@/lib/agentInput";
import type { AgentEvent } from "@/lib/mcpAgent";
import type { ChainEvent } from "@/lib/mcpChain";

const GrokVoice = dynamic(() => import("@/components/home/GrokVoice"), {
  ssr: false,
});

type CallEvent = Extract<ChainEvent, { type: "call" }>;
const examples = [
  "1990年5月5日生まれ、深谷市在住。2026年11月に引越すならどの方位とどの日がよい？",
  "長崎市から東にある街を調べて、その街からさらに東の街を教えて。",
  "2026年11月1日の干支と九星気学での日取りの見方を教えて。",
];
export function McpExplorer({
  agentEnabled = false,
  voiceEnabled = false,
  mock = false,
  initialQuestion = "",
}: {
  agentEnabled?: boolean;
  voiceEnabled?: boolean;
  mock?: boolean;
  initialQuestion?: string;
}) {
  const [voiceMessages, setVoiceMessages] = useState<
    { role: string; text: string }[]
  >([]);
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [agentCalls, setAgentCalls] = useState<
    (Extract<AgentEvent, { type: "tool-call" }> & {
      result?: Extract<AgentEvent, { type: "tool-result" }>;
    })[]
  >([]);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const [calculationOnly, setCalculationOnly] = useState(false);
  const useAgent = agentEnabled && !calculationOnly;
  const [consent, setConsent] = useState(false);
  const [birthDate, setBirthDate] = useState(
    () => extractAgentInput(initialQuestion).birthDate,
  );
  const [municipality, setMunicipality] = useState(
    () => extractAgentInput(initialQuestion).municipality,
  );
  const listId = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const savedVersion = useRef(0);
  const [privacyRevision, setPrivacyRevision] = useState(0);
  const [remaining, setRemaining] = useState<string>();
  const remainingRevision = useRef(0);
  useEffect(() => {
    if (!agentEnabled) return;
    const revision = remainingRevision.current;
    const controller = new AbortController();
    void fetch("/api/mcp-chain/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.remaining && revision === remainingRevision.current)
          setRemaining(String(data.remaining.requests));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [agentEnabled]);
  const [year, setYear] = useState(
    () => extractAgentInput(initialQuestion).year,
  );
  const [savedBirth, setSavedBirth] = useState("");
  const [savedOrigin, setSavedOrigin] = useState("");
  const enriched = withSavedAgentInput(
    question,
    savedBirth,
    savedOrigin,
    consent,
  );
  useEffect(() => {
    const clear = () => {
      savedVersion.current++;
      setPrivacyRevision((n) => n + 1);
      abortRef.current?.abort();
      setConsent(false);
      setBirthDate("");
      setMunicipality("");
      setSavedBirth("");
      setSavedOrigin("");
      setYear("");
      setQuestion("");
      setAnswer("");
      setVoiceMessages([]);
      setSubmitted("");
      setCalls([]);
      setAgentCalls([]);
    };
    window.addEventListener("metaphysical-config-updated", clear);
    window.addEventListener("storage", clear);
    window.addEventListener("account-data-cleared", clear);
    return () => {
      window.removeEventListener("metaphysical-config-updated", clear);
      window.removeEventListener("storage", clear);
      window.removeEventListener("account-data-cleared", clear);
    };
  }, []);
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
        .then((r) => r.json())
        .then((data) => setSuggestions(data.names ?? []))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [municipality]);
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
      setSavedBirth("");
      setSavedOrigin("");
      return;
    }
    const settings = readSettingsSync();
    const birth = settingString(settings, "birth_date")?.slice(0, 10) ?? "";
    setBirthDate(birth);
    setSavedBirth(birth);
    let origin = extractAgentInput(
      settingString(settings, "base_label") ?? "",
    ).municipality;
    const lat = settingNumber(settings, "base_lat");
    const lon = settingNumber(settings, "base_lon");
    if (!origin && lat !== undefined && lon !== undefined)
      origin = await locate(lat, lon);
    if (version === savedVersion.current) {
      setMunicipality(origin);
      setSavedOrigin(origin);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (useAgent && enriched.length > 500) {
      setMessage("保存値を含めて500文字以内にしてください。");
      return;
    }
    remainingRevision.current++;
    const form = new FormData(event.currentTarget);
    const abort = new AbortController();
    abortRef.current = abort;
    setCalls([]);
    setAgentCalls([]);
    setAnswer("");
    setSubmitted(useAgent ? enriched : "");
    setMessage("計算しています…");
    setRunning(true);
    try {
      const response = await fetch("/api/mcp-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify(
          useAgent
            ? { mode: "llm", question: enriched }
            : {
                birthDate: form.get("birthDate"),
                municipality: form.get("municipality"),
                date: form.get("date") || undefined,
                depth: Number(form.get("depth")),
              },
        ),
      });
      const left = response.headers.get("X-Agent-Remaining-Requests");
      if (left !== null && useAgent) setRemaining(left);
      if (!response.ok) {
        const data = await response.json();
        if (data.remaining && useAgent)
          setRemaining(String(data.remaining.requests));
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
          for (const line of lines) {
            if (!line.trim()) continue;
            const item = JSON.parse(line) as ChainEvent | AgentEvent;
            if (item.type === "call") setCalls((prev) => [...prev, item]);
            else if (item.type === "text-delta")
              setAnswer((prev) => prev + item.text);
            else if (item.type === "tool-call")
              setAgentCalls((prev) => [...prev, item]);
            else if (item.type === "tool-result")
              setAgentCalls((prev) =>
                prev.map((c) =>
                  c.id === item.id ? { ...c, result: item } : c,
                ),
              );
            else {
              completed = true;
              setMessage(
                `${item.calls}回の呼び出しが終了しました。${item.reasons.join(" ")}`,
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
          ? "実行を中止しました。"
          : error instanceof Error
            ? error.message
            : "実行に失敗しました。",
      );
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }
  const articleUrls = new Set<string>();
  for (const call of agentCalls) {
    if (call.tool !== "search_articles" && call.tool !== "get_article")
      continue;
    const serialized = JSON.stringify(call.result?.output ?? {});
    for (const match of serialized.matchAll(
      /https:\/\/cloud-palette\.com\/blog\/[a-z0-9-]+/g,
    ))
      articleUrls.add(match[0]);
  }
  function answerContent() {
    return answer
      .split(/(https:\/\/cloud-palette\.com\/blog\/[a-z0-9-]+)/g)
      .map((part, i) =>
        articleUrls.has(part) ? (
          <a key={i} href={part} className="underline">
            {part}
          </a>
        ) : (
          part
        ),
      );
  }
  function tree(parentId: number | null): React.ReactNode {
    return (
      <ul className="space-y-3 border-l border-slate-300 pl-3">
        {calls
          .filter((c) => c.parentId === parentId)
          .map((c) => (
            <li key={c.id}>
              <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                <h3 className="break-all font-semibold">
                  #{c.id} {c.tool}
                </h3>
                <p className="text-xs text-slate-600">
                  深さ{c.depth}・{c.durationMs}ms
                </p>
                <p
                  className={`mt-2 text-sm ${c.error ? "text-red-800" : "text-slate-800"}`}
                >
                  {c.summary}
                </p>
                <p className="mt-2 break-all text-xs text-slate-600">
                  入力：{JSON.stringify(c.input)}
                </p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer">
                    入出力のJSONを見る（出典を含む）
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(
                      { input: c.input, output: c.output },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
              {calls.some((child) => child.parentId === c.id) && (
                <div className="mt-3">{tree(c.id)}</div>
              )}
            </li>
          ))}
      </ul>
    );
  }
  return (
    <section className="mt-8 space-y-6">
      {!agentEnabled && (
        <p className="text-sm text-slate-600">
          AI回答は現在無効です。計算の連鎖だけを表示します。
        </p>
      )}
      {agentEnabled && (
        <p className="text-sm leading-relaxed text-slate-600">
          {mock
            ? "開発用モックです。質問にかかわらず、1990年5月5日生まれ・深谷市・2026年11月の固定例を計算します。外部AIには送信しません。"
            : "質問と道具の結果をGoogleの生成AIに送信します。このサイトには入力を保存しません。氏名・連絡先・詳しい住所などは入力しないでください。"}
        </p>
      )}
      <AgentBirthYear key={privacyRevision} />
      {voiceEnabled && (
        <GrokVoice
          key={`voice-${privacyRevision}`}
          disabled={running}
          onTranscript={(role, text) =>
            setVoiceMessages((prev) => [...prev, { role, text }])
          }
          onEvent={(event) => {
            if (event.type === "tool-call")
              setAgentCalls((prev) => [...prev, event]);
            if (event.type === "tool-result")
              setAgentCalls((prev) =>
                prev.map((c) =>
                  c.id === event.id ? { ...c, result: event } : c,
                ),
              );
          }}
        />
      )}
      {voiceMessages.map((item, i) => (
        <div
          key={i}
          className="rounded-2xl border bg-white p-4 text-sm whitespace-pre-wrap"
        >
          <strong>{item.role === "user" ? "あなた" : "Grok"}：</strong>
          {item.text}
        </div>
      ))}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-slate-200 bg-white/80 p-5"
      >
        <label className="mb-4 block text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => void applySaved(e.target.checked)}
          />{" "}
          保存済みの生年月日・出発地を使う
        </label>
        <p className="mb-3 text-xs text-slate-600">
          入力はこの画面だけで使い、保存しません。保存値は必要な質問のときだけ送信します。
        </p>
        {consent && useAgent && (
          <p className="mb-3 text-xs">
            今回送る保存値（Googleの生成AIにも送信）：
            {enriched.slice(question.length).trim() || "なし"}
          </p>
        )}
        {agentEnabled && (
          <label className="mb-4 block text-sm">
            <input
              type="checkbox"
              checked={calculationOnly}
              onChange={(e) => setCalculationOnly(e.target.checked)}
            />{" "}
            AIを使わず計算のみ
          </label>
        )}
        {!useAgent && (
          <label className="mb-4 block text-sm">
            自由文から入力
            <input
              aria-label="自由文から入力"
              value={question}
              maxLength={500}
              className="block w-full border p-2"
              onChange={(e) => {
                setQuestion(e.target.value);
                const value = extractAgentInput(e.target.value);
                setBirthDate(value.birthDate);
                setYear(value.year);
                setMunicipality(value.municipality);
              }}
              placeholder="1990年5月5日生まれ、名古屋市中区"
            />
          </label>
        )}
        {!useAgent && year && !birthDate && (
          <p className="mb-3 text-sm">
            この連鎖では日柱・空亡も使うため、月日を入力してください。本命星だけならAI回答で年から確認できます。
          </p>
        )}
        <button
          type="button"
          className="mb-4 text-sm underline"
          onClick={() => {
            const version = savedVersion.current;
            navigator.geolocation?.getCurrentPosition(
              (pos) => {
                void locate(pos.coords.latitude, pos.coords.longitude)
                  .then((name) => {
                    if (version !== savedVersion.current) return;
                    setMunicipality(name);
                    if (useAgent)
                      setQuestion((q) =>
                        (q + "\n出発地：" + name).slice(0, 500),
                      );
                  })
                  .catch(() => setMessage("市区町村を取得できませんでした。"));
              },
              () => setMessage("位置情報を取得できませんでした。"),
            );
          }}
        >
          現在地から市区町村を入力（位置情報の許可が必要）
        </button>
        {useAgent ? (
          <fieldset disabled={running} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuestion(example)}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left text-xs leading-relaxed hover:bg-stone-100"
                >
                  {example}
                </button>
              ))}
            </div>
            <label className="block text-sm font-semibold">
              質問
              <textarea
                name="question"
                required
                maxLength={500}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                placeholder="方位や日取り、街について聞いてください"
                className="mt-2 block w-full rounded-xl border border-stone-300 bg-white p-3 font-normal"
              />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {question.length}/500文字
              </span>
              <button
                type="submit"
                className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white"
              >
                AIに聞く
              </button>
            </div>
          </fieldset>
        ) : (
          <fieldset disabled={running} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              生年月日
              <input
                name="birthDate"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                type="date"
                required
                min="1900-01-01"
                max="2100-12-01"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
              />
            </label>
            <label className="text-sm">
              出発地の市区町村名
              <datalist id={listId}>
                {suggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <input
                list={listId}
                name="municipality"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                placeholder="例：長崎県長崎市"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
              />
            </label>
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
              className="rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              道具を順番に呼び出す
            </button>
          </fieldset>
        )}
        {running && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="mt-3 text-sm underline"
          >
            実行を中止する
          </button>
        )}
      </form>
      {remaining !== undefined && (
        <p className="text-xs text-slate-500">
          この接続の本日のAI無料枠：残り{remaining}回（概算・インスタンス内）
        </p>
      )}
      {submitted && (
        <div className="ml-auto max-w-2xl rounded-2xl bg-stone-200/70 p-4 text-sm whitespace-pre-wrap">
          {submitted}
        </div>
      )}
      {agentEnabled && (answer || running) && (
        <div className="rounded-2xl border border-stone-200 bg-white/90 p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            AIの回答
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-8">
            {answer ? answerContent() : "道具で確かめています…"}
          </p>
        </div>
      )}
      {agentCalls.length > 0 && (
        <details className="rounded-2xl border border-stone-200 bg-white/60 p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            道具呼び出しの経緯（{agentCalls.length}回）
          </summary>
          <ol className="mt-4 space-y-4">
            {agentCalls.map((c) => (
              <li key={c.id} className="rounded-xl bg-white p-4 text-sm">
                <h3 className="break-all font-semibold">{c.tool}</h3>
                <p className="mt-2 break-all text-xs">
                  入力：{JSON.stringify(c.input)}
                </p>
                <p className="mt-2 break-all">
                  {c.result?.summary || "呼び出しています…"}
                </p>
                {c.result && (
                  <>
                    <p className="mt-2 text-xs text-slate-500">
                      所要時間：{c.result.durationMs}ms
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer">生JSONを見る</summary>
                      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(
                          c.result.output ?? { error: c.result.summary },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
      <p role="status" className="text-sm leading-relaxed">
        {message}
      </p>
      {calls.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-serif font-bold">呼び出しの木</h2>
          {tree(null)}
        </div>
      )}
    </section>
  );
}

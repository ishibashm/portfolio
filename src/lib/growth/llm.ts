import type { GrowthConfig, GrowthProviderName } from "./types";

export interface LlmResult {
  text: string | null;
  note: string;
}

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

function providerEnv(config: GrowthConfig, name: GrowthProviderName): string {
  const envName = config.providers[name]?.apiKeyEnv;
  if (!envName) return "";
  return process.env[envName]?.trim() ?? "";
}

/**
 * 鍵は環境変数だけ。無ければ文章の補足を足さず、監査結果はそのまま使う。
 * 応答は下書きであり、findings を上書きしない。
 */
export async function draftNarrative(
  config: GrowthConfig,
  prompt: string,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<LlmResult> {
  if (config.provider === "heuristic") {
    return { text: null, note: "heuristic。外部の言語モデルは呼んでいない" };
  }
  const spec = config.providers[config.provider];
  const key = providerEnv(config, config.provider);
  if (!spec || !key) {
    return {
      text: null,
      note: `${config.provider} の鍵が環境変数に無い。heuristic の文章を使う`,
    };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const text = await callProvider(spec, key, prompt, fetchImpl);
    const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 600);
    if (!trimmed) return { text: null, note: "モデルが空を返した" };
    return { text: trimmed, note: `${config.provider} の下書きを添えた` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "呼び出しに失敗";
    return { text: null, note: `モデルは使わなかった（${message}）` };
  }
}

async function callProvider(
  spec: GrowthConfig["providers"][GrowthProviderName],
  key: string,
  prompt: string,
  fetchImpl: FetchLike,
): Promise<string> {
  if (spec.kind === "anthropic") {
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: spec.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = JSON.parse(await res.text()) as {
      content?: { text?: string }[];
    };
    return json.content?.map((part) => part.text ?? "").join("") ?? "";
  }
  if (spec.kind === "google") {
    const model = spec.model ?? "gemini-2.5-flash";
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );
    if (!res.ok) throw new Error(`google ${res.status}`);
    const json = JSON.parse(await res.text()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return (
      json.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? ""
    );
  }
  if (spec.kind === "openai-compatible") {
    const base = (spec.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: spec.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      }),
    });
    if (!res.ok) throw new Error(`openai-compatible ${res.status}`);
    const json = JSON.parse(await res.text()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? "";
  }
  return "";
}

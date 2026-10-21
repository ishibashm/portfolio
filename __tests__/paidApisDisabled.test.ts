// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  PAID_APIS_DISABLED_REASON,
  PAID_APIS_PAUSED_TEXT,
  paidApisDisabled,
} from "@/lib/paidApis";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { voiceState } from "@/lib/mcpVoiceConfig";
import { remindersConfig } from "@/lib/reminders";
import { createAgentModel } from "@/lib/mcpAgent";
import { GET as publicGET } from "@/app/api/mcp-chain/status/route";

const {
  createGoogleGenerativeAI,
  createXai,
  generateObject,
  embed,
  TwitterApi,
} = vi.hoisted(() => ({
  createGoogleGenerativeAI: vi.fn(() => {
    throw new Error("Google client must not be created");
  }),
  createXai: vi.fn(() => {
    throw new Error("xAI client must not be created");
  }),
  generateObject: vi.fn(),
  embed: vi.fn(),
  TwitterApi: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI,
  google: Object.assign((model: string) => model, {
    textEmbeddingModel: (model: string) => model,
  }),
}));
vi.mock("@ai-sdk/xai", () => ({ createXai }));
vi.mock("ai", () => ({ generateObject, embed }));
vi.mock("twitter-api-v2", () => ({ TwitterApi }));
vi.mock("@/lib/prisma", () => ({
  default: {
    rental_properties: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  }),
}));
vi.mock("@/lib/agentSession", () => ({
  agentSessionUser: async () => ({ signedIn: false }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("未設定と true は停止、false だけ再開する", () => {
  expect(paidApisDisabled({ PAID_APIS_DISABLED: undefined })).toBe(true);
  expect(paidApisDisabled({ PAID_APIS_DISABLED: "" })).toBe(true);
  expect(paidApisDisabled({ PAID_APIS_DISABLED: "true" })).toBe(true);
  expect(paidApisDisabled({ PAID_APIS_DISABLED: "1" })).toBe(true);
  expect(paidApisDisabled({ PAID_APIS_DISABLED: "false" })).toBe(false);
});

it("鍵が揃っていても LLM・音声・メール送信を有効にしない", () => {
  const env = {
    PAID_APIS_DISABLED: "true",
    MCP_AGENT_ENABLED: "true",
    GEMINI_API_KEY: "test",
    MCP_VOICE_ENABLED: "true",
    XAI_API_KEY: "test",
    RESEND_API_KEY: "re_x",
    REMINDER_FROM_EMAIL: "a@b.c",
    REMINDER_SECRET: "s".repeat(40),
  };
  expect(chainLlmState(env).enabled).toBe(false);
  expect(voiceState(env).enabled).toBe(false);
  expect(remindersConfig(env).enabled).toBe(false);
});

it("スイッチオンでは有料APIのクライアントを作らない", async () => {
  vi.stubEnv("PAID_APIS_DISABLED", "true");
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
  vi.stubEnv("XAI_API_KEY", "test");
  vi.stubEnv("XAI_AGENT_MODEL", "chosen-model");
  await expect(createAgentModel()).rejects.toThrow("AI回答は無効です。");
  expect(createGoogleGenerativeAI).not.toHaveBeenCalled();
  expect(createXai).not.toHaveBeenCalled();
});

it("status は paused=true と paidApisDisabled を返す", async () => {
  vi.stubEnv("PAID_APIS_DISABLED", "true");
  vi.stubEnv("MCP_AGENT_ENABLED", "true");
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubEnv("MCP_VOICE_ENABLED", "true");
  vi.stubEnv("XAI_API_KEY", "test");
  const response = await publicGET(
    new Request("https://cloud-palette.com/api/mcp-chain/status"),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.paused).toBe(true);
  expect(body.reason).toBe(PAID_APIS_DISABLED_REASON);
  expect(body.enabled).toBe(false);
  expect(body.voiceEnabled).toBe(false);
  expect(JSON.stringify(body)).not.toMatch(/API_KEY|Buy credits|aistudio/);
});

it("webhook は Gemini を呼ばない", async () => {
  vi.stubEnv("PAID_APIS_DISABLED", "true");
  vi.stubEnv("API_SECRET_KEY", "webhook-secret");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  const { POST } = await import("@/app/api/rentals/webhook/route");
  const response = await POST(
    new Request("https://cloud-palette.com/api/rentals/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer webhook-secret",
      },
      body: JSON.stringify({ body: "物件情報" }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: PAID_APIS_PAUSED_TEXT,
    reason: PAID_APIS_DISABLED_REASON,
  });
  expect(generateObject).not.toHaveBeenCalled();
});

it("埋め込み検索は Gemini を呼ばない", async () => {
  vi.stubEnv("PAID_APIS_DISABLED", "true");
  const { POST } = await import("@/app/api/ai/search-chunks/route");
  const response = await POST(
    new Request("https://cloud-palette.com/api/ai/search-chunks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "1990-04-15 の本命星" }),
    }),
  );
  expect(response.status).toBe(403);
  expect(embed).not.toHaveBeenCalled();
});

it("Twitter API クライアントを作らない", async () => {
  vi.stubEnv("PAID_APIS_DISABLED", "true");
  vi.stubEnv("TWITTER_BEARER_TOKEN", "bearer");
  const { GET } = await import("@/app/api/twitter/route");
  const response = await GET(
    new Request("https://cloud-palette.com/api/twitter?q=cloud-palette"),
  );
  expect(response.status).toBe(403);
  expect(TwitterApi).not.toHaveBeenCalled();
});

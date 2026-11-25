import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUIDE_AI_DISABLED_TEXT,
  GUIDE_AI_FAILED_TEXT,
  GUIDE_AI_OK_TEXT,
  GUIDE_AI_PAUSED_TEXT,
  buildGuidePrompt,
  summarizeWithGuideAi,
} from "@/lib/guide/guideAi";
import { resetGuideBudgetMemory } from "@/lib/guide/guideBudget";
import {
  GLM_MODEL,
  WORKERS_AI_FALLBACK_MODEL,
  WORKERS_AI_PRIMARY_MODEL,
  callWorkersAiChatMessages,
  redactBirthData,
  reserveWorkersAiCall,
  resetWorkersAiGuideMemory,
  workersAiDailyCap,
  workersAiNeurons,
  type GuideUsageDb,
} from "@/lib/guide/workersAi";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "test-token-should-never-be-logged-xyz";
const BIRTH = "1990-05-15";

const baseEnv = {
  GUIDE_AI_ENABLED: "true",
  GUIDE_AI_PROVIDER: "workers-ai",
  CLOUDFLARE_WORKERS_AI_ACCOUNT_ID: ACCOUNT_ID,
  CLOUDFLARE_WORKERS_AI_TOKEN: TOKEN,
  // PAID_APIS_DISABLED は未設定（＝停止）のまま
};

const outputs = [
  { birthDate: BIRTH, honmeiStar: 1, note: BIRTH },
  { directions: [{ name: "北東", status: "◎" }], date: "2026-12-01" },
];
const evidence = new Set(["1", "北東", "◎", "2026-12-01", "12月1日"]);
const GOOD_TEXT =
  "本命星は1です。12月1日は北東が◎です。吉凶は九星気学の考え方による参考情報です。";

function okResponse(text: string, viaChoices = true): Response {
  const result = viaChoices
    ? {
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: 100, completion_tokens: 30 },
      }
    : { response: text };
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number): Response {
  return new Response(
    JSON.stringify({ success: false, errors: [{ code: 3036, message: "x" }] }),
    { status },
  );
}

/** RETURNING requests が 1,2,3… と増える DB モック */
function counterDb(): GuideUsageDb & { calls: number } {
  const db = {
    calls: 0,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("RETURNING requests")) {
        db.calls++;
        return [{ requests: db.calls }];
      }
      return [{ tokens: 60_000 }];
    }),
  };
  return db as unknown as GuideUsageDb & { calls: number };
}

function headers(ip = "203.0.113.5"): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

let ipSeq = 0;
function freshHeaders(): Headers {
  ipSeq++;
  return headers(`198.51.100.${ipSeq % 250}`);
}

beforeEach(() => {
  resetWorkersAiGuideMemory();
  resetGuideBudgetMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Workers AI 案内役経路", () => {
  it("PAID_APIS_DISABLED 未設定でも条件がそろえば fetch し、照合済みの文だけで ok", async () => {
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT));
    const createModel = vi.fn();
    const generateTextFn = vi.fn();
    const canUseAgentFn = vi.fn();

    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
        createModel,
        generateTextFn:
          generateTextFn as unknown as typeof import("ai").generateText,
        canUseAgentFn:
          canUseAgentFn as unknown as typeof import("@/lib/agentEntitlement").canUseAgent,
      },
    );

    expect(r.status).toBe("ok");
    expect(r.note).toBe(GUIDE_AI_OK_TEXT);
    expect(r.sentences.length).toBeGreaterThan(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(createModel).not.toHaveBeenCalled();
    expect(generateTextFn).not.toHaveBeenCalled();
    expect(canUseAgentFn).not.toHaveBeenCalled();
  });

  it("result.response 形式の応答でも読める", async () => {
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT, false));
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    expect(r.status).toBe("ok");
  });

  it.each([
    ["GUIDE_AI_ENABLED が true でない", { GUIDE_AI_ENABLED: "false" }],
    ["GUIDE_AI_ENABLED 未設定", { GUIDE_AI_ENABLED: undefined }],
    ["トークン無し", { CLOUDFLARE_WORKERS_AI_TOKEN: "  " }],
    ["アカウントID不正", { CLOUDFLARE_WORKERS_AI_ACCOUNT_ID: "abc" }],
  ])("%s → disabled、fetch しない", async (_label, patch) => {
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT));
    const db = counterDb();
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv, ...patch },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: db,
      },
    );
    expect(r.status).toBe("disabled");
    expect(r.note).toBe(GUIDE_AI_DISABLED_TEXT);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(db.calls).toBe(0);
  });

  it("主モデルが 500 なら予備モデルを1回呼んで ok", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse(GOOD_TEXT));
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    expect(r.status).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0][0])).toContain(
      WORKERS_AI_PRIMARY_MODEL,
    );
    expect(String(fetchFn.mock.calls[1][0])).toContain(
      WORKERS_AI_FALLBACK_MODEL,
    );
  });

  it("両方失敗なら failed（3回目は呼ばない）", async () => {
    const fetchFn = vi.fn(async () => errorResponse(429));
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    expect(r.status).toBe("failed");
    expect(r.note).toBe(GUIDE_AI_FAILED_TEXT);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("success:false・空本文・JSON 不正も失敗として予備へ回る", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, result: { response: "" } }),
        ),
      )
      .mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    expect(r.status).toBe("failed");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("時間切れ（fetch が abort まで解決しない）→ failed", async () => {
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
        timeoutMs: 30,
      },
    );
    expect(r.status).toBe("failed");
    // 時間切れ後に予備は呼ばない
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("送る body: URL・max_completion_tokens 256・messages・区切りあり・生年月日なし・Authorization あり", async () => {
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT));
    await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${WORKERS_AI_PRIMARY_MODEL}`,
    );
    expect(init.method).toBe("POST");
    const h = new Headers(init.headers);
    expect(h.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(h.get("Content-Type")).toBe("application/json");
    const body = JSON.parse(String(init.body));
    expect(body.max_completion_tokens).toBe(256);
    expect(body.chat_template_kwargs).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("案内役");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("BEGIN_UNTRUSTED_TOOL_DATA_");
    expect(body.messages[1].content).not.toContain(BIRTH);
    expect(body.messages[1].content).not.toContain("birthDate");
  });

  it("予備モデル（GLM）には chat_template_kwargs を付ける", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse(GOOD_TEXT));
    await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    const body = JSON.parse(String(fetchFn.mock.calls[1][1].body));
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.max_completion_tokens).toBe(256);
  });

  it("照合で全部落ちる → failed、dropped を返す", async () => {
    const fetchFn = vi.fn(async () =>
      okResponse("運気は77点で、9月9日が最高です。"),
    );
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    expect(r.status).toBe("failed");
    expect(r.sentences).toEqual([]);
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it("1日の上限: cap=2 なら3回目は fetch しない", async () => {
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT));
    const db = counterDb();
    const run = () =>
      summarizeWithGuideAi(
        { outputs, evidence, headers: freshHeaders() },
        {
          env: { ...baseEnv, GUIDE_AI_DAILY_MAX_CALLS: "2" },
          fetchFn: fetchFn as unknown as typeof fetch,
          usageDb: db,
        },
      );
    expect((await run()).status).toBe("ok");
    expect((await run()).status).toBe("ok");
    expect((await run()).status).toBe("failed");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(db.calls).toBe(3);
  });

  it("GUIDE_AI_DAILY_MAX_CALLS が不正なら呼ばない", async () => {
    expect(workersAiDailyCap({})).toBe(50);
    expect(workersAiDailyCap({ GUIDE_AI_DAILY_MAX_CALLS: "abc" })).toBe(0);
    expect(workersAiDailyCap({ GUIDE_AI_DAILY_MAX_CALLS: "-1" })).toBe(0);
    expect(workersAiDailyCap({ GUIDE_AI_DAILY_MAX_CALLS: "50" })).toBe(50);
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT));
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv, GUIDE_AI_DAILY_MAX_CALLS: "abc" },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: counterDb(),
      },
    );
    expect(r.status).toBe("failed");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("IP ごとの上限: 同じ IP から連続4回目は fetch しない", async () => {
    const fetchFn = vi.fn(async () => okResponse(GOOD_TEXT));
    const db = counterDb();
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(
        await summarizeWithGuideAi(
          { outputs, evidence, headers: headers("192.0.2.77") },
          {
            env: { ...baseEnv },
            fetchFn: fetchFn as unknown as typeof fetch,
            usageDb: db,
            now: () => 1_800_000_000_000,
          },
        ),
      );
    }
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok", "failed"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("console に プロンプト・応答本文・トークン・アカウントIDを渡さない", async () => {
    const spies = (["info", "warn", "error", "log", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse(GOOD_TEXT));
    await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: { ...baseEnv },
        fetchFn: fetchFn as unknown as typeof fetch,
        usageDb: {
          $queryRaw: vi.fn(async () => {
            throw new Error("db down");
          }),
        } as unknown as GuideUsageDb,
      },
    );
    const logged = spies
      .flatMap((s) => s.mock.calls)
      .map((args) => args.map((a) => String(a)).join(" "))
      .join("\n");
    for (const needle of [
      TOKEN,
      ACCOUNT_ID,
      BIRTH,
      "本命星は1です",
      "道具結果1",
      "案内役",
    ]) {
      expect(logged).not.toContain(needle);
    }
  });

  it("GUIDE_AI_PROVIDER 未設定なら従来経路（PAID_APIS_DISABLED=true で paused）", async () => {
    const fetchFn = vi.fn();
    const r = await summarizeWithGuideAi(
      { outputs, evidence, headers: freshHeaders() },
      {
        env: {
          ...baseEnv,
          GUIDE_AI_PROVIDER: undefined,
          PAID_APIS_DISABLED: "true",
        },
        fetchFn: fetchFn as unknown as typeof fetch,
      },
    );
    expect(r.status).toBe("paused");
    expect(r.note).toBe(GUIDE_AI_PAUSED_TEXT);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("reserveWorkersAiCall", () => {
  it("DB が投げると floor(cap/2) までメモリで許す", async () => {
    const db = {
      $queryRaw: vi.fn(async () => {
        throw new Error("db down");
      }),
    } as unknown as GuideUsageDb;
    const at = 1_800_000_000_000;
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await reserveWorkersAiCall({ at, cap: 5, db, env: {} }));
    }
    expect(results).toEqual([true, true, false, false]);
  });

  it("cap 0 なら常に false、DB も触らない", async () => {
    const db = counterDb();
    expect(
      await reserveWorkersAiCall({ at: Date.now(), cap: 0, db, env: {} }),
    ).toBe(false);
    expect(db.calls).toBe(0);
  });

  it("DB が 1.5 秒で返らなければメモリへ切り替える", async () => {
    vi.useFakeTimers();
    try {
      const db = {
        $queryRaw: vi.fn(() => new Promise(() => {})),
      } as unknown as GuideUsageDb;
      const p = reserveWorkersAiCall({ at: Date.now(), cap: 4, db, env: {} });
      await vi.advanceTimersByTimeAsync(1_600);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("redactBirthData", () => {
  it("生年月日のキーを消し、同じ値の文字列を [省略] にし、元を変えない", () => {
    const input = [
      {
        profile: {
          birthDate: BIRTH,
          birthYear: 1990,
          生年月日: "1990年5月15日",
        },
        list: [{ dob: "05/15" }, { text: BIRTH }, { text: "1990年5月15日" }],
        honmeiStar: 1,
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = redactBirthData(input);
    expect(input).toEqual(snapshot);
    const s = JSON.stringify(out);
    expect(s).not.toContain(BIRTH);
    expect(s).not.toContain("1990");
    expect(s).not.toContain("birth");
    expect(s).not.toContain("dob");
    expect(s).toContain("[省略]");
    expect(s).toContain('"honmeiStar":1');
  });
});

describe("buildGuidePrompt", () => {
  it("12000 文字を超えるときは各ブロックを縮め、区切りを壊さない", () => {
    const big = Array.from({ length: 5 }, () => ({ text: "あ".repeat(6000) }));
    const prompt = buildGuidePrompt(big);
    expect(prompt.length).toBeLessThanOrEqual(12_000);
    const begins = prompt.match(/BEGIN_UNTRUSTED_TOOL_DATA_[0-9a-f]+/g) ?? [];
    const ends = prompt.match(/END_UNTRUSTED_TOOL_DATA_[0-9a-f]+/g) ?? [];
    expect(begins).toHaveLength(5);
    expect(ends).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(begins[i].replace("BEGIN_", "")).toBe(ends[i].replace("END_", ""));
    }
  });
});

describe("workersAiNeurons と callWorkersAiChatMessages", () => {
  it("モデルごとの100万トークン単価でニューロンを計算する", () => {
    expect(WORKERS_AI_PRIMARY_MODEL).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(WORKERS_AI_FALLBACK_MODEL).toBe(GLM_MODEL);
    expect(
      workersAiNeurons(WORKERS_AI_PRIMARY_MODEL, 1_000_000, 1_000_000),
    ).toBeCloseTo(9091 + 27273, 5);
    expect(
      workersAiNeurons(WORKERS_AI_FALLBACK_MODEL, 1_000_000, 1_000_000),
    ).toBeCloseTo(5500 + 36400, 5);
  });

  it("OpenAI形式と旧形式の両方の tool_calls を読み取り、壊れた JSON 引数は null にする", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              choices: [
                {
                  message: {
                    content: "",
                    tool_calls: [
                      {
                        id: "tc_1",
                        function: {
                          name: "search_articles",
                          arguments: '{"query":"五黄殺","limit":3}',
                        },
                      },
                      {
                        function: {
                          name: "get_article",
                          arguments: "{broken-json",
                        },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 200, completion_tokens: 40 },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              tool_calls: [
                {
                  name: "search_articles",
                  arguments: { query: "立春", limit: 2 },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const r1 = await callWorkersAiChatMessages({
      accountId: ACCOUNT_ID,
      token: TOKEN,
      model: WORKERS_AI_PRIMARY_MODEL,
      messages: [{ role: "user", content: "五黄殺とは" }],
      tools: [
        {
          type: "function",
          function: {
            name: "search_articles",
            description: "検索",
            parameters: { type: "object" },
          },
        },
      ],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r1.toolCalls).toEqual([
      {
        id: "tc_1",
        name: "search_articles",
        arguments: { query: "五黄殺", limit: 3 },
      },
      {
        id: "call_2",
        name: "get_article",
        arguments: null,
      },
    ]);
    const sentBody1 = JSON.parse(String(fetchFn.mock.calls[0][1].body));
    expect(sentBody1.tool_choice).toBe("auto");
    expect(sentBody1.max_completion_tokens).toBe(512);
    expect(sentBody1.chat_template_kwargs).toBeUndefined();

    const r2 = await callWorkersAiChatMessages({
      accountId: ACCOUNT_ID,
      token: TOKEN,
      model: WORKERS_AI_FALLBACK_MODEL,
      messages: [{ role: "user", content: "立春とは" }],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r2.toolCalls).toEqual([
      {
        id: "call_1",
        name: "search_articles",
        arguments: { query: "立春", limit: 2 },
      },
    ]);
    const sentBody2 = JSON.parse(String(fetchFn.mock.calls[1][1].body));
    expect(sentBody2.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUIDE_AI_FAILED_TEXT,
  GUIDE_AI_OK_TEXT,
  summarizeWithGuideAi,
  type GuideAiResult,
} from "@/lib/guide/guideAi";
import {
  buildGuideUserRows,
  checkDirectionStatusPairs,
  checkGuideAiSentences,
  narrowGuideOutputs,
} from "@/lib/guide/guideAiCheck";
import type { GuideQueryStep3 } from "@/lib/guide/guideForm";
import { loadGuideAnswer } from "@/lib/guide/guidePage";
import {
  emptyGuideFacts,
  runGuide,
  type GuideFacts,
} from "@/lib/guide/guideRun";
import type { GuideCaller } from "@/lib/guide/guideTools";
import { collectEvidence, verifySentences } from "@/lib/guide/guideVerify";
import {
  resetWorkersAiGuideMemory,
  type GuideUsageDb,
} from "@/lib/guide/workersAi";
import { buildTodayDirections } from "@/lib/todayDirections";

// 2026-11-19 の日盤（東京基準）。
// 一白水星: 吉 北東・南西
// 六白金星: 吉 南東・西・北西 / 北東（本命的殺）・南西（本命殺）・南（暗剣殺）
const NOW = new Date("2026-11-19T12:00:00+09:00");
const QUERY: GuideQueryStep3 = { step: 3, kind: "today", y: 1985, s: "after" };

const env = {
  GUIDE_AI_ENABLED: "true",
  GUIDE_AI_PROVIDER: "workers-ai",
  CLOUDFLARE_WORKERS_AI_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_WORKERS_AI_TOKEN: "test-token-not-real",
};

const caller: GuideCaller = async (tool) => {
  if (tool === "get_honmei_star") return { birthYear: 1985, honmeiStar: 6 };
  if (tool === "get_today_directions") return buildTodayDirections(NOW);
  throw new Error(`unexpected tool ${tool}`);
};

async function runRokuhaku() {
  return runGuide(QUERY, caller, { now: NOW });
}

function aiResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      success: true,
      result: { choices: [{ message: { content: text } }] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let ipSeq = 0;
function freshHeaders(): Headers {
  ipSeq++;
  return new Headers({ "x-forwarded-for": `192.0.2.${ipSeq % 250}` });
}

const usageDb = {
  $queryRaw: vi.fn(async () => [{ requests: 1 }]),
} as unknown as GuideUsageDb;

async function summarize(
  text: string,
  run: Awaited<ReturnType<typeof runRokuhaku>>,
  fetchFn = vi.fn(async () => aiResponse(text)),
) {
  const result = await summarizeWithGuideAi(
    {
      outputs: run.outputs,
      evidence: collectEvidence(run.outputs, QUERY),
      headers: freshHeaders(),
      facts: run.facts,
      query: QUERY,
    },
    { env, fetchFn: fetchFn as unknown as typeof fetch, usageDb },
  );
  return { result, fetchFn };
}

const ICHIHAKU_ANSWER =
  "2026-11-19の吉方位は北東・南西です。吉凶は九星気学の考え方による参考情報です。";
const ROKUHAKU_ANSWER =
  "2026-11-19の「六白金星」の吉方位は南東・西・北西です。南西は本命殺、南は暗剣殺です。吉凶は九星気学の考え方による参考情報です。";

beforeEach(() => {
  resetWorkersAiGuideMemory();
});

describe("案内役 AI 要約: 本人の本命星の行だけで照合する", () => {
  it("再現: 9星分の表を根拠にすると、六白の利用者への一白の吉方位が従来の照合を通ってしまう", async () => {
    const run = await runRokuhaku();
    expect(run.facts.todayDirections?.star).toBe(6);
    const oldEvidence = collectEvidence(run.outputs, QUERY);
    const old = verifySentences(
      ["2026-11-19の吉方位は北東・南西です。"],
      oldEvidence,
    );
    // 従来は値がどこかにあれば通っていた
    expect(old.kept).toHaveLength(1);
  });

  it("六白の利用者に一白の吉方位（北東・南西）を答えたら失敗にして定型文へ戻す", async () => {
    const run = await runRokuhaku();
    const { result } = await summarize(ICHIHAKU_ANSWER, run);
    expect(result.status).toBe("failed");
    expect(result.note).toBe(GUIDE_AI_FAILED_TEXT);
    expect(result.sentences).toEqual([]);
  });

  it("loadGuideAnswer でも一白の答えは使わず、六白の定型文の要約を表示する", async () => {
    const fetchFn = vi.fn(async () => aiResponse(ICHIHAKU_ANSWER));
    const answer = await loadGuideAnswer({
      query: QUERY,
      headers: freshHeaders(),
      deps: {
        env: { ...env, MCP_PUBLIC_ENABLED: "true" },
        now: NOW,
        checkMcpPublicLimit: async () => ({
          denied: null,
          headers: new Headers(),
        }),
        connect: async () => ({ call: caller, close: async () => {} }),
        summarizeAi: (input, deps) =>
          summarizeWithGuideAi(input, {
            ...deps,
            fetchFn: fetchFn as unknown as typeof fetch,
            usageDb,
          }),
      },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(answer.aiStatus).toBe("failed");
    const joined = answer.sentences.join("");
    expect(joined).toContain("六白金星");
    expect(joined).toContain("南東・西・北西");
    expect(joined).not.toContain("吉方位は北東・南西");
  });

  it("loadGuideAnswer は facts と入力を AI 要約に渡す", async () => {
    const summarizeAi = vi.fn(
      async (): Promise<GuideAiResult> => ({
        status: "disabled",
        note: "",
        sentences: [],
        dropped: [],
        matchedValues: [],
      }),
    );
    await loadGuideAnswer({
      query: QUERY,
      headers: freshHeaders(),
      deps: {
        env: { MCP_PUBLIC_ENABLED: "true" },
        now: NOW,
        checkMcpPublicLimit: async () => ({
          denied: null,
          headers: new Headers(),
        }),
        connect: async () => ({ call: caller, close: async () => {} }),
        summarizeAi,
      },
    });
    const arg = (summarizeAi.mock.calls[0] as unknown[])[0] as {
      facts?: GuideFacts;
      query?: unknown;
    };
    expect(arg.facts?.todayDirections?.star).toBe(6);
    expect(arg.query).toEqual(QUERY);
  });

  it("AI に送る道具結果は本人（六白）の今日の行だけで、他の星・明日・時間帯を含まない", async () => {
    const run = await runRokuhaku();
    const { fetchFn } = await summarize(ROKUHAKU_ANSWER, run);
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      messages: { role: string; content: string }[];
    };
    const prompt = body.messages.find((m) => m.role === "user")!.content;
    expect(prompt).toContain("六白金星");
    for (const other of ["一白水星", "二黒土星", "七赤金星", "九紫火星"]) {
      expect(prompt).not.toContain(other);
    }
    expect(prompt).not.toContain("hours");
    expect(prompt).not.toContain("tomorrow");
  });

  it("六白の正しい吉方位と凶方位なら AI の要約を使う", async () => {
    const run = await runRokuhaku();
    const { result } = await summarize(ROKUHAKU_ANSWER, run);
    expect(result.status).toBe("ok");
    expect(result.note).toBe(GUIDE_AI_OK_TEXT);
    expect(result.sentences).toHaveLength(3);
  });

  it("本人以外の星の名前（一白水星）を書いたら失敗", async () => {
    const run = await runRokuhaku();
    const { result } = await summarize(
      "一白水星の吉方位は南東です。吉凶は九星気学の考え方による参考情報です。",
      run,
    );
    expect(result.status).toBe("failed");
  });

  it("本人の星が分からないときは9星分の表を AI に渡さない", () => {
    const outputs = [buildTodayDirections(NOW)];
    expect(narrowGuideOutputs(outputs, emptyGuideFacts())).toEqual([]);
    const narrowed = narrowGuideOutputs(outputs, {
      ...emptyGuideFacts(),
      honmeiStar: 6,
    }) as { stars: { star: number }[] }[];
    expect(narrowed[0].stars.map((s) => s.star)).toEqual([6]);
  });
});

describe("案内役 AI 要約: 方位と状態の組の照合", () => {
  async function rows() {
    return buildGuideUserRows((await runRokuhaku()).facts);
  }

  it("吉方位に本人の凶方位（北東＝本命的殺）を含めると不一致", async () => {
    const r = checkDirectionStatusPairs("吉方位は北東・西です。", await rows());
    expect(r.mismatches).toEqual(["北東:吉方位"]);
    expect(r.pairs).toEqual(["西:吉方位"]);
  });

  it("状態の取り違え（南西を暗剣殺）は不一致、正しい組（南西は本命殺）は一致", async () => {
    const r = await rows();
    expect(
      checkDirectionStatusPairs("南西は暗剣殺です。", r).mismatches,
    ).toEqual(["南西:暗剣殺"]);
    expect(checkDirectionStatusPairs("南西は本命殺です。", r).pairs).toEqual([
      "南西:本命殺",
    ]);
  });

  it("括弧書き: 南西（本命殺）は一致、南西（暗剣殺）は不一致", async () => {
    const r = await rows();
    expect(
      checkDirectionStatusPairs("凶方位は「南西（本命殺）」です。", r)
        .mismatches,
    ).toEqual([]);
    expect(
      checkDirectionStatusPairs("凶方位は「南西（暗剣殺）」です。", r)
        .mismatches,
    ).toEqual(["南西:暗剣殺"]);
  });

  it("読点で続く方位は直前の状態を引き継いで照合する（吉方位は南東、北東）", async () => {
    const r = checkDirectionStatusPairs(
      "吉方位は南東、北東です。",
      await rows(),
    );
    expect(r.mismatches).toEqual(["北東:吉方位"]);
  });

  it("「東京」などの語の字は方位として扱わない", async () => {
    const r = checkDirectionStatusPairs(
      "東京基準の吉方位は西です。",
      await rows(),
    );
    expect(r.mismatches).toEqual([]);
    expect(r.pairs).toEqual(["西:吉方位"]);
    expect(r.unpaired).toEqual([]);
  });

  it("状態と結べない方位の文は落とす", async () => {
    const run = await runRokuhaku();
    const checked = checkGuideAiSentences(
      ["北東へ出かけてみましょう。", "吉方位は西です。"],
      run.facts,
    );
    expect(checked.failure).toBeUndefined();
    expect(checked.kept).toEqual(["吉方位は西です。"]);
    expect(checked.dropped).toEqual(["北東へ出かけてみましょう。"]);
  });
});

describe("案内役 AI 要約: 定型文だけの出力は失敗", () => {
  it("再現: 定型の注意書きだけでも従来の照合は通っていた", () => {
    const old = verifySentences(
      ["吉凶は九星気学の考え方による参考情報です。"],
      new Set<string>(),
    );
    expect(old.kept).toHaveLength(1);
  });

  it("定型の注意書きだけの AI 出力は失敗にして定型文へ戻す", async () => {
    const run = await runRokuhaku();
    const { result } = await summarize(
      "吉凶は九星気学の考え方による参考情報です。",
      run,
    );
    expect(result.status).toBe("failed");
    expect(result.sentences).toEqual([]);
  });

  it("日付と一般論だけ（方位と状態の組が無い）も失敗", async () => {
    const run = await runRokuhaku();
    const { result } = await summarize(
      "11月19日の吉方位をお知らせします。吉凶は九星気学の考え方による参考情報です。",
      run,
    );
    expect(result.status).toBe("failed");
  });

  it("facts が無い呼び出しでも、定型文だけなら失敗", () => {
    const checked = checkGuideAiSentences(
      [
        "吉凶は九星気学の考え方による参考情報です。",
        "九星気学は参考情報です。",
      ],
      undefined,
    );
    expect(checked.failure).toBe("boilerplate_only");
  });
});

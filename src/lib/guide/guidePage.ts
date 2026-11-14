import {
  checkMcpPublicLimit,
  mcpPublicEnabled,
  type McpPublicGate,
} from "@/lib/mcpPublicLimit";
import {
  GUIDE_AI_PAUSED_TEXT,
  summarizeWithGuideAi,
  type GuideAiResult,
  type GuideAiStatus,
} from "./guideAi";
import {
  parseGuideQuery,
  type GuideQuery,
  type GuideQueryStep3,
  type RawSearchParams,
} from "./guideForm";
import {
  emptyGuideFacts,
  planGuide,
  planToJsonRpcBatch,
  runGuide,
  type GuideFacts,
  type GuidePlanStep,
  type GuideTraceEntry,
} from "./guideRun";
import { buildGuideSummary } from "./guideSummary";
import { connectGuideClient, type GuideClientConnection } from "./guideTools";
import { collectEvidence } from "./guideVerify";

export type GuideFollowUpLink =
  | {
      label: string;
      href: string;
    }
  | {
      label: string;
      post: Record<string, string>;
    };

export type GuideAnswerStatus =
  | "ok"
  | "candidates"
  | "stopped"
  | "rate_limited"
  | "failed";

export type GuideAnswerData = {
  status: GuideAnswerStatus;
  message?: string;
  retryAfterSeconds?: number;
  query: GuideQueryStep3;
  plan: GuidePlanStep[];
  parsedBody: {
    jsonrpc: "2.0";
    id: number;
    method: "tools/call";
    params: { name: string };
  }[];
  trace: GuideTraceEntry[];
  facts: GuideFacts;
  aiStatus: GuideAiStatus;
  aiNote: string;
  sentences: string[];
  droppedCount: number;
  droppedSentences: string[];
  matchedCount: number;
  matchedValues: string[];
  followUps: GuideFollowUpLink[];
};

export type LoadGuideAnswerDeps = {
  env?: Record<string, string | undefined>;
  now?: Date;
  mcpPublicEnabled?: (env?: Record<string, string | undefined>) => boolean;
  checkMcpPublicLimit?: (
    headers: Headers,
    now?: Date,
    parsedBody?: unknown,
  ) => Promise<McpPublicGate>;
  connect?: () => Promise<GuideClientConnection>;
  summarizeAi?: typeof summarizeWithGuideAi;
};

function isStep3Query(q: unknown): q is GuideQueryStep3 {
  return (
    typeof q === "object" &&
    q !== null &&
    "step" in q &&
    (q as { step?: unknown }).step === 3 &&
    "kind" in q
  );
}

/** 結果と現在のクエリから、続けて押すリンク（2〜4個）を作る。 */
export function buildGuideFollowUps(
  query: GuideQueryStep3,
  facts: GuideFacts,
): GuideFollowUpLink[] {
  const links: GuideFollowUpLink[] = [];

  if (query.kind === "honmei") {
    links.push({
      label: "この生まれ年で今日の吉方位を見る",
      href: `/annai?kind=today&y=${encodeURIComponent(String(query.y))}&s=${encodeURIComponent(query.s)}`,
    });
    links.push({
      label: "引越しの方位と日取りを調べる",
      href: "/annai?kind=move",
    });
    links.push({
      label: "吉方位の記事を読む",
      href: "/annai?kind=read&t=kippou",
    });
  } else if (query.kind === "today") {
    links.push({
      label: "本命星の記事を読む",
      href: "/annai?kind=read&t=honmei",
    });
    links.push({
      label: "引越しの方位と日取りを調べる",
      href: "/annai?kind=move",
    });
    if (query.s === "unknown") {
      links.push({
        label: "1月1日〜2月3日生まれで再確認する",
        href: `/annai?kind=today&y=${encodeURIComponent(String(query.y))}&s=before`,
      });
    }
  } else if (query.kind === "move") {
    const originCode = facts.origin?.code ?? query.c;
    if (query.p === 30) {
      const post: Record<string, string> = {
        m: query.m,
        p: "90",
      };
      if (originCode) post.c = originCode;
      links.push({
        label: "90日先まで日取りを見る",
        post,
      });
    } else {
      const post: Record<string, string> = {
        m: query.m,
        p: "30",
      };
      if (originCode) post.c = originCode;
      links.push({
        label: "30日間の日取りに戻す",
        post,
      });
    }
    const nearTown = facts.towns[0];
    if (nearTown) {
      links.push({
        label: `近くの街（${nearTown.name}）を出発地にして見る`,
        post: {
          m: nearTown.name,
          c: nearTown.code,
          p: String(query.p),
        },
      });
    }
    links.push({
      label: "引越しの日取りの記事を読む",
      href: "/annai?kind=read&t=hidori",
    });
  } else {
    // read
    links.push({
      label: "本命星を調べる",
      href: "/annai?kind=honmei",
    });
    links.push({
      label: "引越しの方位と日取りを調べる",
      href: "/annai?kind=move",
    });
    if (query.kind === "read" && query.t !== "toukei") {
      links.push({
        label: "統計的な裏づけの記事を読む",
        href: "/annai?kind=read&t=toukei",
      });
    } else {
      links.push({
        label: "吉方位の記事を読む",
        href: "/annai?kind=read&t=kippou",
      });
    }
  }

  links.push({
    label: "別の質問を選ぶ",
    href: "/annai",
  });

  return links.slice(0, 4);
}

/**
 * 3段目（答え）のサーバー側データ読み込み。
 * 停止スイッチ（mcpPublicEnabled）とレート上限（checkMcpPublicLimit）を先に検査し、
 * 停止中や上限超過のときは道具を一切呼ばない。
 */
export async function loadGuideAnswer(input: {
  query: GuideQueryStep3 | GuideQuery | RawSearchParams;
  headers: Headers;
  moveCookie?: unknown;
  deps?: LoadGuideAnswerDeps;
}): Promise<GuideAnswerData> {
  const deps = input.deps ?? {};
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();

  let step3Query: GuideQueryStep3;
  if (isStep3Query(input.query)) {
    step3Query = input.query;
  } else {
    const parsed = parseGuideQuery(
      input.query as RawSearchParams,
      now,
      input.moveCookie,
    );
    if (parsed.step !== 3) {
      throw new Error("3段目のクエリが揃っていません。");
    }
    step3Query = parsed;
  }

  const plan = planGuide(step3Query, now);
  const parsedBody = planToJsonRpcBatch(plan);
  const followUps = buildGuideFollowUps(step3Query, emptyGuideFacts());

  const isEnabled = (deps.mcpPublicEnabled ?? mcpPublicEnabled)(env);
  if (!isEnabled) {
    return {
      status: "stopped",
      message:
        "現在、案内役の計算道具は停止中です。しばらくしてからお試しください。",
      query: step3Query,
      plan,
      parsedBody,
      trace: [],
      facts: emptyGuideFacts(),
      aiStatus: "paused",
      aiNote: GUIDE_AI_PAUSED_TEXT,
      sentences: [],
      droppedCount: 0,
      droppedSentences: [],
      matchedCount: 0,
      matchedValues: [],
      followUps,
    };
  }

  const gate = await (deps.checkMcpPublicLimit ?? checkMcpPublicLimit)(
    input.headers,
    now,
    parsedBody,
  );
  if (gate.denied) {
    const rawRetry =
      gate.denied.headers.get("Retry-After") ??
      gate.headers.get("Retry-After") ??
      "60";
    const retrySec = Math.max(1, Number(rawRetry) || 60);
    return {
      status: "rate_limited",
      retryAfterSeconds: retrySec,
      message: `混み合っています（約${retrySec}秒後に再度お試しください）。`,
      query: step3Query,
      plan,
      parsedBody,
      trace: [],
      facts: emptyGuideFacts(),
      aiStatus: "paused",
      aiNote: GUIDE_AI_PAUSED_TEXT,
      sentences: [],
      droppedCount: 0,
      droppedSentences: [],
      matchedCount: 0,
      matchedValues: [],
      followUps,
    };
  }

  let connection: GuideClientConnection | undefined;
  try {
    connection = await (deps.connect ?? connectGuideClient)();
    const runResult = await runGuide(step3Query, connection.call, { now });
    const evidence = collectEvidence(runResult.outputs, step3Query);
    const deterministic = buildGuideSummary(runResult.facts, evidence);

    const summarizeAi = deps.summarizeAi ?? summarizeWithGuideAi;
    const aiResult: GuideAiResult = await summarizeAi(
      {
        outputs: runResult.outputs,
        evidence,
        headers: input.headers,
        toolCalls: runResult.trace.length,
      },
      { env },
    );

    const useAi = aiResult.status === "ok" && aiResult.sentences.length > 0;
    const sentences = useAi ? aiResult.sentences : deterministic.sentences;
    const droppedSentences = useAi
      ? aiResult.dropped
      : [...aiResult.dropped, ...deterministic.dropped];
    const matchedValues = useAi
      ? aiResult.matchedValues
      : deterministic.matchedValues;

    const allFailed =
      runResult.trace.length > 0 && runResult.trace.every((t) => !t.ok);
    const status: GuideAnswerStatus = runResult.needsMunicipalitySelection
      ? "candidates"
      : allFailed
        ? "failed"
        : "ok";

    return {
      status,
      ...(allFailed
        ? {
            message:
              "道具の呼び出しに失敗しました。入力条件を確認して再度お試しください。",
          }
        : {}),
      query: step3Query,
      plan,
      parsedBody,
      trace: runResult.trace,
      facts: runResult.facts,
      aiStatus: aiResult.status,
      aiNote: aiResult.note,
      sentences,
      droppedCount: droppedSentences.length,
      droppedSentences,
      matchedCount: matchedValues.length,
      matchedValues,
      followUps: buildGuideFollowUps(step3Query, runResult.facts),
    };
  } catch {
    return {
      status: "failed",
      message:
        "道具の接続または実行に失敗しました。しばらくしてからお試しください。",
      query: step3Query,
      plan,
      parsedBody,
      trace: [],
      facts: emptyGuideFacts(),
      aiStatus: "paused",
      aiNote: GUIDE_AI_PAUSED_TEXT,
      sentences: [],
      droppedCount: 0,
      droppedSentences: [],
      matchedCount: 0,
      matchedValues: [],
      followUps,
    };
  } finally {
    if (connection) {
      await connection.close().catch(() => {});
    }
  }
}

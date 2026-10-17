import { canUseAgent } from "@/lib/agentEntitlement";
import { chainRequestError } from "@/lib/mcpChainRequest";
import { toResponseMessage } from "@/lib/errorMessage";
import { clientKey } from "@/lib/apiGuard";
import { chainInputSchema, connectChainClient, runChain } from "@/lib/mcpChain";

import {
  agentInputSchema,
  createAgentModel,
  runAgent,
  withinSignal,
  AGENT_LIMITS,
} from "@/lib/mcpAgent";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { agentSessionUser } from "@/lib/agentSession";
import {
  createSaveOfferGate,
  parseSaveOfferState,
  readSaveOfferCookie,
} from "@/lib/saveOffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 48 * 1024;
export async function POST(request: Request): Promise<Response> {
  const rejected = chainRequestError(request);
  if (rejected)
    return Response.json(
      { error: "同じサイトのJSONフォームから送信してください。" },
      { status: rejected },
    );
  const key = clientKey(request.headers);
  // Content-Length だけを信用せず、ストリームの実バイト数も制限する。
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "入力がありません。" }, { status: 400 });
  let raw = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  const bodyTimer = setTimeout(() => {
    void reader.cancel();
  }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return Response.json(
          { error: "会話が長すぎます。新しいチャットを始めてください。" },
          { status: 413 },
        );
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return Response.json(
      { error: "入力を読めませんでした。" },
      { status: 400 },
    );
  } finally {
    clearTimeout(bodyTimer);
    reader.releaseLock();
  }
  let parsed;
  let entitlement: ReturnType<typeof canUseAgent>;
  let session: Awaited<ReturnType<typeof agentSessionUser>> = {
    signedIn: false,
  };
  try {
    const body = JSON.parse(raw);
    if (body?.mode === "llm" && !chainLlmState().enabled)
      return Response.json({ error: "AI回答は無効です。" }, { status: 404 });
    if (body?.mode === "llm") session = await agentSessionUser(request);
    entitlement = canUseAgent({
      // ログイン中は本人の id（HMAC 済み）で数える。IP を共有する家庭・職場で
      // 他人の分まで枠を減らさない。未ログインは従来どおり IP。
      ...(session.userId ? { userId: session.userId } : {}),
      ip: key,
      mode: body?.mode === "llm" ? "llm" : "deterministic",
    });
    if (!entitlement.allowed)
      return Response.json(
        { error: entitlement.reason, remaining: entitlement.remaining },
        { status: 429, headers: { "Retry-After": "20" } },
      );
    parsed =
      body?.mode === "llm"
        ? agentInputSchema.safeParse(body)
        : chainInputSchema.safeParse(body);
  } catch {
    return Response.json(
      { error: "JSON形式で入力してください。" },
      { status: 400 },
    );
  }
  if (!parsed.success) {
    entitlement.finish();
    return Response.json(
      {
        error:
          "質問は500文字以内にしてください。会話が長い場合は新しいチャットを始めてください。計算フォームは市区町村名・日付・深さを確認してください。",
      },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const isAgent = input.mode === "llm" && "question" in input;
  let toolCalls = 0;
  let usedModel = "none";
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const totalTimer = isAgent
    ? setTimeout(() => abort.abort(), AGENT_LIMITS.totalMs)
    : undefined;
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let connection:
          | Awaited<ReturnType<typeof connectChainClient>>
          | undefined;
        try {
          const connecting = connectChainClient();
          // 接続待ちが期限を越えても、遅れてできた接続を残さない。
          void connecting.then(
            (c) => {
              if (signal.aborted) void c.close().catch(() => {});
            },
            () => {},
          );
          connection = await withinSignal(connecting, signal);
          const emit = (
            event:
              | import("@/lib/mcpAgent").AgentEvent
              | import("@/lib/mcpChain").ChainEvent,
          ) => {
            if (event.type === "done") toolCalls = event.calls;
            if (!cancelled)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          if (input.mode === "llm" && "question" in input) {
            await runAgent(
              input.question,
              connection,
              await withinSignal(createAgentModel(), signal),
              emit,
              signal,
              AGENT_LIMITS,
              {
                onModel: (model) => {
                  usedModel = model;
                },
                ...(chainLlmState().fallbackModel && !chainLlmState().mock
                  ? {
                      fallback: () =>
                        createAgentModel(chainLlmState().fallbackModel),
                    }
                  : {}),
              },
              {
                history: input.history,
                profile: input.profile,
                people: input.people,
                memories: input.memories,
                session: {
                  signedIn: session.signedIn,
                  saveOffer: createSaveOfferGate({
                    signedIn: session.signedIn,
                    conversationKey: input.conversationKey,
                    state: parseSaveOfferState(
                      readSaveOfferCookie(request.headers.get("cookie")),
                    ),
                  }),
                },
              },
            );
          } else {
            await runChain(input, connection.call, emit, signal);
          }
        } catch {
          if (!cancelled)
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "done",
                  calls: 0,
                  reasons: [
                    toResponseMessage(
                      null,
                      "計算を続けられませんでした。再実行してください。",
                    ),
                  ],
                }) + "\n",
              ),
            );
        } finally {
          clearTimeout(totalTimer);
          entitlement.finish({
            model: usedModel,
            toolCalls,
          });
          // ロック解放は、ハング・失敗しうるtransportのcloseより先に行う。
          void connection?.close().catch(() => {});
          if (!cancelled) controller.close();
        }
      })().catch(() => {});
    },
    cancel() {
      cancelled = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Agent-Remaining-Requests": String(entitlement.remaining.requests),
      "X-Agent-Remaining-Tokens": String(entitlement.remaining.tokens),
    },
  });
}

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { canUseAgent } from "./agentEntitlement";
import { agentSessionUser } from "./agentSession";
import { chainRequestError } from "./mcpChainRequest";
import { assertChainTool, CHAIN_TOOLS, connectChainClient } from "./mcpChain";
import { AGENT_LIMITS, AGENT_SYSTEM, withinSignal } from "./mcpAgent";
import { voiceLimit, voiceState } from "./mcpVoiceConfig";
import { voiceStore, VoiceStoreError, type VoiceStore } from "./mcpVoiceStore";

const ERROR = "音声の処理を続けられませんでした。時間をおいてお試しください。";
const LOGIN_ERROR = "音声で話すにはログインが必要です。";

class VoiceError extends Error {
  constructor(
    readonly status: number,
    message = ERROR,
    readonly code?: string,
  ) {
    super(message);
  }
}

const sessionSchema = z.object({ sessionId: z.string().max(512) });
const toolSchema = sessionSchema
  .extend({
    name: z.string().max(80),
    call_id: z.string().min(1).max(128),
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();
const endSchema = sessionSchema
  .extend({ seconds: z.number().finite().nonnegative() })
  .strict();
const mockKey = randomBytes(32).toString("hex");

function signingSecret() {
  const secret =
    process.env.API_SECRET_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.XAI_API_KEY ||
    (voiceState().mock ? mockKey : "");
  if (!secret) throw new VoiceError(404);
  return secret;
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret())
    .update("mcp-voice-session-v1:" + payload)
    .digest("base64url");
}

/** DB には Supabase user id を置かず、個体を跨いで安定する HMAC だけを置く。 */
export function voiceUserSubject(userId: string) {
  return createHmac("sha256", signingSecret())
    .update("mcp-voice-user-v1:" + userId)
    .digest("hex");
}

function createSessionId() {
  const payload = randomBytes(24).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function sessionHash(id: string) {
  const [payload, mac, extra] = id.split(".");
  const expected = Buffer.from(signature(payload || ""));
  const actual = Buffer.from(mac || "");
  if (
    extra ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new VoiceError(403);
  return createHash("sha256").update(id).digest("hex");
}

function storeError(error: VoiceStoreError) {
  if (error.kind === "unavailable") return new VoiceError(503);
  if (error.kind === "duplicate") return new VoiceError(409);
  if (error.kind === "tool_limit") return new VoiceError(429);
  return new VoiceError(403);
}

export function createVoiceService(
  deps: {
    entitlement: typeof canUseAgent;
    store: VoiceStore;
    authenticate: typeof agentSessionUser;
    connect: typeof connectChainClient;
    fetch: typeof fetch;
    now: () => number;
  } = {
    entitlement: canUseAgent,
    store: voiceStore,
    authenticate: agentSessionUser,
    connect: connectChainClient,
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
  },
) {
  async function connection<T>(
    signal: AbortSignal,
    run: (c: Awaited<ReturnType<typeof connectChainClient>>) => Promise<T>,
  ) {
    const pending = deps.connect();
    void pending.then(
      (c) => {
        if (signal.aborted) void c.close();
      },
      () => {},
    );
    const c = await withinSignal(pending, signal);
    try {
      return await withinSignal(run(c), signal);
    } finally {
      await c.close();
    }
  }

  return async function handle(
    kind: "session" | "tool" | "end",
    request: Request,
  ) {
    const reply = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    try {
      // Origin と Content-Type は、認証の有無を返す前に検査する。
      const rejected = chainRequestError(request);
      if (rejected) throw new VoiceError(rejected);
      // 無効時は機能ごと隠す（Supabase への本人確認も走らせない）。
      if (!voiceState().enabled) throw new VoiceError(404);
      const auth = await deps.authenticate(request);
      if (!auth.signedIn || !auth.userId)
        throw new VoiceError(401, LOGIN_ERROR, "login_required");

      const reader = request.body?.getReader();
      if (!reader) throw new VoiceError(400);
      let raw = "";
      let bytes = 0;
      const decoder = new TextDecoder();
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(5000),
      ]);
      try {
        while (true) {
          const part = await withinSignal(reader.read(), signal);
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 16384) throw new VoiceError(413);
          raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const body: unknown = JSON.parse(raw);
      const userSubject = voiceUserSubject(auth.userId);

      if (kind === "session") {
        z.object({}).strict().parse(body);
        try {
          await deps.store.sweepExpired();
        } catch (error) {
          if (error instanceof VoiceStoreError) throw storeError(error);
          throw new VoiceError(503);
        }
        const entitlement = deps.entitlement({
          userId: auth.userId,
          ip: "authenticated-voice",
          mode: "llm",
          at: deps.now(),
        });
        if (!entitlement.allowed) throw new VoiceError(429);
        const state = voiceState();
        const id = createSessionId();
        const hash = sessionHash(id);
        let reserved;
        try {
          reserved = await deps.store.reserveSession({
            sessionHash: hash,
            userSubject,
            model: state.model,
            maxSessionSeconds: Math.min(
              3600,
              voiceLimit("MCP_VOICE_MAX_SESSION_SECONDS", 180),
            ),
            globalDailySeconds: voiceLimit("MCP_VOICE_DAILY_SECONDS", 1800),
            userDailySeconds: voiceLimit("MCP_VOICE_FREE_DAILY_SECONDS", 180),
          });
        } catch (error) {
          entitlement.finish();
          if (error instanceof VoiceStoreError) throw storeError(error);
          throw new VoiceError(503);
        }
        if (!reserved) {
          entitlement.finish();
          throw new VoiceError(429);
        }
        try {
          const issuanceSignal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(AGENT_LIMITS.callMs),
          ]);
          const tools = await connection(issuanceSignal, async (c) =>
            (await c.listTools()).tools
              .filter((t) =>
                (CHAIN_TOOLS as readonly string[]).includes(t.name),
              )
              .map((t) => ({
                type: "function",
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              })),
          );
          let token = "mock-client-secret";
          let expires = Math.floor(reserved.expiresAt / 1000);
          if (!state.mock) {
            const response = await deps.fetch(
              "https://api.x.ai/v1/realtime/client_secrets",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.XAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  expires_after: { seconds: reserved.reservedSeconds },
                }),
                signal: issuanceSignal,
              },
            );
            if (!response.ok) throw new VoiceError(502);
            const secret = z
              .object({
                value: z.string().min(1),
                expires_at: z.number().int().positive(),
              })
              .parse(await response.json());
            if (secret.value.includes(process.env.XAI_API_KEY!))
              throw new VoiceError(502);
            token = secret.value;
            expires = Math.min(expires, secret.expires_at);
            if (expires * 1000 <= deps.now()) throw new VoiceError(502);
          }
          // WebSocket は xAI へ直結するため、サーバー側の期限は tool/end を
          // 拒否する best-effort の境界であり、接続そのものは強制切断できない。
          entitlement.finish({
            model: state.model,
            toolCalls: 0,
            voiceSeconds: 0,
          });
          return reply({
            token,
            expires_at: expires,
            model: state.model,
            sessionId: id,
            seconds: reserved.reservedSeconds,
            mock: state.mock,
            tools,
            instructions:
              AGENT_SYSTEM +
              " 音声では要点を短く、1回に2〜3文で話してください。",
          });
        } catch {
          // 発行が提供元で成功している可能性があるため、予約は返さない。
          // セッションは未終了のまま残り、期限後の sweep が予約秒数で精算する
          // （利用者へは sessionId を渡していないので tool/end には使われない）。
          entitlement.finish({
            model: state.model,
            toolCalls: 0,
            voiceSeconds: reserved.reservedSeconds,
          });
          throw new VoiceError(502);
        }
      }

      if (kind === "end") {
        const input = endSchema.parse(body);
        try {
          await deps.store.settleSession({
            sessionHash: sessionHash(input.sessionId),
            userSubject,
            reportedSeconds: input.seconds,
          });
        } catch (error) {
          if (error instanceof VoiceStoreError) throw storeError(error);
          throw new VoiceError(503);
        }
        return reply({ ended: true });
      }

      const input = toolSchema.parse(body);
      try {
        assertChainTool(input.name);
      } catch {
        throw new VoiceError(403);
      }
      const hash = sessionHash(input.sessionId);
      let storedSession;
      try {
        storedSession = await deps.store.claimTool({
          sessionHash: hash,
          userSubject,
          callId: input.call_id,
          maxToolCalls: Math.min(
            AGENT_LIMITS.calls,
            voiceLimit("MCP_VOICE_MAX_TOOL_CALLS", 20),
          ),
        });
      } catch (error) {
        if (error instanceof VoiceStoreError) throw storeError(error);
        throw new VoiceError(503);
      }
      const started = deps.now();
      const timeout = Math.max(
        1,
        Math.min(AGENT_LIMITS.callMs, storedSession.expiresAt - started),
      );
      const callSignal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(timeout),
      ]);
      const output = await connection(callSignal, (c) =>
        c.call(input.name, input.arguments, callSignal, timeout),
      );
      try {
        await deps.store.assertActive({ sessionHash: hash, userSubject });
      } catch (error) {
        if (error instanceof VoiceStoreError) throw storeError(error);
        throw new VoiceError(503);
      }
      const bounded = JSON.stringify(output).slice(0, 6000);
      return reply({
        output:
          "BEGIN_UNTRUSTED_TOOL_DATA\n" + bounded + "\nEND_UNTRUSTED_TOOL_DATA",
        summary: "道具の結果を取得しました。",
        durationMs: deps.now() - started,
      });
    } catch (error) {
      const voiceError = error instanceof VoiceError ? error : undefined;
      return reply(
        {
          error: voiceError?.message ?? ERROR,
          ...(voiceError?.code ? { code: voiceError.code } : {}),
        },
        voiceError
          ? voiceError.status
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 502,
      );
    }
  };
}

const voiceGlobal = globalThis as typeof globalThis & {
  mcpVoiceService?: ReturnType<typeof createVoiceService>;
};

// session/tool/end can be emitted as separate Next route bundles; DB state is shared.
export const handleVoice = (voiceGlobal.mcpVoiceService ??=
  createVoiceService());

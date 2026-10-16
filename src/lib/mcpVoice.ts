import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { canUseAgent, usageLedger } from "./agentEntitlement";
import { clientKey } from "./apiGuard";
import { chainRequestError } from "./mcpChainRequest";
import { assertChainTool, CHAIN_TOOLS, connectChainClient } from "./mcpChain";
import { AGENT_LIMITS, AGENT_SYSTEM, withinSignal } from "./mcpAgent";
import { voiceLimit, voiceState } from "./mcpVoiceConfig";

const ERROR = "音声の処理を続けられませんでした。時間をおいてお試しください。";
class VoiceError extends Error {
  constructor(readonly status: number) {
    super(ERROR);
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
function signature(payload: string) {
  const secret =
    process.env.API_SECRET_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.XAI_API_KEY ||
    (voiceState().mock ? mockKey : "");
  if (!secret) throw new VoiceError(404);
  return createHmac("sha256", secret)
    .update("mcp-voice-session-v1:" + payload)
    .digest("base64url");
}

/** Same instance-local scope as the existing UsageLedger. Unknown sessions fail closed. */
export function createVoiceService(
  deps = {
    entitlement: canUseAgent,
    ledger: usageLedger,
    connect: connectChainClient,
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    now: () => Date.now(),
  },
) {
  type Session = {
    expires: number;
    seconds: number;
    calls: number;
    ended: boolean;
    ids: Set<string>;
    settle: (seconds: number) => void;
    finish: ReturnType<typeof canUseAgent>["finish"];
    model: string;
    abort: AbortController;
  };
  const sessions = new Map<string, Session>();
  function finish(s: Session, seconds: number) {
    if (s.ended) return;
    s.ended = true;
    s.abort.abort();
    const actual = Math.min(s.seconds, Math.ceil(seconds));
    s.settle(actual);
    s.finish({ model: s.model, toolCalls: s.calls, voiceSeconds: actual });
  }
  function sweep() {
    for (const [id, s] of sessions) {
      if (s.expires <= deps.now()) finish(s, s.seconds);
      if (s.expires + 60000 < deps.now()) sessions.delete(id);
    }
  }
  function get(id: string, allowEnded = false) {
    const [payload, mac, extra] = id.split(".");
    const expected = Buffer.from(signature(payload || ""));
    const actual = Buffer.from(mac || "");
    if (
      extra ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new VoiceError(403);
    const s = sessions.get(id);
    if (!s || (!allowEnded && (s.ended || s.expires <= deps.now())))
      throw new VoiceError(403);
    return s;
  }
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
      const rejected = chainRequestError(request);
      if (rejected) throw new VoiceError(rejected);
      if (!voiceState().enabled) throw new VoiceError(404);
      sweep();
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
      if (kind === "session") {
        z.object({}).strict().parse(body);
        const entitlement = deps.entitlement({
          ip: clientKey(request.headers),
          mode: "llm",
          at: deps.now(),
        });
        if (!entitlement.allowed) throw new VoiceError(429);
        const at = deps.now();
        const seconds = Math.min(
          3600,
          voiceLimit("MCP_VOICE_MAX_SESSION_SECONDS", 180),
          voiceLimit("MCP_VOICE_DAILY_SECONDS", 1800) -
            deps.ledger.voiceDaily(at),
          voiceLimit("MCP_VOICE_FREE_DAILY_SECONDS", 180) -
            deps.ledger.voiceDaily(at, entitlement.subject),
        );
        if (seconds < 1) {
          entitlement.finish();
          throw new VoiceError(429);
        }
        const settle = deps.ledger.reserveVoice(
          entitlement.subject,
          seconds,
          at,
        );
        const state = voiceState();
        try {
          const signal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(AGENT_LIMITS.callMs),
          ]);
          const tools = await connection(signal, async (c) =>
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
          let expires = Math.floor(at / 1000) + seconds;
          if (!state.mock) {
            const response = await deps.fetch(
              "https://api.x.ai/v1/realtime/client_secrets",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.XAI_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ expires_after: { seconds } }),
                signal,
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
          const payload = `${randomBytes(24).toString("base64url")}:${expires}`;
          const sessionId = `${payload}.${signature(payload)}`;
          sessions.set(sessionId, {
            expires: expires * 1000,
            seconds,
            calls: 0,
            ended: false,
            ids: new Set(),
            settle,
            finish: entitlement.finish,
            model: state.model,
            abort: new AbortController(),
          });
          return reply({
            token,
            expires_at: expires,
            model: state.model,
            sessionId,
            seconds,
            mock: state.mock,
            tools,
            instructions:
              AGENT_SYSTEM +
              " 音声では要点を短く、1回に2〜3文で話してください。",
          });
        } catch {
          // Issuance may have succeeded upstream: retain the reservation on ambiguous failure.
          settle(seconds);
          entitlement.finish({
            model: state.model,
            toolCalls: 0,
            voiceSeconds: seconds,
          });
          throw new VoiceError(502);
        }
      }
      if (kind === "end") {
        const input = endSchema.parse(body);
        const s = get(input.sessionId, true);
        finish(s, input.seconds);
        return reply({ ended: true });
      }
      const input = toolSchema.parse(body);
      const s = get(input.sessionId);
      try {
        assertChainTool(input.name);
      } catch {
        throw new VoiceError(403);
      }
      if (
        s.calls >=
        Math.min(AGENT_LIMITS.calls, voiceLimit("MCP_VOICE_MAX_TOOL_CALLS", 20))
      )
        throw new VoiceError(429);
      if (s.ids.has(input.call_id)) throw new VoiceError(409);
      s.ids.add(input.call_id);
      s.calls++;
      const started = deps.now();
      const timeout = Math.max(
        1,
        Math.min(AGENT_LIMITS.callMs, s.expires - started),
      );
      const callSignal = AbortSignal.any([
        request.signal,
        s.abort.signal,
        AbortSignal.timeout(timeout),
      ]);
      const output = await connection(callSignal, (c) =>
        c.call(input.name, input.arguments, callSignal, timeout),
      );
      if (deps.now() >= s.expires || deps.now() - started >= timeout || s.ended)
        throw new VoiceError(403);
      const bounded = JSON.stringify(output).slice(0, 6000);
      return reply({
        output:
          "BEGIN_UNTRUSTED_TOOL_DATA\n" + bounded + "\nEND_UNTRUSTED_TOOL_DATA",
        summary: "道具の結果を取得しました。",
        durationMs: deps.now() - started,
      });
    } catch (e) {
      return reply(
        { error: ERROR },
        e instanceof VoiceError
          ? e.status
          : e instanceof z.ZodError || e instanceof SyntaxError
            ? 400
            : 502,
      );
    }
  };
}
const voiceGlobal = globalThis as typeof globalThis & {
  mcpVoiceService?: ReturnType<typeof createVoiceService>;
};
// session/tool/end can be emitted as separate Next route bundles.
export const handleVoice = (voiceGlobal.mcpVoiceService ??=
  createVoiceService());

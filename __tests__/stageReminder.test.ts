// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import {
  AGENT_LIMITS,
  agentSessionSystem,
  runAgent,
  type AgentConversationContext,
  type AgentEvent,
} from "@/lib/mcpAgent";
import { createAgentMock } from "@/lib/mcpAgentMock";
import { connectChainClient } from "@/lib/mcpChain";
import { reminderOfferCard, verifyReminderOffer } from "@/lib/reminders";

vi.mock("@/lib/prisma", () => {
  throw new Error("DB must not be loaded");
});

const secret = "s".repeat(40);
const reminders = {
  offer: (o: { date: string; direction: string }) =>
    reminderOfferCard(secret, o),
};

async function runWith(
  model: MockLanguageModelV3,
  context: AgentConversationContext,
) {
  const connection = await connectChainClient();
  const events: AgentEvent[] = [];
  try {
    await runAgent(
      "固定例 1990年5月5日生まれ",
      connection,
      model,
      (e) => events.push(e),
      undefined,
      AGENT_LIMITS,
      {},
      context,
    );
  } finally {
    await connection.close();
  }
  return events;
}

const call = (
  toolCallId: string,
  toolName: string,
  input: unknown,
): LanguageModelV3StreamPart => ({
  type: "tool-call",
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});

/** 1 手目で吉日を計算し、2 手目で与えた呼び出しを並べるモデル。 */
function scripted(
  second: (
    findId: string,
    days: { direction: string; date: string }[],
  ) => LanguageModelV3StreamPart[] | null,
) {
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      const results = prompt
        .flatMap((m) => (m.role === "tool" ? m.content : []))
        .filter((p) => p.type === "tool-result");
      let body: LanguageModelV3StreamPart[] | null = null;
      if (results.length === 0)
        body = [
          call("f1", "find_auspicious_days", {
            birthDate: "1990-05-05",
            lon: 139.28,
            from: "2026-11-01",
            days: 30,
            maxDaysPerDirection: 3,
          }),
        ];
      else if (results.length === 1) {
        const out = results[0].output;
        const raw =
          out.type === "text"
            ? JSON.parse(
                out.value
                  .replace(/^BEGIN_UNTRUSTED_TOOL_DATA\n/, "")
                  .replace(/\nEND_UNTRUSTED_TOOL_DATA$/, ""),
              )
            : out.type === "json"
              ? out.value
              : {};
        const days = (
          raw as {
            directions: { direction: string; bestDays: { date: string }[] }[];
          }
        ).directions.flatMap((d) =>
          d.bestDays.map((b) => ({ direction: d.direction, date: b.date })),
        );
        body = second("f1", days);
      }
      body ??= [
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "結果をお伝えしました。" },
        { type: "text-end", id: "t" },
      ];
      const toolTurn = body.some((p) => p.type === "tool-call");
      const parts: LanguageModelV3StreamPart[] = [
        { type: "stream-start", warnings: [] },
        ...body,
        {
          type: "finish",
          finishReason: {
            unified: toolTurn ? "tool-calls" : "stop",
            raw: undefined,
          },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
        },
      ];
      return {
        stream: new ReadableStream({
          start(c) {
            for (const part of parts) c.enqueue(part);
            c.close();
          },
        }),
      };
    },
  });
}

describe("stage_reminder", () => {
  it("signed-in + enabled: the mock offers a server-signed card for a real result", async () => {
    const model = createAgentMock();
    const events = await runWith(model, {
      session: { signedIn: true, reminders },
    });
    const offers = events.flatMap((e) =>
      e.type === "reminder-offer" ? [e.offer] : [],
    );
    expect(offers).toHaveLength(1);
    expect(verifyReminderOffer(secret, offers[0])).toBe(true);
    expect(offers[0].acceptLabel).toBe("お知らせを設定する");
    expect(events.at(-1)?.type).toBe("done");
  });
  it("is not visible when signed out, or when Resend env is missing", async () => {
    for (const session of [
      { signedIn: false, reminders },
      { signedIn: true },
    ]) {
      const model = createAgentMock();
      const events = await runWith(model, { session });
      expect(events.some((e) => e.type === "reminder-offer")).toBe(false);
      expect(model.doStreamCalls[0].tools?.map((t) => t.name)).not.toContain(
        "stage_reminder",
      );
    }
  });
  it("injection: a date/direction not in the calculation never becomes a card", async () => {
    const model = scripted((findId, days) => [
      call("r1", "stage_reminder", {
        resultCallId: findId,
        date: "2026-12-31",
        direction: days[0].direction,
      }),
      call("r2", "stage_reminder", {
        resultCallId: "made-up",
        date: days[0].date,
        direction: days[0].direction,
      }),
    ]);
    const events = await runWith(model, {
      session: { signedIn: true, reminders },
    });
    expect(events.some((e) => e.type === "reminder-offer")).toBe(false);
  });
  it("injection: repeated calls are capped (no duplicates, at most 3)", async () => {
    const model = scripted((findId, days) => [
      ...[0, 0, 0].map((i, n) =>
        call(`d${n}`, "stage_reminder", {
          resultCallId: findId,
          date: days[i].date,
          direction: days[i].direction,
        }),
      ),
      ...days.slice(1, 6).map((d, n) =>
        call(`m${n}`, "stage_reminder", {
          resultCallId: findId,
          date: d.date,
          direction: d.direction,
        }),
      ),
    ]);
    const events = await runWith(model, {
      session: { signedIn: true, reminders },
    });
    const offers = events.filter((e) => e.type === "reminder-offer");
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(offers.length).toBeGreaterThan(0);
    const keys = offers.map((e) =>
      e.type === "reminder-offer" ? `${e.offer.date}:${e.offer.direction}` : "",
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("tells the model only booleans, no ids/emails", () => {
    const text = agentSessionSystem({ signedIn: true, reminders });
    expect(text).toContain("stage_reminder");
    expect(text).not.toMatch(/@|[0-9a-f]{8}-/);
    expect(agentSessionSystem({ signedIn: true })).not.toContain(
      "stage_reminder",
    );
  });
});

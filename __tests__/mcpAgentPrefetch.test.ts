// @vitest-environment node
import { expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import {
  AGENT_LIMITS,
  agentInputSchema,
  runAgent,
  type AgentEvent,
  type AgentPerson,
} from "@/lib/mcpAgent";
import { toJapanDateString } from "@/utils/japanDate";

const origin = {
  lat: 35.1709,
  lon: 136.8815,
  code: "23105",
  name: "愛知県名古屋市中村区",
};
const person = { id: "test", name: "テスト", birthDate: "1988-11-25", origin };
async function run(
  question: string,
  profile: AgentPerson = person,
  fail = false,
) {
  const output: Record<string, unknown> = {
    get_honmei_star: { birthDate: person.birthDate, honmeiStar: 3 },
    judge_directions: {
      date: "2026-12-01",
      directions: [{ direction: "E", label: "東", status: "吉" }],
    },
    find_auspicious_days: {
      directions: [
        { direction: "E", label: "東", bestDays: [{ date: "2026-12-01" }] },
      ],
    },
    search_municipality: { results: [origin] },
    area_directions: {
      origin,
      directions: [
        {
          direction: "E",
          label: "東",
          nearest: [{ code: "13101", name: "東京都千代田区" }],
        },
      ],
    },
  };
  const call = vi.fn(async (name: string) => output[name]);
  const connection = {
    call,
    close: async () => {},
    listTools: async () => ({
      tools: Object.keys(output).map((name) => ({
        name,
        inputSchema: { type: "object" as const },
      })),
    }),
  };
  const model = new MockLanguageModelV3({
    doStream: async () => {
      if (fail) throw Object.assign(new Error("quota"), { statusCode: 402 });
      return {
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            c.enqueue({ type: "text-start", id: "answer" });
            c.enqueue({
              type: "text-delta",
              id: "answer",
              delta: "計算結果をご覧ください。",
            });
            c.enqueue({ type: "text-end", id: "answer" });
            c.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 0,
                  noCache: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 0, text: 0, reasoning: 0 },
              },
            });
            c.close();
          },
        }),
      };
    },
  });
  const events: AgentEvent[] = [];
  await runAgent(
    question,
    connection,
    model,
    (e) => events.push(e),
    undefined,
    AGENT_LIMITS,
    {},
    { people: [profile] },
  );
  return { events, call, model };
}
it("モデルが道具を呼ばなくてもプロフィールで並列計算し、表示ブロックを返す", async () => {
  const { events, call, model } = await run(
    "引越しを考えています。日付と方位を相談したいです。",
  );
  expect(
    events.filter((e) => e.type === "tool-call").map((e) => e.tool),
  ).toEqual(["get_honmei_star", "judge_directions", "find_auspicious_days"]);
  expect(call.mock.calls[1].slice(0, 2)).toMatchObject([
    "judge_directions",
    {
      birthDate: person.birthDate,
      lon: origin.lon,
      date: toJapanDateString(new Date()),
    },
  ]);
  expect(call.mock.calls[2].slice(0, 2)).toMatchObject([
    "find_auspicious_days",
    { days: 90, maxDaysPerDirection: 3 },
  ]);
  expect(
    events
      .filter((e) => e.type === "blocks")
      .flatMap((e) => e.blocks.map((b) => b.type)),
  ).toEqual(expect.arrayContaining(["compass", "days", "text"]));
  expect(events.at(-1)).toMatchObject({ answerFields: ["period"] });
  expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain(
    "BEGIN_UNTRUSTED_TOOL_DATA",
  );
  expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain("prefetch-1");
});
it("街の候補も計算し、明示日を優先する", async () => {
  const { events, call } = await run("引越しは2026-12-01。候補の街を3つ");
  expect(
    events.some((e) => e.type === "tool-call" && e.tool === "area_directions"),
  ).toBe(true);
  expect(call.mock.calls[1].slice(0, 2)).toMatchObject([
    "judge_directions",
    { date: "2026-12-01" },
  ]);
  expect(
    events
      .filter((e) => e.type === "blocks")
      .flatMap((e) => e.blocks.map((b) => b.type)),
  ).toContain("towns");
});
it("地名だけなら市区町村検索の確定結果から街を計算する", async () => {
  const { call } = await run("候補の街を3つ", {
    ...person,
    origin: { ...origin, code: undefined },
  });
  expect(call.mock.calls.map(([name]) => name)).toEqual(
    expect.arrayContaining(["search_municipality", "area_directions"]),
  );
});
it("出発地がなければ本命星だけ計算し、出発地ボタンを返す", async () => {
  const { events, call } = await run("引越しを相談したい", {
    ...person,
    origin: undefined,
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(events.at(-1)).toMatchObject({ answerFields: ["origin", "period"] });
});
it("モデル停止でも計算結果とサーバー要約を残す", async () => {
  const { events } = await run("引越しの相談", person, true);
  expect(events.some((e) => e.type === "blocks")).toBe(true);
  expect(
    events.some((e) => e.type === "text-delta" && e.text.includes("本命星")),
  ).toBe(true);
});
it("出発地の範囲・市区町村コード・未知キーをstrictに検証する", () => {
  const input = { mode: "llm", question: "相談", people: [person] };
  expect(agentInputSchema.safeParse(input).success).toBe(true);
  for (const bad of [
    { ...origin, lat: 0 },
    { ...origin, code: "123" },
    { ...origin, extra: true },
  ])
    expect(
      agentInputSchema.safeParse({
        ...input,
        people: [{ ...person, origin: bad }],
      }).success,
    ).toBe(false);
});

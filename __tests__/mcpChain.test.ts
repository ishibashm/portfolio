// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => {
  throw new Error("DB must not be loaded");
});
vi.mock("@/utils/supabase/server", () => {
  throw new Error("Login must not be loaded");
});
import {
  CHAIN_LIMITS,
  assertChainTool,
  chainInputSchema,
  chainLlmState,
  connectChainClient,
  runChain,
  type ChainEvent,
  type ChainCaller,
} from "@/lib/mcpChain";
import { POST } from "@/app/api/mcp-chain/route";
const input = chainInputSchema.parse({
  birthDate: "1990-06-15",
  municipality: "長崎市",
  date: "2026-10-16",
  depth: 4,
});
function fixture() {
  return vi.fn<ChainCaller>(async (name, args) => {
    if (name === "search_municipality")
      return {
        results: [{ code: "42201", name: "長崎県長崎市", lon: 129.87 }],
      };
    if (name === "get_honmei_star")
      return { birthDate: "1990-06-15", honmeiStar: 1 };
    if (name === "judge_directions")
      return {
        date: "2026-10-16",
        directions: [
          { direction: "E", label: "東", status: "OPTIMAL" },
          { direction: "W", label: "西", status: "SAFE" },
        ],
      };
    if (name === "find_auspicious_days")
      return {
        directions: [{ label: "東", bestDays: [{ date: "2026-10-20" }] }],
      };
    if (name === "area_directions")
      return {
        origin: { code: args.code, name: "街", lon: 130 },
        directions: [
          { direction: "E", nearest: [{ code: "42202", name: "候補" }] },
          { direction: "W", nearest: [{ code: "42203", name: "平の街" }] },
        ],
      };
    return { pref: "長崎県" };
  });
}
async function collect(depth = 4, limits = CHAIN_LIMITS) {
  const events: ChainEvent[] = [];
  const call = fixture();
  await runChain(
    { ...input, depth },
    call,
    (e) => events.push(e),
    undefined,
    limits,
  );
  return { events, call };
}
describe("公開MCP連鎖", () => {
  it("前の結果から経度・日付・候補コードを渡し、平を吉に含めない", async () => {
    const { events, call } = await collect();
    expect(
      call.mock.calls.find(([n]) => n === "judge_directions")?.[1],
    ).toEqual({ birthDate: "1990-06-15", lon: 129.87, date: "2026-10-16" });
    expect(
      call.mock.calls.find(([n]) => n === "find_auspicious_days")?.[1],
    ).toMatchObject({ lon: 129.87, from: "2026-10-16", days: 30 });
    expect(
      call.mock.calls
        .filter(([n]) => n === "area_directions")
        .map(([, a]) => a.code),
    ).toEqual(["42201", "42202"]);
    expect(
      call.mock.calls.find(([n]) => n === "prefecture_summary")?.[1].prefecture,
    ).toBe("42");
    const child = events.find(
      (e) =>
        e.type === "call" &&
        e.tool === "area_directions" &&
        e.input.code === "42202",
    );
    expect(child).toMatchObject({ depth: 4, parentId: 5 });
  });
  it("深さ0と既定3を越えて呼ばない", async () => {
    const zero = await collect(0);
    expect(zero.call).toHaveBeenCalledTimes(1);
    const three = await collect(3);
    expect(
      three.events.filter((e) => e.type === "call").every((e) => e.depth <= 3),
    ).toBe(true);
    expect(three.events.at(-1)).toMatchObject({
      reasons: ["深さの上限で打ち切りました。"],
    });
  });
  it("回数上限を強制する", async () => {
    const { call, events } = await collect(4, { ...CHAIN_LIMITS, calls: 2 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({
      calls: 2,
      reasons: ["道具の回数上限で打ち切りました。"],
    });
  });
  it("呼び出し側が大きな予算を渡しても20回まで", async () => {
    const base = fixture();
    const events: ChainEvent[] = [];
    const call: ChainCaller = async (name, args, signal, timeout) => {
      if (name === "area_directions")
        return {
          origin: { code: args.code, name: "街", lon: 130 },
          directions: [
            {
              direction: "E",
              nearest: Array.from({ length: 30 }, (_, i) => ({
                code: String(42300 + i),
                name: "候補",
              })),
            },
          ],
        };
      return base(name, args, signal, timeout);
    };
    await runChain(input, call, (e) => events.push(e), undefined, {
      ...CHAIN_LIMITS,
      calls: 100,
      depth: 100,
    });
    expect(events.filter((e) => e.type === "call")).toHaveLength(20);
    expect(events.at(-1)).toMatchObject({
      calls: 20,
      reasons: expect.arrayContaining(["道具の回数上限で打ち切りました。"]),
    });
  });
  it("許可外の道具を拒む", async () => {
    expect(() => assertChainTool("get_profile")).toThrow();
    expect(() => assertChainTool("judge_time_slots")).toThrow();
    const connection = await connectChainClient();
    try {
      await expect(
        connection.call("get_profile", {}, new AbortController().signal, 100),
      ).rejects.toThrow();
    } finally {
      await connection.close();
    }
  });
  it.each([
    { birthDate: "2026-02-30" },
    { birthDate: "1899-12-31" },
    { date: "2101-01-01" },
    { date: "2026-10-16T00:00" },
    { municipality: " " },
    { municipality: "a".repeat(81) },
    { depth: 5 },
    { depth: -1 },
    { tool: "get_profile" },
  ])("無効入力を拒む: %j", (change) => {
    expect(chainInputSchema.safeParse({ ...input, ...change }).success).toBe(
      false,
    );
  });
  it("曖昧な検索結果では計算へ進まない", async () => {
    const call = fixture();
    call.mockResolvedValueOnce({
      results: [
        { code: "42201", name: "A", lon: 130 },
        { code: "42202", name: "B", lon: 131 },
      ],
    });
    const events: ChainEvent[] = [];
    await runChain(input, call, (e) => events.push(e));
    expect(call).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events.at(-1))).toContain("一つに絞れません");
  });
  it("待機中の1呼び出しを時間制限で打ち切る", async () => {
    const events: ChainEvent[] = [];
    await runChain(
      input,
      async () => new Promise(() => {}),
      (e) => events.push(e),
      undefined,
      { ...CHAIN_LIMITS, callMs: 10 },
    );
    expect(events[0]).toMatchObject({ type: "call", error: true });
    expect(JSON.stringify(events.at(-1))).toContain("時間上限");
  });
  it("全体の期限と切断後には呼ばない", async () => {
    const call = fixture();
    const events: ChainEvent[] = [];
    await runChain(input, call, (e) => events.push(e), undefined, {
      ...CHAIN_LIMITS,
      totalMs: 0,
    });
    expect(call).not.toHaveBeenCalled();
    expect(JSON.stringify(events)).toContain("全体の時間上限");
    await runChain(input, call, () => {}, AbortSignal.abort());
    expect(call).not.toHaveBeenCalled();
  });
  it("LLMは旗と鍵が揃ったときだけ有効", () => {
    expect(chainLlmState({}).enabled).toBe(false);
    expect(chainLlmState({ MCP_AGENT_ENABLED: "true" }).enabled).toBe(false);
    expect(
      chainLlmState({ MCP_AGENT_ENABLED: "true", GEMINI_API_KEY: "test" })
        .enabled,
    ).toBe(true);
  });
  it("実際のcreateMcpServerと接続して連鎖を実行する", async () => {
    const connection = await connectChainClient();
    const events: ChainEvent[] = [];
    try {
      await runChain({ ...input, depth: 3 }, connection.call, (e) =>
        events.push(e),
      );
    } finally {
      await connection.close();
    }
    expect(events.filter((e) => e.type === "call" && e.error)).toEqual([]);
    expect(
      events.find((e) => e.type === "call" && e.tool === "judge_directions"),
    ).toMatchObject({
      input: { lon: expect.any(Number), birthDate: input.birthDate },
    });
    expect(
      events.some(
        (e) => e.type === "call" && e.tool === "find_auspicious_days",
      ),
    ).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });
});
function request(body: unknown, ip: string) {
  return new Request("https://cloud-palette.com/api/mcp-chain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      Origin: "https://cloud-palette.com",
    },
    body: JSON.stringify(body),
  });
}
describe("連鎖API", () => {
  it("入力検証と本文上限", async () => {
    expect(
      (await POST(request({ ...input, depth: 99 }, "invalid"))).status,
    ).toBe(400);
    expect(
      (await POST(request({ municipality: "a".repeat(3000) }, "large"))).status,
    ).toBe(413);
  });
  it("LLM入口は404", async () => {
    expect((await POST(request({ ...input, mode: "llm" }, "llm"))).status).toBe(
      404,
    );
  });
  it("IPごと3回を越えると429とRetry-After", async () => {
    for (let i = 0; i < 3; i++)
      expect((await POST(request({}, "rate"))).status).toBe(400);
    const response = await POST(request({}, "rate"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("20");
  });
  it("NDJSONで実際の呼び出しと終了を送る", async () => {
    const response = await POST(request({ ...input, depth: 0 }, "stream"));
    expect(response.headers.get("Content-Type")).toContain("ndjson");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
    expect(lines[0]).toMatchObject({
      type: "call",
      tool: "search_municipality",
    });
    expect(lines.at(-1)).toMatchObject({ type: "done", calls: 1 });
  });
});

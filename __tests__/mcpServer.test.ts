// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcpServer";
import { GET, POST } from "@/app/api/mcp/route";
import {
  judgeDayAllDirections,
  gradeVerdict,
  ALL_DIRECTIONS,
} from "@/utils/auspiciousDays";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";
import { emptyDirections, findArea } from "@/lib/areaContent";

/**
 * MCP サーバーの検査。HTTP を通さず、SDK の in-memory transport で
 * 道具を直接呼ぶ。
 *
 * **判定の答えは画面と同じ関数から出ている**ことを、同じ入力で
 * 直接呼んだ結果と突き合わせて固定する。ここが食い違うと、AI が
 * 案内する判定と利用者が画面で見る判定がずれる。
 */
async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  return client;
}

const parse = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((r.content as { text: string }[])[0].text);

describe("MCP サーバー", () => {
  it("6 つの道具を公開している", async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "area_directions",
      "find_auspicious_days",
      "get_honmei_star",
      "judge_directions",
      "prefecture_summary",
      "search_municipality",
    ]);
  });

  it("get_honmei_star は engine と同じ本命星を返す", async () => {
    const c = await connect();
    const out = parse(
      await c.callTool({
        name: "get_honmei_star",
        arguments: { birthDate: "1957-09-22" },
      }),
    );
    const direct = getHonmeiStar(new Date("1957-09-22T12:00:00+09:00"));
    expect(out.honmeiStar).toBe(direct.classical);
    expect(out.voidZodiacs).toEqual(
      getPersonalVoidZodiac(new Date("1957-09-22T12:00:00+09:00")),
    );
  });

  it("judge_directions は画面と同じ段階を返す（8 方位ぶん突き合わせ）", async () => {
    const c = await connect();
    const args = { birthDate: "1957-09-22", lon: 135.5, date: "2028-05-19" };
    const out = parse(
      await c.callTool({ name: "judge_directions", arguments: args }),
    );
    const birth = new Date("1957-09-22T12:00:00+09:00");
    const honmei = getHonmeiStar(birth);
    const all = judgeDayAllDirections(
      new Date(forecastAnchorMs(new Date("2028-05-19T12:00:00+09:00"))),
      {
        honmeiStar: honmei.classical,
        voidZodiacs: getPersonalVoidZodiac(birth),
        lon: 135.5,
        tenchusatsuMode: out.tenchusatsuMode,
        involuntaryMove: false,
        directionFilterMode: "composite",
      },
    );
    expect(out.directions).toHaveLength(8);
    for (const dir of ALL_DIRECTIONS) {
      const row = out.directions.find(
        (d: { direction: string }) => d.direction === dir,
      );
      expect(row.tier, dir).toBe(gradeVerdict(all[dir]));
      expect(row.status, dir).toBe(all[dir].finalStatus);
    }
  });

  it("壊れた生年月日は isError で返し、例外にしない", async () => {
    const c = await connect();
    const r = await c.callTool({
      name: "get_honmei_star",
      arguments: { birthDate: "not-a-date" },
    });
    expect(r.isError).toBe(true);
  });

  it("search_municipality → area_directions がつながる", async () => {
    const c = await connect();
    const s = parse(
      await c.callTool({
        name: "search_municipality",
        arguments: { query: "長崎市" },
      }),
    );
    expect(s.results[0].code).toBe("42201");
    const a = parse(
      await c.callTool({
        name: "area_directions",
        arguments: { code: "42201" },
      }),
    );
    expect(a.directions).toHaveLength(8);
    /* 空の方位の 3 分類が画面と同じ */
    const direct = emptyDirections(findArea("42201")!);
    expect(
      a.emptyDirections.map((e: { direction: string }) => e.direction).sort(),
    ).toEqual(direct.map((e) => e.direction).sort());
    const west = a.emptyDirections.find(
      (e: { direction: string }) => e.direction === "W",
    );
    expect(west.kind).toBe("no_listings");
    expect(west.nearestUnlisted.map((u: { city: string }) => u.city)).toContain(
      "五島市",
    );
  });

  it("prefecture_summary はコードでも県名でも引ける", async () => {
    const c = await connect();
    const byCode = parse(
      await c.callTool({
        name: "prefecture_summary",
        arguments: { prefecture: "42" },
      }),
    );
    const byName = parse(
      await c.callTool({
        name: "prefecture_summary",
        arguments: { prefecture: "長崎県" },
      }),
    );
    expect(byCode.pref).toBe("長崎県");
    expect(byName.code).toBe("42");
    expect(byCode.byDirection).toHaveLength(byName.byDirection.length);
  });

  it("find_auspicious_days は 8 方位ぶん集計し、日数の上限を守る", async () => {
    const c = await connect();
    const out = parse(
      await c.callTool({
        name: "find_auspicious_days",
        arguments: {
          birthDate: "1957-09-22",
          lon: 135.5,
          from: "2026-09-01",
          days: 60,
          maxDaysPerDirection: 3,
        },
      }),
    );
    expect(out.directions).toHaveLength(8);
    for (const d of out.directions) {
      expect(d.bestDays.length).toBeLessThanOrEqual(3);
      expect(d.scannedDays).toBeGreaterThan(0);
    }
  });
});

describe("/api/mcp の入口", () => {
  it("GET は 405（stateless なので SSE の待受は無い）", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("POST で initialize → tools/list が HTTP 経由でも通る", async () => {
    const init = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "t", version: "0" },
          },
        }),
      }),
    );
    expect(init.status).toBe(200);
    const body = await init.json();
    expect(body.result.serverInfo.name).toBe("cloud-palette");

    const list = await POST(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    expect(list.status).toBe(200);
    expect((await list.json()).result.tools.length).toBe(6);
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { calculateTimeSlots } from "@/lib/timeSlots";
import { timeSlotsOutputSchema } from "@/lib/mcpTimeTools";
// DBをimportした時点で失敗させる。公開ツールの実行には不要。
vi.mock("@/lib/prisma", () => {
  throw new Error("Public MCP must not load DB");
});
vi.mock("@/utils/supabase/server", () => {
  throw new Error("Public MCP must not load login");
});
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
import { kanshiAt, kanshiForBirth } from "@/lib/kanshi";
import { emptyDirections, findArea } from "@/lib/areaContent";
import { computeDayKigaku } from "@/lib/dayKigakuClient";

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
  it("14 の道具を公開している", async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "area_directions",
      "find_auspicious_days",
      "get_article",
      "get_honmei_star",
      "get_kanshi",
      "get_rental",
      "judge_directions",
      "judge_hourly_directions",
      "judge_time_slots",
      "prefecture_summary",
      "rental_market_stats",
      "search_articles",
      "search_municipality",
      "search_rentals",
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
    expect(out.kanshi).toEqual(kanshiForBirth("1957-09-22").kanshi);
    expect(out.solarTerms).toHaveLength(24);
  });

  it("get_kanshi は空亡・各柱の併臨年・時刻不明の境界候補を返す", async () => {
    const c = await connect();
    const out = parse(
      await c.callTool({
        name: "get_kanshi",
        arguments: { birthDate: "2026-02-04" },
      }),
    );
    expect(out).toEqual(kanshiForBirth("2026-02-04"));
    expect(out.kanshiHeirin.year).toEqual([2026, 2086, 2146]);
    expect(out.boundaryAlternatives.before.year).toBe("乙巳");
    const error = await c.callTool({
      name: "get_kanshi",
      arguments: { birthDate: "2026-02-30" },
    });
    expect(error.isError).toBe(true);
    await c.close();
  });

  it("get_honmei_star の節入り当日にも前後の干支を追加する", async () => {
    const c = await connect();
    const out = parse(
      await c.callTool({
        name: "get_honmei_star",
        arguments: { birthDate: "2026-02-04" },
      }),
    );
    expect(out.boundaryAlternatives.before.year).toBe("乙巳");
    expect(out.boundaryAlternatives.after.year).toBe("丙午");
    expect(out.honmeiStar).toBe(
      getHonmeiStar(new Date("2026-02-04T12:00:00+09:00")).classical,
    );
    await c.close();
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

  /*
    利用者の報告（2026-10-05）「11/8 は MCP では吉2盤、サイトは吉1盤」。
    調べると、同じ人・同じ日・同じ経度なら両者は同じ関数で同じ答えになり、
    京都から東は 七赤なら吉1盤（11/9 なら吉2盤）、二黒・五黄なら吉2盤
    だった。食い違いは入力（生年月日か日付）の違いで、判定の分岐では
    ない。それを 9 星ぶん固定する（画面の computeDayKigaku と突き合わせ）。
  */
  it("京都から見た 2026-11-08 の東は、画面（computeDayKigaku）と 9 星すべてで一致する", async () => {
    const c = await connect();
    /* 立春基準の本命星 1〜9 になる生年（6 月生まれ。境目を避ける） */
    const births = [
      "1990-06-15", // 一白
      "1989-06-15", // 二黒
      "1988-06-15", // 三碧
      "1987-06-15", // 四緑
      "1986-06-15", // 五黄
      "1985-06-15", // 六白
      "1984-06-15", // 七赤
      "1983-06-15", // 八白
      "1982-06-15", // 九紫
    ];
    const seen = new Set<string>();
    for (const [i, birthDate] of births.entries()) {
      const page = computeDayKigaku({
        birthDate,
        targetDate: "2026-11-08",
        baseLat: "35.0116",
        baseLon: "135.7681",
        tenchusatsuMode: "strict",
        involuntaryMove: false,
        directionFilterMode: "composite",
        useClassical: true,
      })!;
      const out = parse(
        await c.callTool({
          name: "judge_directions",
          arguments: { birthDate, lon: 135.7681, date: "2026-11-08" },
        }),
      );
      expect(out.honmeiStar, birthDate).toBe(i + 1);
      const east = out.directions.find(
        (d: { direction: string }) => d.direction === "E",
      );
      expect(east.tier, `star ${i + 1}`).toBe(page.byDirection.E.tier);
      seen.add(east.tier);
    }
    /* 七赤は B、二黒・五黄は A。報告の 2 つの答えはどちらも実在する */
    expect(seen.has("A")).toBe(true);
    expect(seen.has("B")).toBe(true);
  });

  it("時刻つきで時差の指定が無い日付は、日本時間の日として読む", async () => {
    /*
      以前は "2026-11-08T20:00" を素の new Date に渡していて、本番（UTC）
      では日本時間の 11/9 05:00 になり判定する日が 1 日ずれた。七赤なら
      東が 11/8 は吉1盤、11/9 は吉2盤なので、ここでそのまま見える。
    */
    const c = await connect();
    const ask = async (date: string) =>
      parse(
        await c.callTool({
          name: "judge_directions",
          arguments: { birthDate: "1984-06-15", lon: 135.7681, date },
        }),
      );
    const plain = await ask("2026-11-08");
    const withTime = await ask("2026-11-08T20:00");
    expect(plain.date).toBe("2026-11-08");
    expect(withTime.date).toBe("2026-11-08");
    expect(withTime.directions).toEqual(plain.directions);
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

  it("近すぎて外れている方位を too_close として返す", async () => {
    /* 2026-09-04。kind は直したのに meaning の分岐を足し忘れ、
       too_close が far_only の文言（「150km より先には掲載のある市区
       町村がある」）で出ていた。**分岐を 1 つ足すたびに、同じ値で
       分岐している所を全部見る。**

       与那原町の南は南城市が 3.7km 先にある。5km 未満なので一覧から
       外れるが、行き止まりではない。 */
    const c = await connect();
    const a = parse(
      await c.callTool({
        name: "area_directions",
        arguments: { code: "47348" },
      }),
    );
    const south = a.emptyDirections.find(
      (e: { direction: string }) => e.direction === "S",
    );
    expect(south.kind).toBe("too_close");
    expect(south.meaning).toContain("行き止まりではない");
    expect(south.meaning).not.toContain("150km より先");
    expect(
      south.nearestTooClose.map((u: { city: string }) => u.city),
    ).toContain("南城市");
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

  it("find_auspicious_days の節気一覧は年越しと走査の最終日を含む", async () => {
    const c = await connect();
    const out = parse(
      await c.callTool({
        name: "find_auspicious_days",
        arguments: {
          birthDate: "1957-09-22",
          lon: 135.5,
          from: "2025-12-06",
          days: 30,
          maxDaysPerDirection: 1,
        },
      }),
    );
    expect(out.solarTerms.map((t: { name: string }) => t.name)).toEqual([
      "大雪",
      "冬至",
      "小寒",
    ]);
    await c.close();
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
    expect(out.solarTerms.map((t: { name: string }) => t.name)).toEqual([
      "白露",
      "秋分",
      "寒露",
      "霜降",
    ]);
    expect(out.calendarBasis).toContain("正午");
    expect(
      out.directions.some(
        (d: { bestDays: unknown[] }) => d.bestDays.length > 0,
      ),
    ).toBe(true);
    for (const d of out.directions) {
      expect(d.bestDays.length).toBeLessThanOrEqual(3);
      expect(d.scannedDays).toBeGreaterThan(0);
      for (const day of d.bestDays)
        expect(day.kanshi).toEqual(
          kanshiAt(new Date(`${day.date}T12:00:00+09:00`)),
        );
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
    expect((await list.json()).result.tools.length).toBe(14);
  });
});

describe("公開の刻ツール", () => {
  const args = {
    birthDate: "1990-06-15",
    lat: 35.18,
    lon: 136.91,
    date: "2026-10-11",
  };
  it("outputSchemaと注釈を公開しprofileを広告しない", async () => {
    const c = await connect();
    const tool = (await c.listTools()).tools.find(
      (t) => t.name === "judge_time_slots",
    )!;
    expect(tool.outputSchema?.properties).toHaveProperty("slots");
    expect(tool.inputSchema.properties).not.toHaveProperty("profile");
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
  it.each([false, true])(
    "盤表示 %s: textとstructuredContentと画面互換adapterが一致する",
    async (includeBoard) => {
      const c = await connect();
      const input = { ...args, includeBoard };
      const r = await c.callTool({
        name: "judge_time_slots",
        arguments: input,
      });
      expect(r.isError).not.toBe(true);
      expect(parse(r)).toEqual(r.structuredContent);
      expect(r.structuredContent).toEqual(calculateTimeSlots(input));
      expect(timeSlotsOutputSchema.safeParse(r.structuredContent).success).toBe(
        true,
      );
      expect(JSON.stringify(r.structuredContent)).not.toContain(args.birthDate);
    },
  );
  it.each([
    { ...args, profile: { id: "private" } },
    { profile: { name: "private" } },
    { ...args, userId: "private" },
    { ...args, date: "2026-02-30" },
    { ...args, settings: { unknown: true } },
    { ...args, settings: { useClassicalBoard: false } },
  ])("無効入力と個人selectorを実行時にも拒否する: %j", async (input) => {
    const c = await connect();
    expect(
      (await c.callTool({ name: "judge_time_slots", arguments: input }))
        .isError,
    ).toBe(true);
  });
  it("HTTP経由でも計算とselector拒否が通る", async () => {
    const call = async (input: Record<string, unknown>) => {
      const response = await POST(
        new Request("http://localhost/api/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "judge_time_slots", arguments: input },
          }),
        }),
      );
      expect(response.status).toBe(200);
      return (await response.json()).result;
    };
    const result = await call(args);
    expect(JSON.parse(result.content[0].text)).toEqual(
      result.structuredContent,
    );
    expect(result.structuredContent).toEqual(calculateTimeSlots(args));
    expect((await call({ ...args, profile: { id: "private" } })).isError).toBe(
      true,
    );
  });
});

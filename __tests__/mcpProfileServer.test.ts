// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, judgeMcpDirections } from "@/lib/mcpServer";
import { calculateTimeSlots } from "@/lib/timeSlots";
import { createProfileMcpServer } from "@/lib/mcpProfileServer";

const fixture = {
  id: "nagoya",
  name: "名古屋",
  birthDate: "1990-06-15",
  baseLon: 136.9066,
  baseLat: 35.1815,
  active: true,
  encryptedGeminiKey: "secret",
  baselineHrvMean: 123,
  birthLabel: "private-address",
};
const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(close.splice(0).map((f) => f()));
});
async function connect(load: () => Promise<unknown>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createProfileMcpServer(load);
  await server.connect(a);
  const client = new Client({ name: "profile-test", version: "0" });
  await client.connect(b);
  close.push(
    () => client.close(),
    () => server.close(),
  );
  return client;
}
const parse = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((r.content as { text: string }[])[0].text);

describe("本人のプロフィール用MCP", () => {
  it("一覧はID・名前・使用中だけ。名前は完全一致で絞る", async () => {
    const c = await connect(async () => [
      fixture,
      { ...fixture, id: "other", name: "名古屋2" },
    ]);
    const out = parse(
      await c.callTool({
        name: "list_profiles",
        arguments: { name: "名古屋" },
      }),
    );
    expect(out).toEqual({
      profiles: [{ id: "nagoya", name: "名古屋", active: true }],
    });
  });
  it("生年月日が未入力の保存済みプロフィールも一覧に残し、判定時だけエラーにする", async () => {
    const incomplete = {
      ...fixture,
      id: "incomplete",
      name: "あとで入力",
      birthDate: "",
      baseLon: 136.9066,
    };
    const c = await connect(async () => [incomplete, fixture]);
    expect(
      parse(await c.callTool({ name: "list_profiles", arguments: {} })),
    ).toEqual({
      profiles: [
        { id: "incomplete", name: "あとで入力", active: true },
        { id: "nagoya", name: "名古屋", active: true },
      ],
    });
    const judged = await c.callTool({
      name: "get_profile_daily",
      arguments: { profileId: "incomplete", date: "2026-10-11" },
    });
    expect(judged.isError).toBe(true);
    expect(JSON.stringify(judged)).not.toContain("private-address");
  });
  it("名古屋の保存値で既存の方位・時間計算と一致し、生データを返さない", async () => {
    const c = await connect(async () => [fixture]);
    const out = parse(
      await c.callTool({
        name: "get_profile_daily",
        arguments: { profileName: "名古屋", date: "2026-10-11" },
      }),
    );
    const input = {
      birthDate: fixture.birthDate,
      lon: fixture.baseLon,
      date: "2026-10-11",
    };
    const directions = judgeMcpDirections(input);

    expect("structuredContent" in directions && out.directions).toEqual(
      "structuredContent" in directions && directions.structuredContent,
    );
    // 刻は公開 judge_time_slots と同じ共通関数の結果そのもの。
    expect(out.timeSlots).toEqual(
      calculateTimeSlots({
        birthDate: fixture.birthDate,
        lat: fixture.baseLat,
        lon: fixture.baseLon,
        date: "2026-10-11",
      }),
    );
    expect(out).not.toHaveProperty("hours");
    for (const sensitive of [
      '"birthDate"',
      '"baseLat"',
      '"baseLon"',
      "35.1815",
      "136.9066",
      "encryptedGeminiKey",
      "baselineHrvMean",
      "private-address",
      "secret",
      "1990-06-15",
    ])
      expect(JSON.stringify(out)).not.toContain(sensitive);
  });
  it("日付省略はJSTの今日。保存済みtargetDateを使わない", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T16:00:00Z"));
    const c = await connect(async () => [
      { ...fixture, targetDate: "2030-01-01" },
    ]);
    const out = parse(
      await c.callTool({
        name: "get_profile_daily",
        arguments: { profileId: "nagoya" },
      }),
    );
    expect(out.directions.date).toBe("2026-10-11");
    expect(out.timeSlots.date).toBe("2026-10-11");
  });
  it("曖昧な名前・選択なし・他人のIDには推測で答えない", async () => {
    const c = await connect(async () => [
      fixture,
      { ...fixture, id: "second" },
    ]);
    for (const args of [
      {},
      { profileName: "名古屋" },
      { profileId: "someone-else" },
      { profileId: "nagoya", profileName: "名古屋" },
    ])
      expect(
        (await c.callTool({ name: "get_profile_daily", arguments: args }))
          .isError,
      ).toBe(true);
    expect(
      (
        await c.callTool({
          name: "get_profile_daily",
          arguments: { profileId: "nagoya" },
        })
      ).isError,
    ).not.toBe(true);
  });
  it("本人ごとに分離したloaderと空の保存を扱う", async () => {
    const a = await connect(async () => [fixture]);
    const b = await connect(async () => [{ ...fixture, id: "b", name: "B" }]);
    expect(
      (
        await b.callTool({
          name: "get_profile_daily",
          arguments: { profileId: "nagoya" },
        })
      ).isError,
    ).toBe(true);
    expect(
      parse(await a.callTool({ name: "list_profiles", arguments: {} }))
        .profiles[0].id,
    ).toBe("nagoya");
    const empty = await connect(async () => null);
    expect(
      parse(await empty.callTool({ name: "list_profiles", arguments: {} })),
    ).toEqual({ profiles: [] });
  });
  it("保存が壊れても秘密や例外文言を漏らさない", async () => {
    const c = await connect(async () => {
      throw new Error("secret-private-database");
    });
    for (const name of ["list_profiles", "get_profile_daily"]) {
      const out = await c.callTool({
        name,
        arguments: name === "list_profiles" ? {} : { profileId: "nagoya" },
      });
      expect(out.isError).toBe(true);
      expect(JSON.stringify(out)).not.toContain("secret-private-database");
    }
    const invalid = await connect(async () => [
      { ...fixture, id: "" },
      { ...fixture, name: "" },
    ]);
    expect(
      parse(await invalid.callTool({ name: "list_profiles", arguments: {} }))
        .profiles,
    ).toEqual([]);
  });
  it("匿名サーバーにプロフィール用の道具を登録しない", async () => {
    const server = createMcpServer();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "anonymous", version: "0" });
    await client.connect(b);
    close.push(
      () => client.close(),
      () => server.close(),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      "list_profiles",
    );
    expect(
      (
        await client.callTool({
          name: "get_profile_daily",
          arguments: { profileName: "名古屋" },
        })
      ).isError,
    ).toBe(true);
  });
});

// HTTP の入口から実際の SDK・tool handler まで通す。外部サービスだけ差し替える。
const httpMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  findUnique: vi.fn(),
}));
vi.mock("@/lib/mcpOAuth", () => ({
  PROFILE_RESOURCE_METADATA:
    "https://cloud-palette.com/.well-known/oauth-protected-resource/api/mcp/profile",
  verifyProfileToken: httpMocks.verifyToken,
}));
vi.mock("@/lib/prisma", () => ({
  default: { user_configs: { findUnique: httpMocks.findUnique } },
}));
import { POST } from "@/app/api/mcp/profile/route";

describe("プロフィール用MCPのHTTP統合", () => {
  const request = (
    name: string,
    args: Record<string, unknown>,
    token = "test-token",
  ) =>
    new Request("https://cloud-palette.com/api/mcp/profile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
  it("検証済み本人のIDでDBを絞り、実際のtool結果をno-storeで返す", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    httpMocks.verifyToken.mockResolvedValue({ status: "ok", userId: id });
    httpMocks.findUnique.mockResolvedValue({ presets: [fixture] });
    vi.stubEnv("MCP_PROFILE_ENABLED", "1");
    try {
      const response = await POST(
        request("get_profile_daily", {
          profileName: "名古屋",
          date: "2026-10-11",
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const body = await response.json();
      expect(body.result.structuredContent.profile.name).toBe("名古屋");
      expect(body.result.structuredContent.timeSlots.slots.length).toBe(12);
      expect(httpMocks.findUnique).toHaveBeenLastCalledWith({
        where: { user_id: id },
        select: { presets: true },
      });
      expect(JSON.stringify(body)).not.toContain("secret");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("DBの例外をHTTP toolエラーにして内部情報を漏らさない", async () => {
    httpMocks.verifyToken.mockResolvedValue({
      status: "ok",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    httpMocks.findUnique.mockRejectedValue(
      new Error("secret-connection-string"),
    );
    vi.stubEnv("MCP_PROFILE_ENABLED", "1");
    vi.stubEnv("MCP_PROFILE_ENABLED", "1");
    try {
      const response = await POST(request("list_profiles", {}));
      const body = await response.json();
      expect(body.result.isError).toBe(true);
      expect(JSON.stringify(body)).not.toContain("secret-connection-string");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

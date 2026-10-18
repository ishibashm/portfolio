import { beforeEach, expect, it, vi } from "vitest";
const { call, close, finish, gate } = vi.hoisted(() => ({
  call: vi.fn(),
  close: vi.fn(),
  finish: vi.fn(),
  gate: vi.fn(),
}));
vi.mock("@/lib/mcpChain", () => ({
  connectChainClient: async () => ({ call, close }),
}));
vi.mock("@/lib/agentEntitlement", () => ({
  canUseAgent: gate,
  agentSubject: () => "test-subject",
}));
import { POST } from "@/app/api/ask-guidance/route";
beforeEach(() => {
  vi.clearAllMocks();
  gate.mockReturnValue({ allowed: true, finish });
  close.mockResolvedValue(undefined);
  call.mockImplementation(async (tool: string) =>
    tool === "search_municipality"
      ? {
          results: [
            {
              code: "23106",
              name: "愛知県名古屋市中区",
              lat: 35.16,
              lon: 136.91,
            },
          ],
        }
      : { honmeiStar: 1 },
  );
});
const request = (body: unknown, origin = "https://cloud-palette.com") =>
  new Request("https://cloud-palette.com/api/ask-guidance", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
it("不足項目は固定定義、レスポンスもprivate/no-store", async () => {
  const response = await POST(request({ intent: "move", values: {} }));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await response.json()).fields).toEqual(["birthDate", "municipality"]);
  expect(call).not.toHaveBeenCalled();
  expect(gate).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it("市区町村候補はsearch_municipalityで取得し、AI停止とは無関係", async () => {
  const response = await POST(
    request({
      intent: "towns",
      values: { municipality: "名古屋" },
      action: "search",
    }),
  );
  expect((await response.json()).candidates).toEqual([
    { code: "23106", name: "愛知県名古屋市中区" },
  ]);
  expect(call).toHaveBeenCalledWith(
    "search_municipality",
    { query: "名古屋", limit: 10 },
    expect.any(AbortSignal),
    8000,
  );
});
it("生年月日はPOSTで計算するだけでURL・ログに残さない", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const response = await POST(
    request({ intent: "star", values: { birthDate: "1990-05-05" } }),
  );
  const card = await response.json();
  expect(card.links).toHaveLength(1);
  expect(gate).toHaveBeenCalledWith(
    expect.objectContaining({ mode: "deterministic" }),
  );
  expect(card.links[0].href).toMatch(/^\/houi\/\d{4}\/1$/);
  expect(card.links[0].href).not.toContain("1990");
  expect(info).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  info.mockRestore();
  warn.mockRestore();
});
it("他サイト・不正日付・任意リンク・大きな入力を拒否", async () => {
  expect(
    (await POST(request({ intent: "star", values: {} }, "https://evil.test")))
      .status,
  ).toBe(403);
  expect(
    (
      await POST(
        request({ intent: "star", values: { birthDate: "2026-02-30" } }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          intent: "star",
          values: {},
          links: [{ href: "https://evil.test" }],
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          intent: "towns",
          values: { municipality: "a".repeat(5000) },
        }),
      )
    ).status,
  ).toBe(413);
});
it("道具が失敗しても入力をエラーに含めずロックを解放", async () => {
  call.mockRejectedValue(new Error("1990-05-05"));
  const response = await POST(
    request({ intent: "star", values: { birthDate: "1990-05-05" } }),
  );
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("1990-05-05");
  expect(finish).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it("候補検索と不足項目確認は計算枠を消費せず、最後の計算だけ1回予約する", async () => {
  const values = {
    birthDate: "1990-05-05",
    municipality: "愛知県名古屋市中区",
  };
  expect(
    (await POST(request({ intent: "move", values, action: "search" }))).status,
  ).toBe(200);
  expect((await POST(request({ intent: "move", values }))).status).toBe(200);
  expect(gate).not.toHaveBeenCalled();
  expect(
    (
      await POST(
        request({
          intent: "move",
          values: { ...values, date: "2026-11-05", direction: "E" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(gate).toHaveBeenCalledOnce();
  expect(finish).toHaveBeenCalledOnce();
});
it("検索actionで計算用の制限を迂回できない", async () => {
  const response = await POST(
    request({
      intent: "star",
      values: { birthDate: "1990-05-05" },
      action: "search",
    }),
  );
  expect(response.status).toBe(400);
  expect(call).not.toHaveBeenCalled();
});

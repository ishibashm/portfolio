import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 分析をアカウントに残す API（/api/saved-analyses）。
 *
 * 利用者の判断（2026-09-26）「DB で保存してもいいかな。保存する方向で
 * 進めていいよ」。入るのは生年月日から出た結果なので、/api/spots と
 * 同じ守りを固定する。DB は叩かない（prisma と認証を差し替える）。
 */

const findMany = vi.fn();
const count = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    savedAnalysis: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
      create: (...a: unknown[]) => create(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

const authUser = vi.fn();
vi.mock("@/lib/userConfig", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/userConfig")>(
      "@/lib/userConfig",
    );
  return { ...actual, getAuthUser: () => authUser() };
});

const ME = "11111111-2222-3333-4444-555555555555";
const MD = "# 引越し時期の全期間分析（Cloud Palette）\n\n| 南東 | S 三盤吉 |";

function req(
  method: "GET" | "POST" | "DELETE",
  { origin = "https://cloud-palette.com", body = {}, url = "" } = {},
) {
  return {
    method,
    url: `https://cloud-palette.com/api/saved-analyses${url}`,
    headers: new Headers(origin ? { origin } : {}),
    nextUrl: { host: "cloud-palette.com" },
    json: async () => body,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  authUser.mockResolvedValue({ id: ME, email: "me@example.com" });
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
  create.mockResolvedValue({
    id: "new-id",
    kind: "timing",
    name: "9 月の分析",
    markdown: MD,
    created_at: new Date("2026-09-26T00:00:00Z"),
  });
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("/api/saved-analyses", () => {
  it("ログインしていなければ読むことも書くこともできない", async () => {
    authUser.mockResolvedValue(null);
    const { GET, POST, DELETE } =
      await import("@/app/api/saved-analyses/route");
    expect((await GET(req("GET"))).status).toBe(401);
    expect(
      (
        await POST(
          req("POST", { body: { kind: "timing", name: "a", markdown: MD } }),
        )
      ).status,
    ).toBe(401);
    expect((await DELETE(req("DELETE", { url: "?id=x" }))).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("開発バイパスの偽 id では書かせない", async () => {
    authUser.mockResolvedValue({ id: "dev-bypass-id", email: "d@example.com" });
    const { POST } = await import("@/app/api/saved-analyses/route");
    const res = await POST(
      req("POST", { body: { kind: "timing", name: "a", markdown: MD } }),
    );
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("別のサイトからの書き込みを受け付けない", async () => {
    const { POST, DELETE } = await import("@/app/api/saved-analyses/route");
    const body = { kind: "timing", name: "a", markdown: MD };
    expect(
      (await POST(req("POST", { origin: "https://evil.example", body })))
        .status,
    ).toBe(403);
    expect(
      (
        await DELETE(
          req("DELETE", { origin: "https://evil.example", url: "?id=x" }),
        )
      ).status,
    ).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("読むのは本人の行だけ。kind で絞れて、user_id は返さない", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        kind: "calendar",
        name: "吉日",
        markdown: MD,
        created_at: new Date("2026-09-26T01:00:00Z"),
      },
    ]);
    const { GET } = await import("@/app/api/saved-analyses/route");
    const res = await GET(req("GET", { url: "?kind=calendar" }));
    const body = await res.json();
    expect(findMany.mock.calls[0][0].where).toEqual({
      user_id: ME,
      kind: "calendar",
    });
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty("user_id");
    expect(body.analyses[0]).toEqual({
      id: "a1",
      kind: "calendar",
      name: "吉日",
      markdown: MD,
      savedAt: "2026-09-26T01:00:00.000Z",
    });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("保存は本人の id で作る。名前の空白は詰め、制御文字は落とす", async () => {
    const { POST } = await import("@/app/api/saved-analyses/route");
    const res = await POST(
      req("POST", {
        body: {
          kind: "timing",
          name: "  9 月\u0007  の分析 ",
          markdown: MD,
          user_id: "someone-else",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data).toEqual({
      user_id: ME,
      kind: "timing",
      name: "9 月 の分析",
      markdown: MD,
    });
  });

  it("知らない kind・空の本文・長すぎる本文は断る", async () => {
    const { POST } = await import("@/app/api/saved-analyses/route");
    for (const body of [
      { kind: "other", name: "a", markdown: MD },
      { kind: "timing", name: "a", markdown: "" },
      { kind: "timing", name: "a", markdown: "x".repeat(32769) },
      { kind: "timing", name: "", markdown: MD },
    ]) {
      expect((await POST(req("POST", { body }))).status).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("50 件を超えては残せない", async () => {
    count.mockResolvedValue(50);
    const { POST } = await import("@/app/api/saved-analyses/route");
    const res = await POST(
      req("POST", { body: { kind: "timing", name: "a", markdown: MD } }),
    );
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("削除は id と本人の user_id の両方で指す（他人の行は消えない）", async () => {
    const { DELETE } = await import("@/app/api/saved-analyses/route");
    await DELETE(req("DELETE", { url: "?id=someone-elses-id" }));
    expect(deleteMany.mock.calls[0][0].where).toEqual({
      id: "someone-elses-id",
      user_id: ME,
    });
  });
});

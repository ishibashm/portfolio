import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/relocation/history と /api/relocation/export の認証。
 *
 * middleware は "/relocation/history"（ページ）しか守らない。前方一致なので
 * "/api/relocation/history" はどの保護対象にも当たらず、本番で匿名の GET に
 * 200 を返していた。返っていたのは住所・引越しの理由・生年月日・拠点座標。
 * DELETE も素通りで、id を渡すだけで記録を消せた。
 *
 * ここで守るのは「ページと API の保護範囲が食い違わないこと」。
 */

const { getUser, findMany, deleteFn, createFn, readFile } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findMany: vi.fn(),
  deleteFn: vi.fn(),
  createFn: vi.fn(),
  readFile: vi.fn(),
}));

// 生年月日は設定ファイルから来る。route 側に既定値を置かなくなったので、
// 「本人なら通る」を通すにはここで渡す必要がある。認証の話なので、
// 日付そのものは何でもよい。
vi.mock("fs/promises", () => ({ default: { readFile } }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    relocationHistory: {
      findMany,
      delete: deleteFn,
      create: createFn,
    },
    telemetryLog: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { GET, POST, DELETE } from "@/app/api/relocation/history/route";
import { GET as EXPORT_GET } from "@/app/api/relocation/export/route";

const owner = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "owner@example.com",
};
const stranger = {
  id: "99999999-8888-4777-8666-555555555555",
  email: "stranger@example.com",
};

const req = (url: string) => new Request(url);

describe("引越し履歴 API の認証", () => {
  const originalAdmin = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = owner.email;
    findMany.mockResolvedValue([]);
    readFile.mockResolvedValue(
      JSON.stringify({ birth_date: "1990-01-01T12:00" }),
    );
    deleteFn.mockResolvedValue({ id: "x" });
    createFn.mockResolvedValue({ id: "x" });
  });

  afterEach(() => {
    if (originalAdmin === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdmin;
  });

  function anonymous() {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("missing session"),
    });
  }

  it("匿名の GET は 401。DB にも触らない", async () => {
    anonymous();
    const res = await GET(req("https://example.com/api/relocation/history"));
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("匿名の DELETE は 401。id を渡しても消えない", async () => {
    anonymous();
    const res = await DELETE(
      req("https://example.com/api/relocation/history?id=abc"),
    );
    expect(res.status).toBe(401);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("匿名の POST は 401。記録も作られない", async () => {
    anonymous();
    const res = await POST(
      new Request("https://example.com/api/relocation/history", {
        method: "POST",
        body: JSON.stringify({
          departureDate: "2026-01-01",
          fromName: "A",
          fromLat: 35,
          fromLon: 139,
          toName: "B",
          toLat: 34,
          toLon: 135,
        }),
      }),
    );
    expect(res.status).toBe(401);
    expect(createFn).not.toHaveBeenCalled();
  });

  it("匿名の export は 401。生年月日も座標も出さない", async () => {
    anonymous();
    const res = await EXPORT_GET(
      req("https://example.com/api/relocation/export"),
    );
    expect(res.status).toBe(401);
  });

  it("ログインしていても ADMIN_EMAIL と違えば 403", async () => {
    getUser.mockResolvedValue({ data: { user: stranger }, error: null });
    const res = await GET(req("https://example.com/api/relocation/history"));
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("本人なら通る", async () => {
    getUser.mockResolvedValue({ data: { user: owner }, error: null });
    const res = await GET(req("https://example.com/api/relocation/history"));
    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalled();
  });
});

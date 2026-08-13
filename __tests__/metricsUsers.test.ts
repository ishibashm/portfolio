import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/metrics/users（管理者専用のユーザー一覧）。
 *
 * 目的は「登録ユーザーは自分だけか、他人が居るか」の確認。守るのは 3 つ。
 *   1. 口は管理者に限る（匿名 401 / 他人 403。DB には触らない）
 *   2. **設定の生値（生年月日・座標・API キー）を応答に載せない。**
 *      有無のフラグに落とす。管理者専用でも、他人の生年月日を画面に
 *      出す理由は無い
 *   3. 行動データはキー体系の突合を間違えない（favorites は Supabase の
 *      user_id、履歴・プランは NextAuth の User.id → email 経由）
 */

const {
  getUser,
  configFindMany,
  favGroupBy,
  userFindMany,
  histGroupBy,
  simGroupBy,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  configFindMany: vi.fn(),
  favGroupBy: vi.fn(),
  userFindMany: vi.fn(),
  histGroupBy: vi.fn(),
  simGroupBy: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user_configs: { findMany: configFindMany },
    favoriteProperty: { groupBy: favGroupBy },
    user: { findMany: userFindMany },
    relocationHistory: { groupBy: histGroupBy },
    relocationSimulation: { groupBy: simGroupBy },
  },
}));

import { GET } from "@/app/api/metrics/users/route";

const admin = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "owner@example.com",
};

describe("metrics users", () => {
  const originalAdmin = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = admin.email;
  });

  afterEach(() => {
    if (originalAdmin === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdmin;
  });

  it("匿名は 401。DB にも触らない", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(configFindMany).not.toHaveBeenCalled();
  });

  it("管理者でなければ 403。DB にも触らない", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "x", email: "stranger@example.com" } },
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(configFindMany).not.toHaveBeenCalled();
  });

  it("生値はフラグに落ち、応答のどこにも現れない", async () => {
    getUser.mockResolvedValue({ data: { user: admin }, error: null });

    configFindMany.mockResolvedValue([
      {
        user_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        user_email: "owner@example.com",
        created_at: new Date("2026-08-13T00:00:00Z"),
        updated_at: new Date("2026-08-13T10:00:00Z"),
        birth_date: "1990-01-01T12:00",
        birth_lat: 34.1234,
        base_lat: 35.5678,
        presets: [{ name: "a" }, { name: "b" }],
        encrypted_gemini_key: "encrypted-secret-value",
      },
      {
        user_id: null,
        user_email: "someone@example.com",
        created_at: null,
        updated_at: new Date("2026-08-01T00:00:00Z"),
        birth_date: null,
        birth_lat: null,
        base_lat: null,
        presets: null,
        encrypted_gemini_key: null,
      },
    ]);
    favGroupBy.mockResolvedValue([
      {
        user_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        _count: { _all: 3 },
      },
    ]);
    userFindMany.mockResolvedValue([
      { id: "nextauth-1", email: "Owner@example.com" },
    ]);
    histGroupBy.mockResolvedValue([
      { userId: "nextauth-1", _count: { _all: 4 } },
      // userId が消えた（SetNull）行は誰にも足さない
      { userId: null, _count: { _all: 9 } },
    ]);
    simGroupBy.mockResolvedValue([
      { userId: "nextauth-1", _count: { _all: 2 } },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const [u1, u2] = json.data.users;
    expect(u1).toMatchObject({
      email: "owner@example.com",
      has: {
        birthDate: true,
        birthPlace: true,
        baseLocation: true,
        geminiKey: true,
      },
      presetCount: 2,
      favorites: 3,
      histories: 4,
      simulations: 2,
    });
    expect(u2).toMatchObject({
      email: "someone@example.com",
      createdAt: null,
      has: {
        birthDate: false,
        birthPlace: false,
        baseLocation: false,
        geminiKey: false,
      },
      presetCount: 0,
      favorites: 0,
      histories: 0,
      simulations: 0,
    });

    // 応答の全文に生値が現れないこと。フィールド名の選び方に
    // 依存しないよう、値そのもので見る。
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("1990-01-01");
    expect(raw).not.toContain("34.1234");
    expect(raw).not.toContain("35.5678");
    expect(raw).not.toContain("encrypted-secret-value");
  });
});

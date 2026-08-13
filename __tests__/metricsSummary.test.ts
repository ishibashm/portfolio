import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/metrics/summary（管理者専用の集計）。
 *
 * 守るのは 3 つ。
 *   1. 口は管理者に限る（匿名 401 / 他人 403。DB には触らない）
 *   2. COUNT の bigint を Number に落としてから応答に載せる
 *      （落とすと JSON.stringify が TypeError で 500 になる）
 *   3. device の NULL（列を足す前の行）は "unknown" として返す
 */

const { getUser, queryRaw, userConfigCount, favCount, histCount, simCount } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    queryRaw: vi.fn(),
    userConfigCount: vi.fn(),
    favCount: vi.fn(),
    histCount: vi.fn(),
    simCount: vi.fn(),
  }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRaw: queryRaw,
    user_configs: { count: userConfigCount },
    favoriteProperty: { count: favCount },
    relocationHistory: { count: histCount },
    relocationSimulation: { count: simCount },
  },
}));

import { GET } from "@/app/api/metrics/summary/route";

const admin = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "owner@example.com",
};

describe("metrics summary の認可", () => {
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
    expect(queryRaw).not.toHaveBeenCalled();
    expect(userConfigCount).not.toHaveBeenCalled();
  });

  it("管理者でなければ 403。DB にも触らない", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "x", email: "stranger@example.com" } },
      error: null,
    });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("管理者なら集計を返す。bigint は Number、device の NULL は unknown", async () => {
    getUser.mockResolvedValue({ data: { user: admin }, error: null });

    // Promise.all の並び順に mock を積む:
    // daily → topPaths → topReferrers → devices → hourly → prev30 → latest
    queryRaw
      .mockResolvedValueOnce([
        { day: "2026-08-13", pv: BigInt(3), uv: BigInt(2) },
      ])
      .mockResolvedValueOnce([{ path: "/houi", pv: BigInt(3), uv: BigInt(2) }])
      .mockResolvedValueOnce([{ referrer_host: "t.co", pv: BigInt(1) }])
      .mockResolvedValueOnce([
        { device: "mobile", pv: BigInt(2), uv: BigInt(1) },
        { device: null, pv: BigInt(1), uv: BigInt(1) },
      ])
      .mockResolvedValueOnce([{ hour: 21, pv: BigInt(3) }])
      .mockResolvedValueOnce([{ n: BigInt(5) }])
      .mockResolvedValueOnce([{ latest: new Date("2026-08-13T12:00:00Z") }]);
    // user_configs.count の呼び順:
    // 総数 → 保存7日 → 保存30日 → 新規今日 → 新規7日 → 新規30日 → 記録開始前
    userConfigCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7);
    favCount.mockResolvedValue(6);
    histCount.mockResolvedValue(4);
    simCount.mockResolvedValue(2);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const d = json.data;
    // bigint が Number になっている（なっていなければそもそも
    // JSON 化で落ちるが、値も確かめる）
    expect(d.daily[0]).toEqual({ day: "2026-08-13", pv: 3, uv: 2 });
    expect(d.pvPrev30).toBe(5);
    expect(d.hourly[0]).toEqual({ hour: 21, pv: 3 });

    // NULL device は unknown
    expect(d.devices).toEqual([
      { device: "mobile", pv: 2, uv: 1 },
      { device: "unknown", pv: 1, uv: 1 },
    ]);

    expect(d.registeredUsers).toBe(10);
    expect(d.newUsers.beforeTracking).toBe(7);
    expect(d.usage).toEqual({ favorites: 6, histories: 4, simulations: 2 });
    expect(d.latestViewAt).toBe("2026-08-13T12:00:00.000Z");
  });
});

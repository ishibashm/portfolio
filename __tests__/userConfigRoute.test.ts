import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, findFirst, update, create } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  default: { user_configs: { findFirst, update, create } },
}));

import { GET, POST } from "@/app/api/user-config/route";

const user = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "someone@example.com",
};

function post(body: unknown) {
  return new Request("http://localhost/api/user-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/user-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user }, error: null });
  });

  it("rejects anonymous access", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET()).status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  /**
   * 以前は送られなかった列を軒並み null で書いていた。物件検索から出発地だけ
   * 保存すると生年月日が消える経路になっており、実際に DB の baseline_* が
   * すべて null になっていた。
   */
  it("does not wipe fields that were not sent", async () => {
    findFirst.mockResolvedValue({
      id: "row-1",
      user_id: user.id,
      personal_cloud_opt_in: true,
    });
    update.mockResolvedValue({});

    const res = await POST(post({ base_lat: 35.1, base_lon: 136.9 }));

    expect(res.status).toBe(200);
    const data = update.mock.calls[0][0].data;
    expect(data.base_lat).toBe(35.1);
    expect(data).not.toHaveProperty("birth_date");
    expect(data).not.toHaveProperty("baseline_hrv_mean");
  });

  it("clears a field only when it is explicitly sent as empty", async () => {
    findFirst.mockResolvedValue({
      id: "row-1",
      user_id: user.id,
      personal_cloud_opt_in: true,
    });
    update.mockResolvedValue({});

    await POST(post({ birth_date: "" }));

    expect(update.mock.calls[0][0].data.birth_date).toBeNull();
  });

  it("ignores values that are not numbers", async () => {
    findFirst.mockResolvedValue({
      id: "row-1",
      user_id: user.id,
      personal_cloud_opt_in: true,
    });
    update.mockResolvedValue({});

    // 座標が片方だけ入力された途中の状態で "NaN" が飛んできたことがある。
    await POST(post({ base_lat: "NaN", base_lon: 136.9 }));

    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("base_lat");
    expect(data.base_lon).toBe(136.9);
  });

  it("creates a row for a user who has none, without needing to be the admin", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});

    const res = await POST(
      post({ base_lat: 35.1, personal_cloud_opt_in: true }),
    );

    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data).toMatchObject({
      user_id: user.id,
      user_email: user.email,
      base_lat: 35.1,
    });
    // 行の作成＝はじめての保存。管理ページが「新規登録」として数えるので、
    // create のときだけ created_at を入れる（update では触らない）。
    expect(create.mock.calls[0][0].data.created_at).toBeInstanceOf(Date);
  });

  it("既存行の更新では created_at を書き換えない", async () => {
    findFirst.mockResolvedValue({ id: "cfg-1" });
    update.mockResolvedValue({});

    const res = await POST(
      post({ base_lat: 35.1, personal_cloud_opt_in: true }),
    );

    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data).not.toHaveProperty("created_at");
  });
});

describe("個人情報のサーバー保存", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user }, error: null });
    update.mockResolvedValue({});
    create.mockResolvedValue({});
  });
  it.each([
    null,
    { id: "owned", user_id: user.id, personal_cloud_opt_in: false },
  ])("既定では無視した全項目を応答する: %j", async (row) => {
    findFirst.mockResolvedValue(row);
    const response = await POST(
      post({
        birth_date: "1990-04-01",
        birth_time: "12:00",
        birth_lat: 35.68,
        birth_lon: 139.76,
        base_lat: 35.68,
        base_lon: 139.76,
        presets: [],
        baseline_hrv_mean: 38,
        hrv: 40,
        gsr: 4,
      }),
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.ignored_personal_fields).toEqual(
      expect.arrayContaining([
        "birth_date",
        "birth_time",
        "birth_lat",
        "birth_lon",
        "base_lat",
        "base_lon",
        "presets",
        "baseline_hrv_mean",
        "hrv",
        "gsr",
      ]),
    );
    const data = (row ? update : create).mock.calls[0][0].data;
    for (const key of result.ignored_personal_fields)
      expect(data).not.toHaveProperty(key);
  });
  it("同じリクエストの明示的な同意で新規行も保存できる", async () => {
    findFirst.mockResolvedValue(null);
    expect(
      (
        await POST(
          post({ personal_cloud_opt_in: true, birth_date: "1990-04-01" }),
        )
      ).status,
    ).toBe(200);
    expect(create.mock.calls[0][0].data).toMatchObject({
      personal_cloud_opt_in: true,
      birth_date: "1990-04-01",
    });
  });
  it("同意撤回は過去の値を消さず、新規値を止める", async () => {
    findFirst.mockResolvedValue({
      id: "owned",
      user_id: user.id,
      personal_cloud_opt_in: true,
      birth_date: "1990-04-01",
    });
    await POST(
      post({ personal_cloud_opt_in: false, birth_date: "", base_lat: null }),
    );
    expect(update.mock.calls[0][0].data).toMatchObject({
      personal_cloud_opt_in: false,
    });
    expect(update.mock.calls[0][0].data).not.toHaveProperty("birth_date");
    expect(update.mock.calls[0][0].data).not.toHaveProperty("base_lat");
  });
  it("同意なしでも所有者には過去の値と基準値を返す", async () => {
    findFirst.mockResolvedValue({
      id: "owned",
      user_id: user.id,
      personal_cloud_opt_in: false,
      birth_date: "1990-04-01",
      baseline_hrv_mean: 38,
    });
    expect(await (await GET()).json()).toMatchObject({
      personal_cloud_opt_in: false,
      birth_date: "1990-04-01",
      baseline_hrv_mean: 38,
    });
  });
});

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
    findFirst.mockResolvedValue({ id: "row-1", user_id: user.id });
    update.mockResolvedValue({});

    const res = await POST(post({ base_lat: 35.1, base_lon: 136.9 }));

    expect(res.status).toBe(200);
    const data = update.mock.calls[0][0].data;
    expect(data.base_lat).toBe(35.1);
    expect(data).not.toHaveProperty("birth_date");
    expect(data).not.toHaveProperty("baseline_hrv_mean");
  });

  it("clears a field only when it is explicitly sent as empty", async () => {
    findFirst.mockResolvedValue({ id: "row-1", user_id: user.id });
    update.mockResolvedValue({});

    await POST(post({ birth_date: "" }));

    expect(update.mock.calls[0][0].data.birth_date).toBeNull();
  });

  it("ignores values that are not numbers", async () => {
    findFirst.mockResolvedValue({ id: "row-1", user_id: user.id });
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

    const res = await POST(post({ base_lat: 35.1 }));

    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data).toMatchObject({
      user_id: user.id,
      user_email: user.email,
      base_lat: 35.1,
    });
  });
});

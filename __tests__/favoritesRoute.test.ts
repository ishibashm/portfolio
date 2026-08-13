import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * お気に入りの出し入れ。
 *
 * 気にしているのは 3 つ。
 *
 * 1. **他人のお気に入りに触れない。**問い合わせに必ず本人の user_id が入る
 * 2. **開発バイパスの偽 id で書かない。**user_id は uuid 列で、UUID でない
 *    id を渡すと問い合わせごと落ちる（profile-presets が同じ理由で
 *    toUserId を通している）
 * 3. **二度押しても増えない。**(user_id, property_id) の一意に任せるので、
 *    追加は create ではなく upsert であること
 */

const { getUser, findMany, upsert, deleteMany } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  default: { favoriteProperty: { findMany, upsert, deleteMany } },
}));

import { DELETE, GET, POST } from "@/app/api/favorites/route";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const authed = { id: USER_ID, email: "owner@example.com" };

/** 開発バイパスは uuid でない id を入れる。本物の行を潰させない。 */
const devBypass = { id: "dev-bypass-id", email: "owner@example.com" };

function login(user: { id: string; email: string } | null) {
  getUser.mockResolvedValue({ data: { user }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("お気に入り API", () => {
  it("未ログインなら 401。DB を触らない", async () => {
    login(null);

    for (const res of [
      await GET(),
      await POST(
        new Request("http://x/api/favorites", {
          method: "POST",
          body: JSON.stringify({ propertyId: "p1" }),
        }),
      ),
      await DELETE(new Request("http://x/api/favorites?propertyId=p1")),
    ]) {
      expect(res.status).toBe(401);
    }

    expect(findMany).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("開発バイパスの偽 id では書かない", async () => {
    // uuid 列に "dev-bypass-id" を渡すと問い合わせ自体が落ちる。
    login(devBypass);

    const res = await POST(
      new Request("http://x/api/favorites", {
        method: "POST",
        body: JSON.stringify({ propertyId: "p1" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("一覧は本人のぶんだけを、新しい順で引く", async () => {
    login(authed);
    findMany.mockResolvedValue([
      { property_id: "new" },
      { property_id: "old" },
    ]);

    const res = await GET();

    expect(await res.json()).toEqual({ propertyIds: ["new", "old"] });
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ user_id: USER_ID });
    expect(args.orderBy).toEqual({ created_at: "desc" });
  });

  it("追加は upsert。二度押しても行が増えない", async () => {
    login(authed);

    const res = await POST(
      new Request("http://x/api/favorites", {
        method: "POST",
        body: JSON.stringify({ propertyId: "p1" }),
      }),
    );

    expect(res.status).toBe(200);
    const args = upsert.mock.calls[0][0];
    expect(args.where.user_id_property_id).toEqual({
      user_id: USER_ID,
      property_id: "p1",
    });
    expect(args.create).toEqual({ user_id: USER_ID, property_id: "p1" });
    // 既に入っているときに何かを書き換えないこと（created_at を保つ）。
    expect(args.update).toEqual({});
  });

  it("物件が指定されていなければ 400。DB を触らない", async () => {
    login(authed);

    const bad = await POST(
      new Request("http://x/api/favorites", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(bad.status).toBe(400);

    const noParam = await DELETE(new Request("http://x/api/favorites"));
    expect(noParam.status).toBe(400);

    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("外すときも本人の行だけを対象にする", async () => {
    login(authed);

    const res = await DELETE(
      new Request("http://x/api/favorites?propertyId=p1"),
    );

    expect(res.status).toBe(200);
    expect(deleteMany.mock.calls[0][0].where).toEqual({
      user_id: USER_ID,
      property_id: "p1",
    });
  });

  it("入っていないものを外しても失敗にしない", async () => {
    // 画面側の状態とずれていたとき、押しても消えないほうが分かりにくい。
    login(authed);
    deleteMany.mockResolvedValue({ count: 0 });

    const res = await DELETE(
      new Request("http://x/api/favorites?propertyId=missing"),
    );

    expect(res.status).toBe(200);
  });

  it("失敗したときの文言は日本語（画面の帯に出る）", async () => {
    login(authed);
    findMany.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(503);
    // 生の英語をそのまま出さない。CLAUDE.md 4 節の表のとおり。
    expect(body.error).not.toContain("connection refused");
    expect(body.error).toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ default: { user_configs: db } }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: db.getUser } }),
}));
import { findUserConfig, getAuthUser, toUserId } from "@/lib/userConfig";

const user = {
  id: "11111111-2222-4333-8444-555555555555",
  email: "owner@example.com",
  emailVerified: true,
};
const otherId = "99999999-2222-4333-8444-555555555555";
type Row = {
  id: string;
  user_id: string | null;
  user_email: string;
  presets?: string[];
};
let rows: Row[];
// クエリを解釈する小さなストア。旧OR検索に戻すと別人のJSONを返して落ちる。
type Where = Partial<Row> & { OR?: Where[] };
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) =>
    key === "OR"
      ? (value as Where[]).some((part) => matches(row, part))
      : row[key as keyof Row] === value,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  rows = [];
  db.findFirst.mockImplementation(
    async ({ where, select }: { where: Where; select?: { id: boolean } }) => {
      const row = rows.find((row) => matches(row, where));
      return row ? (select ? { id: row.id } : { ...row }) : null;
    },
  );
  db.updateMany.mockImplementation(
    async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const selected = rows.filter((row) => matches(row, where));
      selected.forEach((row) => Object.assign(row, data));
      return { count: selected.length };
    },
  );
});

describe("設定の所有者境界", () => {
  it("メール一致の他人行より本人IDを優先しメール変更でも所有者を書き換えない", async () => {
    rows = [
      {
        id: "other",
        user_id: otherId,
        user_email: user.email,
        presets: ["other-secret"],
      },
      {
        id: "mine",
        user_id: user.id,
        user_email: "previous@example.com",
        presets: ["mine"],
      },
    ];
    expect((await findUserConfig(user))?.id).toBe("mine");
    expect(db.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { user_id: user.id },
    });
    expect(db.updateMany).not.toHaveBeenCalled();
  });
  it("メールが一致しても別IDの非NULL行を取得・再所有しない", async () => {
    rows = [
      {
        id: "other",
        user_id: otherId,
        user_email: user.email,
        presets: ["other-secret"],
      },
    ];
    expect(await findUserConfig(user)).toBeNull();
    expect(rows[0].user_id).toBe(otherId);
    expect(db.updateMany).not.toHaveBeenCalled();
  });
  it("確認済みメールでNULL行だけを条件付き連携し本人IDで読み直す", async () => {
    rows = [
      {
        id: "legacy",
        user_id: null,
        user_email: user.email,
        presets: ["saved"],
      },
    ];
    expect(
      (await findUserConfig({ ...user, email: "OWNER@example.com" }))?.presets,
    ).toEqual(["saved"]);
    expect(db.findFirst.mock.calls[1][0]).toEqual({
      where: { user_id: null, user_email: user.email },
      select: { id: true },
    });
    expect(db.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "legacy", user_id: null, user_email: user.email },
      data: { user_id: user.id },
    });
    expect(db.findFirst.mock.calls[2][0]).toEqual({
      where: { id: "legacy", user_id: user.id },
    });
  });
  it.each([false, undefined])(
    "メール未確認 %s ならNULL行を探索しない",
    async (emailVerified) => {
      rows = [{ id: "legacy", user_id: null, user_email: user.email }];
      expect(await findUserConfig({ ...user, emailVerified })).toBeNull();
      expect(db.findFirst).toHaveBeenCalledTimes(1);
      expect(db.updateMany).not.toHaveBeenCalled();
    },
  );
  it("メール未確認でも本人IDで連携済みなら読める", async () => {
    rows = [{ id: "mine", user_id: user.id, user_email: user.email }];
    expect((await findUserConfig({ ...user, emailVerified: false }))?.id).toBe(
      "mine",
    );
  });
  it.each(["dev-bypass-id", "", "not-uuid"])(
    "偽ID %s ではDBに触れない",
    async (id) => {
      expect(await findUserConfig({ ...user, id })).toBeNull();
      expect(toUserId({ ...user, id })).toBeNull();
      expect(db.findFirst).not.toHaveBeenCalled();
      expect(db.updateMany).not.toHaveBeenCalled();
    },
  );
  it("読取後の別所有者による連携を上書きしない", async () => {
    rows = [{ id: "legacy", user_id: null, user_email: user.email }];
    const atomicUpdate = db.updateMany.getMockImplementation()!;
    db.updateMany.mockImplementationOnce(async (args) => {
      rows[0].user_id = otherId;
      return atomicUpdate(args);
    });
    await expect(findUserConfig(user)).rejects.toThrow("PROFILE_LINK_CONFLICT");
    expect(rows[0].user_id).toBe(otherId);
  });
  it("同じ本人の別行が同時に作られたunique競合を無視しない", async () => {
    rows = [{ id: "legacy", user_id: null, user_email: user.email }];
    db.updateMany.mockRejectedValue(
      Object.assign(new Error("conflict"), { code: "P2002" }),
    );
    await expect(findUserConfig(user)).rejects.toMatchObject({ code: "P2002" });
    expect(rows[0].user_id).toBeNull();
  });
  it("DB障害を空一覧扱いにしない", async () => {
    db.findFirst.mockRejectedValue(new Error("offline"));
    await expect(findUserConfig(user)).rejects.toThrow("offline");
  });
});

describe("メール確認の根拠", () => {
  it.each([undefined, "2026-10-11T00:00:00Z"])(
    "Supabaseのemail_confirmed_atだけを見る: %s",
    async (confirmed) => {
      db.getUser.mockResolvedValue({
        data: {
          user: {
            ...user,
            email: "OWNER@example.com",
            email_confirmed_at: confirmed,
            user_metadata: { email_verified: true },
          },
        },
        error: null,
      });
      expect(await getAuthUser()).toEqual({
        ...user,
        emailVerified: Boolean(confirmed),
      });
    },
  );
  it("共通ログインは維持しても開発バイパスで設定行を読ませない", async () => {
    db.getUser.mockResolvedValue({
      data: { user: { ...user, id: "dev-bypass-id" } },
      error: null,
    });
    const auth = await getAuthUser();
    expect(auth?.id).toBe("dev-bypass-id");
    expect(await findUserConfig(auth!)).toBeNull();
    expect(db.findFirst).not.toHaveBeenCalled();
  });
  it("セッション検証失敗は拒否する", async () => {
    db.getUser.mockResolvedValue({
      data: { user },
      error: new Error("unauthorized"),
    });
    expect(await getAuthUser()).toBeNull();
  });
});

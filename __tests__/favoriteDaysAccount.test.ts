import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAVORITE_DAYS_KEY,
  parseFavoriteDays,
  removeFavoriteDay,
  resetFavoriteDaysSyncForTest,
  syncFavoriteDays,
  toggleFavoriteDay,
  type FavoriteDay,
} from "@/lib/favoriteDays";

/**
 * 日取りのお気に入りをアカウントにも残す（利用者の判断、2026-09-29
 * 「日取りのお気に入りもアカウントに保存していいよ」）。
 *
 * - API（/api/favorite-days）は /api/saved-analyses と同じ守り:
 *   ログイン必須・本人の行だけ・同一オリジン・生年月日と座標は受け取らない
 * - 端末とアカウントの揃え方: 端末にしか無いものは送る。一度載ったのに
 *   アカウントから消えたものは、別の端末で外したとみなして端末からも消す
 * - 未ログインの ☆ では API を呼ばない
 */

const findMany = vi.fn();
const findUnique = vi.fn();
const count = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    favoriteDay: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      count: (...a: unknown[]) => count(...a),
      upsert: (...a: unknown[]) => upsert(...a),
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
const VERDICT = {
  directionLabel: "南東",
  yearLabel: "大吉",
  monthLabel: "大吉",
  dayLabel: "大吉",
  tags: ["天赦日"],
  blockedByTenchusatsu: false,
};

function req(
  method: "POST" | "DELETE",
  { origin = "https://cloud-palette.com", body = {}, url = "" } = {},
) {
  return {
    method,
    url: `https://cloud-palette.com/api/favorite-days${url}`,
    headers: new Headers(origin ? { origin } : {}),
    nextUrl: { host: "cloud-palette.com" },
    json: async () => body,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetFavoriteDaysSyncForTest();
  authUser.mockResolvedValue({ id: ME, email: "me@example.com" });
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue(null);
  count.mockResolvedValue(0);
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("/api/favorite-days", () => {
  it("ログインしていなければ読むことも書くこともできない", async () => {
    authUser.mockResolvedValue(null);
    const { GET, POST, DELETE } = await import("@/app/api/favorite-days/route");
    expect((await GET()).status).toBe(401);
    expect(
      (
        await POST(
          req("POST", {
            body: { date: "2026-10-12", direction: "SE", verdict: VERDICT },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await DELETE(req("DELETE", { url: "?date=2026-10-12&direction=SE" })))
        .status,
    ).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("読むのも書くのも消すのも本人の行だけ", async () => {
    const { GET, POST, DELETE } = await import("@/app/api/favorite-days/route");
    await GET();
    expect(findMany.mock.calls[0][0].where).toEqual({ user_id: ME });

    const res = await POST(
      req("POST", {
        body: { date: "2026-10-12", direction: "SE", verdict: VERDICT },
      }),
    );
    expect(res.status).toBe(200);
    const key = { user_id: ME, day: "2026-10-12", direction: "SE" };
    expect(upsert).toHaveBeenCalledWith({
      where: { user_id_day_direction: key },
      create: { ...key, verdict: VERDICT },
      update: { verdict: VERDICT },
    });

    await DELETE(req("DELETE", { url: "?date=2026-10-12&direction=SE" }));
    expect(deleteMany).toHaveBeenCalledWith({ where: key });
  });

  it("別のオリジンからは書けない", async () => {
    const { POST, DELETE } = await import("@/app/api/favorite-days/route");
    const evil = "https://evil.example";
    expect(
      (
        await POST(
          req("POST", {
            origin: evil,
            body: { date: "2026-10-12", direction: "SE", verdict: VERDICT },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await DELETE(
          req("DELETE", { origin: evil, url: "?date=2026-10-12&direction=SE" }),
        )
      ).status,
    ).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("形の崩れた日付・方位・判定は受け取らず、余分な欄（生年月日）は保存しない", async () => {
    const { POST } = await import("@/app/api/favorite-days/route");
    for (const body of [
      { date: "10/12", direction: "SE", verdict: VERDICT },
      { date: "2026-10-12", direction: "SOUTH", verdict: VERDICT },
      { date: "2026-10-12", direction: "SE", verdict: { tags: [] } },
    ]) {
      expect((await POST(req("POST", { body }))).status).toBe(400);
    }
    await POST(
      req("POST", {
        body: {
          date: "2026-10-12",
          direction: "SE",
          verdict: { ...VERDICT, birthDate: "1990-01-02" },
          baseLat: 35.6,
        },
      }),
    );
    expect(JSON.stringify(upsert.mock.calls[0][0])).not.toMatch(
      /birth|1990|baseLat|35\.6/,
    );
  });

  it("上限を超える新しい行は 409 で断る（既にある行の上書きは通す）", async () => {
    const { POST } = await import("@/app/api/favorite-days/route");
    count.mockResolvedValue(60);
    const body = { date: "2026-10-12", direction: "SE", verdict: VERDICT };
    expect((await POST(req("POST", { body }))).status).toBe(409);
    findUnique.mockResolvedValue({ id: "x" });
    expect((await POST(req("POST", { body }))).status).toBe(200);
  });
});

describe("端末とアカウントを揃える", () => {
  const local = (
    date: string,
    extra: Partial<FavoriteDay> = {},
  ): FavoriteDay => ({
    date,
    direction: "SE",
    ...VERDICT,
    savedAt: "2026-09-29T00:00:00.000Z",
    ...extra,
  });
  const read = () => parseFavoriteDays(localStorage.getItem(FAVORITE_DAYS_KEY));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  it("未ログインなら何も送らず、☆ でも API を呼ばない", async () => {
    const fetcher = vi.fn(async () => json({}, 401));
    expect(await syncFavoriteDays(fetcher as never)).toBe("anonymous");
    toggleFavoriteDay(local("2026-10-12"), new Date(), fetcher as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(read()).toHaveLength(1);
  });

  it("端末にしか無いものを送り、アカウントのものを端末に降ろす", async () => {
    localStorage.setItem(
      FAVORITE_DAYS_KEY,
      JSON.stringify([local("2026-10-12")]),
    );
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ ok: true })
        : json({ favorites: [local("2026-11-03")] }),
    );
    expect(await syncFavoriteDays(fetcher as never)).toBe("synced");
    const posts = fetcher.mock.calls.filter(([, i]) => i?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      date: "2026-10-12",
      direction: "SE",
      verdict: VERDICT,
    });
    expect(read().map((f) => [f.date, f.synced])).toEqual([
      ["2026-10-12", true],
      ["2026-11-03", true],
    ]);
  });

  it("一度載ったのにアカウントから消えたものは、端末からも消す", async () => {
    localStorage.setItem(
      FAVORITE_DAYS_KEY,
      JSON.stringify([local("2026-10-12", { synced: true })]),
    );
    const fetcher = vi.fn(async () => json({ favorites: [] }));
    await syncFavoriteDays(fetcher as never);
    expect(read()).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ログイン中は ☆ と × がアカウントにも届く", async () => {
    const fetcher = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () => json({ favorites: [], ok: true }));
    await syncFavoriteDays(fetcher as never);
    toggleFavoriteDay(local("2026-10-12"), new Date(), fetcher as never);
    await vi.waitFor(() => expect(read()[0]?.synced).toBe(true));
    removeFavoriteDay("2026-10-12", "SE", fetcher as never);
    const calls = fetcher.mock.calls.map(
      ([url, init]) => `${init?.method ?? "GET"} ${url}`,
    );
    expect(calls).toEqual([
      "GET /api/favorite-days",
      "POST /api/favorite-days",
      "DELETE /api/favorite-days?date=2026-10-12&direction=SE",
    ]);
    expect(read()).toEqual([]);
  });
});

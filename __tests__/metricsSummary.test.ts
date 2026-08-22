import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/metrics/summary（管理者専用の集計）。
 *
 * 守るのは 3 つ。
 *   1. 口は管理者に限る（匿名 401 / 他人 403。DB には触らない）
 *   2. COUNT の bigint を Number に落としてから応答に載せる
 *      （落とすと JSON.stringify が TypeError で 500 になる）
 *   3. device の NULL（列を足す前の行）は "unknown" として返す
 *   4. ブログは**記録が 0 の記事も並べる**。一覧から消えると
 *      「読まれていない」が見えず、効果検証にならない
 *
 * 記事の一覧は content/blog の実ファイルではなくモックを使う。
 * 実ファイルを読むと、記事を 1 本足すたびにこのテストが落ちる。
 */

const {
  getUser,
  queryRaw,
  userConfigCount,
  favCount,
  histCount,
  simCount,
  loadGcpBillingCost,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  queryRaw: vi.fn(),
  userConfigCount: vi.fn(),
  favCount: vi.fn(),
  histCount: vi.fn(),
  simCount: vi.fn(),
  loadGcpBillingCost: vi.fn(),
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

vi.mock("@/lib/gcpBilling", () => ({ loadGcpBillingCost }));

// 実装は blogStore（DB 優先・Markdown フォールバック）を読む。
// テストでは DB を用意しないので、一覧をそのまま返すモックにする。
vi.mock("@/lib/blogStore", () => ({
  loadBlogPosts: async () => [
    {
      slug: "new-post",
      title: "新しい記事",
      description: "",
      publishedAt: "2026-08-13",
      category: "引越しの考え方",
      tags: [],
      draft: false,
      readingMinutes: 5,
    },
    {
      slug: "old-post",
      title: "古い記事",
      description: "",
      publishedAt: "2026-08-03",
      category: "引越しの考え方",
      tags: [],
      draft: false,
      readingMinutes: 4,
    },
  ],
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
    /*
      「今日」を固定する。直近 7 日の内訳（recentBreakdown）は実行日から
      窓を切るが、記録の作り置きは 2026-08-13 固定なので、**実行日が
      2026-08-20（JST）になった瞬間に窓から落ちて必ず失敗する**時限に
      なっていた。実際に 8/19 23:53 JST では通り、0:03 JST（日付が
      変わった直後）の CI で落ちた（#416）。

      shouldAdvanceTime を付けるのは、時計を完全に止めると route の中の
      await が進まなくなるため。起点だけ固定して針は動かす。
    */
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      now: new Date("2026-08-14T12:00:00+09:00"),
    });
    process.env.ADMIN_EMAIL = admin.email;
    loadGcpBillingCost.mockResolvedValue({
      status: "ok",
      invoiceMonth: "202608",
      currency: "JPY",
      total: 150,
      services: [{ service: "Cloud Run", amount: 150 }],
      message: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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
    // daily → topPaths → topReferrers → devices → hourly → intraday
    // → prev30 → latest → 当月の外部 API 使用量 → ブログのパス別
    // → ブログの参照元 → ブログ→道具の到達
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
      .mockResolvedValueOnce([
        { day: "2026-08-16", hour: 9, pv: BigInt(4), uv: BigInt(2) },
        { day: "2026-08-15", hour: 9, pv: BigInt(2), uv: BigInt(1) },
      ])
      .mockResolvedValueOnce([{ n: BigInt(5) }])
      .mockResolvedValueOnce([{ latest: new Date("2026-08-13T12:00:00Z") }])
      .mockResolvedValueOnce([
        {
          provider: "google",
          model: "gemini-2.5-flash",
          route: "/api/rentals/webhook",
          calls: BigInt(3),
          input_tokens: BigInt(1200),
          output_tokens: BigInt(300),
          untracked_calls: BigInt(0),
        },
      ])
      .mockResolvedValueOnce([
        { path: "/blog", pv: BigInt(4), uv: BigInt(3) },
        { path: "/blog/old-post", pv: BigInt(9), uv: BigInt(6) },
      ])
      .mockResolvedValueOnce([{ referrer_host: "google.com", pv: BigInt(5) }])
      .mockResolvedValueOnce([{ blog_days: BigInt(8), tool_days: BigInt(2) }])
      .mockResolvedValueOnce([{ dow: 6, hour: 21, pv: BigInt(3) }])
      .mockResolvedValueOnce([
        { day: "2026-08-13", pv: BigInt(9), uv: BigInt(5) },
      ])
      .mockResolvedValueOnce([
        { day: "2026-08-13", path: "/blog/old-post", pv: BigInt(7) },
        { day: "2026-08-13", path: "/blog", pv: BigInt(2) },
      ])
      // 除外が効いていることを画面で示すための 2 本（配列の末尾）。
      .mockResolvedValueOnce([{ n: BigInt(4) }])
      .mockResolvedValueOnce([{ since: "2026-08-21" }]);
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
    /*
      既定は「自分を除く」。excluded は**外した件数**なので、
      絞り込みとは独立に内部の行だけを数えた値がそのまま出る。
      画面はこれを見て「効いているのか、人が来なかっただけなのか」を
      区別する。
    */
    expect(d.internal).toEqual({
      included: false,
      excluded: 4,
      since: "2026-08-21",
    });
    expect(d.pvPrev30).toBe(5);
    expect(d.hourly[0]).toEqual({ hour: 21, pv: 3 });
    // 今日と昨日の時間別。行はそのまま返し、0 の枠は埋めない。
    expect(d.intraday).toEqual([
      { day: "2026-08-16", hour: 9, pv: 4, uv: 2 },
      { day: "2026-08-15", hour: 9, pv: 2, uv: 1 },
    ]);
    // 曜日 × 時間帯は記録のある枠だけ返す（168 枠を埋めない）。
    expect(d.weekdayHourly).toEqual([{ dow: 6, hour: 21, pv: 3 }]);

    // NULL device は unknown
    expect(d.devices).toEqual([
      { device: "mobile", pv: 2, uv: 1 },
      { device: "unknown", pv: 1, uv: 1 },
    ]);

    expect(d.registeredUsers).toBe(10);
    expect(d.newUsers.beforeTracking).toBe(7);
    expect(d.usage).toEqual({ favorites: 6, histories: 4, simulations: 2 });
    expect(d.externalApi).toEqual({
      status: "ok",
      message: null,
      sinceDay: "2026-08-01",
      totalCalls: 3,
      totalEstimateYen: 0.1768674,
      rows: [
        {
          provider: "google",
          model: "gemini-2.5-flash",
          route: "/api/rentals/webhook",
          calls: 3,
          inputTokens: 1200,
          outputTokens: 300,
          untrackedCalls: 0,
          estimateYen: 0.1768674,
        },
      ],
    });
    expect(d.gcpBilling).toEqual({
      status: "ok",
      invoiceMonth: "202608",
      currency: "JPY",
      total: 150,
      services: [{ service: "Cloud Run", amount: 150 }],
      message: null,
    });
    expect(d.latestViewAt).toBe("2026-08-13T12:00:00.000Z");

    // 一覧（/blog）は記事の合計に混ぜない。別々に出す。
    expect(d.blog.index).toEqual({ pv: 4, uv: 3 });
    expect(d.blog.totals).toEqual({ pv: 9, uv: 6 });

    // 記録が 1 件も無い new-post も 0 として並ぶ。並びは PV の多い順。
    // daysSincePublished は「今日」を基準にするので値は日々変わる。
    expect(d.blog.posts).toEqual([
      {
        slug: "old-post",
        title: "古い記事",
        path: "/blog/old-post",
        publishedAt: "2026-08-03",
        daysSincePublished: expect.any(Number),
        pv: 9,
        uv: 6,
      },
      {
        slug: "new-post",
        title: "新しい記事",
        path: "/blog/new-post",
        publishedAt: "2026-08-13",
        daysSincePublished: expect.any(Number),
        pv: 0,
        uv: 0,
      },
    ]);
    expect(d.blog.referrers).toEqual([{ host: "google.com", pv: 5 }]);

    // 日別。UV は日単位の DISTINCT で、記事別の合算ではない。
    expect(d.blog.daily).toEqual([{ day: "2026-08-13", pv: 9, uv: 5 }]);

    // 直近7日の内訳。記録の無い日も 0 の行で出る（行の抜けと 0 を
    // 区別するため）。today は実行日なので、行数と中身だけ見る。
    expect(d.blog.recentBreakdown.days).toHaveLength(7);
    expect(d.blog.recentBreakdown.postColumns).toEqual([
      { slug: "old-post", title: "古い記事" },
    ]);
    const filled = d.blog.recentBreakdown.days.find(
      (row: { day: string }) => row.day === "2026-08-13",
    );
    if (filled) {
      expect(filled.index).toBe(2);
      expect(filled.posts["old-post"]).toBe(7);
      expect(filled.total).toBe(9);
    }
    expect(d.blog.funnel).toEqual({
      blogVisitDays: 8,
      toolVisitDays: 2,
      rate: 0.25,
    });
  });

  it("api_usage を集計できないときは 0 回と偽らず、他の指標を返す", async () => {
    getUser.mockResolvedValue({ data: { user: admin }, error: null });
    queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ n: BigInt(0) }])
      .mockResolvedValueOnce([{ latest: null }])
      .mockRejectedValueOnce(new Error('relation "api_usage" does not exist'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ blog_days: BigInt(0), tool_days: BigInt(0) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      // 内部の件数と、見分けられるようになった日。
      // ここでは 1 件も無く、列を足す前しか記録が無い場合。
      .mockResolvedValueOnce([{ n: BigInt(0) }])
      .mockResolvedValueOnce([{ since: null }]);
    userConfigCount.mockResolvedValue(0);
    favCount.mockResolvedValue(0);
    histCount.mockResolvedValue(0);
    simCount.mockResolvedValue(0);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    // 記録がまだ無いときは since が null。画面は断りを出さない。
    expect(json.data.internal).toEqual({
      included: false,
      excluded: 0,
      since: null,
    });
    expect(json.data.externalApi).toEqual({
      status: "error",
      message: "api_usage の準備または集計に失敗しました。",
      sinceDay: "2026-08-01",
      totalCalls: null,
      totalEstimateYen: null,
      rows: [],
    });
    expect(json.data.usage).toEqual({
      favorites: 0,
      histories: 0,
      simulations: 0,
    });
    // 閲覧が 1 件も無いとき、到達率は 0% ではなく null。
    // 0/0 を 0% と書くと「読まれたのに誰も道具へ行かなかった」に見える。
    expect(json.data.blog.funnel).toEqual({
      blogVisitDays: 0,
      toolVisitDays: 0,
      rate: null,
    });
    expect(json.data.blog.posts.map((p: { pv: number }) => p.pv)).toEqual([
      0, 0,
    ]);
  });
});

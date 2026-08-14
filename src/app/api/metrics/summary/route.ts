import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { toLogMessage } from "@/lib/errorMessage";
import { todayInJapan } from "@/utils/japanDate";
import { estimateYen, totalEstimateYen, type UsageRow } from "@/lib/apiUsage";
import { loadGcpBillingCost } from "@/lib/gcpBilling";
import { loadBlogPosts } from "@/lib/blogStore";
import {
  BLOG_INDEX_PATH,
  TOOL_PATH_PATTERNS,
  buildBlogDailyBreakdown,
  buildBlogFunnel,
  buildBlogMetrics,
} from "@/lib/blogMetrics";

/**
 * 管理ページ（/admin/metrics）が読む集計。
 *
 * page_views は匿名ハッシュしか持たないが、日別の並びから
 * 「いつ誰かが触っていたか」は読めるので、口は管理者に限る。
 * 判定は adminApi の denyUnlessAdmin（middleware と同じ規則）。
 *
 * UV の distinct count は Prisma の groupBy では書けないため raw で引く。
 * COUNT は bigint で返るので Number に落としてから応答に載せる。
 *
 * 「前期間比」を出すための切り方:
 *   直近 30 日 = day >= since30 / その前の 30 日 = since60 <= day < since30
 * day は JST の "YYYY-MM-DD" 文字列なので、辞書順の比較で切れる。
 *
 * 時間帯別は created_at (timestamptz) から出す。DB の TimeZone 設定に
 * 依存しないよう、SQL 中で 'Asia/Tokyo' を必ず明示する。窓は 2 つ:
 *   hourly        24 枠 / 直近 7 日  「今どの時間に見られているか」
 *   weekdayHourly 168 枠 / 直近 30 日「平日の昼か、週末の夜か」
 * 枠数が 7 倍なので同じ 7 日で切ると 1 枠 0〜1 件になり読めない。
 *
 * ブログの効果検証（data.blog）だけは page_views 単体で完結しない。
 * 「読まれていない記事」を出すには公開中の記事の一覧が要るので、
 * 記事の一覧は blogStore（DB 優先・Markdown フォールバック）から読む。
 * 組み替えの規則は src/lib/blogMetrics.ts。
 */

export const dynamic = "force-dynamic";

const DAYS = 30;
const TOP_LIMIT = 10;

type DailyRow = { day: string; pv: bigint; uv: bigint };
type PathRow = { path: string; pv: bigint; uv: bigint };
type ReferrerRow = { referrer_host: string; pv: bigint };
type DeviceRow = { device: string | null; pv: bigint; uv: bigint };
type HourRow = { hour: number; pv: bigint };
type WeekdayHourRow = { dow: number; hour: number; pv: bigint };
type BlogPathRow = { path: string; pv: bigint; uv: bigint };
type BlogDayRow = { day: string; pv: bigint; uv: bigint };
type BlogDayPathRow = { day: string; path: string; pv: bigint };
type BlogFunnelRow = { blog_days: bigint; tool_days: bigint };
type CountRow = { n: bigint };
type MaxRow = { latest: Date | null };
type ApiUsageSqlRow = {
  provider: string;
  model: string;
  route: string;
  calls: bigint;
  input_tokens: bigint;
  output_tokens: bigint;
  untracked_calls: bigint;
};

async function loadApiUsage(monthStart: string): Promise<{
  status: "ok" | "error";
  rows: ApiUsageSqlRow[];
  message: string | null;
}> {
  try {
    const rows = await prisma.$queryRaw<ApiUsageSqlRow[]>`
      SELECT provider, model, route,
             COUNT(*) AS calls,
             COALESCE(SUM(input_tokens), 0) AS input_tokens,
             COALESCE(SUM(output_tokens), 0) AS output_tokens,
             COUNT(*) FILTER (
               WHERE input_tokens IS NULL OR output_tokens IS NULL
             ) AS untracked_calls
      FROM api_usage WHERE day >= ${monthStart}
      GROUP BY provider, model, route
      ORDER BY COUNT(*) DESC`;
    return { status: "ok", rows, message: null };
  } catch (error) {
    console.error("api_usage の集計に失敗:", toLogMessage(error));
    return {
      status: "error",
      rows: [],
      message: "api_usage の準備または集計に失敗しました。",
    };
  }
}

/**
 * /blog と /blog/<slug> だけを拾う条件。/blog/feed.xml は拡張子付きで
 * normalizePath に落とされるので page_views には入らない。
 */
const BLOG_MATCH = Prisma.sql`(path = ${BLOG_INDEX_PATH} OR path LIKE '/blog/%')`;

/** 「道具のページ」の条件。対象は blogMetrics.ts の 1 か所で決める。 */
const TOOL_MATCH = Prisma.join(
  TOOL_PATH_PATTERNS.map((pattern) => Prisma.sql`path LIKE ${pattern}`),
  " OR ",
);

/** JST の今日から n 日前の "YYYY-MM-DD"。day 列と同じ暦で切るための基準。 */
function jstDayBefore(days: number): string {
  const todayJst = new Date(`${todayInJapan()}T00:00:00+09:00`);
  return new Date(todayJst.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    const today = todayInJapan();
    const yesterday = jstDayBefore(1);
    // 「直近 30 日」に今日を含める（今日を含めて 30 枠）。
    const since30 = jstDayBefore(DAYS - 1);
    const since60 = jstDayBefore(DAYS * 2 - 1);
    const since7 = jstDayBefore(6);
    const monthStart = `${today.slice(0, 7)}-01`;

    const now = Date.now();
    const ago7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const ago30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const jstMidnight = new Date(`${today}T00:00:00+09:00`);

    const [
      daily,
      topPaths,
      topReferrers,
      devices,
      hourly,
      prev30Pv,
      latestView,
      apiUsage,
      gcpBilling,
      registeredUsers,
      usersSaved7d,
      usersSaved30d,
      newUsersToday,
      newUsers7d,
      newUsers30d,
      usersBeforeTracking,
      favoritesTotal,
      historiesTotal,
      simulationsTotal,
      blogPaths,
      blogReferrers,
      blogFunnelRows,
      weekdayHourly,
      blogDaily,
      blogDayPaths,
    ] = await Promise.all([
      prisma.$queryRaw<DailyRow[]>`
        SELECT day, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since30}
        GROUP BY day ORDER BY day DESC`,
      prisma.$queryRaw<PathRow[]>`
        SELECT path, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since30}
        GROUP BY path ORDER BY COUNT(*) DESC LIMIT ${TOP_LIMIT}`,
      prisma.$queryRaw<ReferrerRow[]>`
        SELECT referrer_host, COUNT(*) AS pv
        FROM page_views WHERE day >= ${since30} AND referrer_host IS NOT NULL
        GROUP BY referrer_host ORDER BY COUNT(*) DESC LIMIT ${TOP_LIMIT}`,
      // device は列を足す前の行が NULL。「不明」として残す（さかのぼって
      // 埋められない。UA を保存していないので）。
      prisma.$queryRaw<DeviceRow[]>`
        SELECT device, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since30}
        GROUP BY device ORDER BY COUNT(*) DESC`,
      // 時間帯は直近 7 日。30 日にすると曜日のばらつきが均されて
      // 「いつ見られているか」が読みにくくなる。
      prisma.$queryRaw<HourRow[]>`
        SELECT extract(hour from created_at AT TIME ZONE 'Asia/Tokyo')::int AS hour,
               COUNT(*) AS pv
        FROM page_views WHERE day >= ${since7}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS n FROM page_views
        WHERE day >= ${since60} AND day < ${since30}`,
      prisma.$queryRaw<MaxRow[]>`
        SELECT max(created_at) AS latest FROM page_views`,
      loadApiUsage(monthStart),
      loadGcpBillingCost(),
      // 訪問とは別の軸。「設定を保存したことのある人」の数で、
      // Supabase Auth 全体のアカウント数ではない（auth スキーマは
      // Prisma から見えない）。
      prisma.user_configs.count(),
      // updated_at は「最後に設定を保存した日時」。ログインの記録は
      // 持っていないので、これが「最近使われたか」の代理になる。
      prisma.user_configs.count({ where: { updated_at: { gte: ago7 } } }),
      prisma.user_configs.count({ where: { updated_at: { gte: ago30 } } }),
      // created_at は列を足した日以降の新規行にしか入らない。
      // null は「記録開始前からいる人」で、新規には数えない。
      prisma.user_configs.count({
        where: { created_at: { gte: jstMidnight } },
      }),
      prisma.user_configs.count({ where: { created_at: { gte: ago7 } } }),
      prisma.user_configs.count({ where: { created_at: { gte: ago30 } } }),
      prisma.user_configs.count({ where: { created_at: null } }),
      // 機能の利用量。件数だけで、誰のものかは出さない。
      prisma.favoriteProperty.count(),
      prisma.relocationHistory.count(),
      prisma.relocationSimulation.count(),
      // ── ブログの効果検証 ──
      // 新しい問い合わせは**末尾に足す**。この配列の順が $queryRaw の
      // 呼び出し順で、テストはその順にモックを積んでいる。間に挟むと
      // 既存の期待値が全部ずれる。
      prisma.$queryRaw<BlogPathRow[]>`
        SELECT path, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since30} AND ${BLOG_MATCH}
        GROUP BY path`,
      prisma.$queryRaw<ReferrerRow[]>`
        SELECT referrer_host, COUNT(*) AS pv
        FROM page_views
        WHERE day >= ${since30} AND referrer_host IS NOT NULL AND ${BLOG_MATCH}
        GROUP BY referrer_host ORDER BY COUNT(*) DESC LIMIT ${TOP_LIMIT}`,
      // ブログを見た人日のうち、同じ日に道具のページも見た人日。
      // visitor_hash は日付を混ぜてあるので、日をまたいだ追跡はできない。
      // 「後日また来て使った」は原理的に測れず、実際より低く出る。
      prisma.$queryRaw<BlogFunnelRow[]>`
        WITH blog AS (
          SELECT DISTINCT day, visitor_hash FROM page_views
          WHERE day >= ${since30} AND ${BLOG_MATCH}
        ), tool AS (
          SELECT DISTINCT day, visitor_hash FROM page_views
          WHERE day >= ${since30} AND (${TOOL_MATCH})
        )
        SELECT COUNT(*) AS blog_days, COUNT(t.visitor_hash) AS tool_days
        FROM blog b
        LEFT JOIN tool t ON t.day = b.day AND t.visitor_hash = b.visitor_hash`,
      // 曜日 × 時間帯。既存の hourly（24 枠）は直近 7 日だが、こちらは
      // 168 枠に分かれるので 7 日では 1 枠 0〜1 件にしかならない。
      // 30 日で引く。dow は日曜が 0（Postgres の extract の定義）。
      prisma.$queryRaw<WeekdayHourRow[]>`
        SELECT extract(dow  from created_at AT TIME ZONE 'Asia/Tokyo')::int AS dow,
               extract(hour from created_at AT TIME ZONE 'Asia/Tokyo')::int AS hour,
               COUNT(*) AS pv
        FROM page_views WHERE day >= ${since30}
        GROUP BY 1, 2 ORDER BY 1, 2`,
      // ブログの日別。UV は「その日にブログを見た人数」なので、
      // 記事別の UV を足しても出ない（同じ人が2本読むと2になる）。
      // 日単位で DISTINCT を取り直す。
      prisma.$queryRaw<BlogDayRow[]>`
        SELECT day, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since30} AND ${BLOG_MATCH}
        GROUP BY day ORDER BY day DESC`,
      // 直近 7 日の日 × 記事。内訳の升目の元。30 日ぶん送ると
      // 応答が日数 × 記事数に膨らむので、窓を絞る。
      prisma.$queryRaw<BlogDayPathRow[]>`
        SELECT day, path, COUNT(*) AS pv
        FROM page_views WHERE day >= ${since7} AND ${BLOG_MATCH}
        GROUP BY day, path`,
    ]);

    const dailyNum = daily.map((r) => ({
      day: r.day,
      pv: Number(r.pv),
      uv: Number(r.uv),
    }));
    const byDay = new Map(dailyNum.map((r) => [r.day, r]));
    const sumPv = (from: string) =>
      dailyNum.reduce((s, r) => (r.day >= from ? s + r.pv : s), 0);
    // 記事の一覧は content/blog の Markdown が持つ。記録が 1 件も無い
    // 記事も 0 として並べたいので、page_views 側だけでは足りない。
    const blogPosts = await loadBlogPosts();
    const blog = buildBlogMetrics(
      blogPaths.map((r) => ({
        path: r.path,
        pv: Number(r.pv),
        uv: Number(r.uv),
      })),
      blogPosts,
      today,
    );
    const blogFunnel = buildBlogFunnel(
      Number(blogFunnelRows[0]?.blog_days ?? 0),
      Number(blogFunnelRows[0]?.tool_days ?? 0),
    );
    const blogBreakdown = buildBlogDailyBreakdown(
      blogDayPaths.map((r) => ({
        day: r.day,
        path: r.path,
        pv: Number(r.pv),
      })),
      blogPosts,
      today,
    );
    const apiUsageRows: UsageRow[] = apiUsage.rows.map((r) => ({
      provider: r.provider,
      model: r.model,
      route: r.route,
      calls: Number(r.calls),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      untrackedCalls: Number(r.untracked_calls),
    }));

    return NextResponse.json({
      success: true,
      data: {
        sinceDay: since30,
        generatedAt: new Date().toISOString(),
        latestViewAt: latestView[0]?.latest?.toISOString() ?? null,
        registeredUsers,
        usersSaved7d,
        usersSaved30d,
        newUsers: {
          today: newUsersToday,
          last7: newUsers7d,
          last30: newUsers30d,
          beforeTracking: usersBeforeTracking,
        },
        usage: {
          favorites: favoritesTotal,
          histories: historiesTotal,
          simulations: simulationsTotal,
        },
        externalApi: {
          status: apiUsage.status,
          message: apiUsage.message,
          sinceDay: monthStart,
          totalCalls:
            apiUsage.status === "ok"
              ? apiUsageRows.reduce((sum, row) => sum + row.calls, 0)
              : null,
          totalEstimateYen:
            apiUsage.status === "ok" ? totalEstimateYen(apiUsageRows) : null,
          rows: apiUsageRows.map((row) => ({
            ...row,
            estimateYen: estimateYen(row),
          })),
        },
        gcpBilling,
        today: byDay.get(today) ?? { day: today, pv: 0, uv: 0 },
        yesterday: byDay.get(yesterday) ?? { day: yesterday, pv: 0, uv: 0 },
        pv7: sumPv(since7),
        // 前の 7 日 = 直近 14 日の合計から直近 7 日を引く（daily の範囲内）
        pvPrev7: sumPv(jstDayBefore(13)) - sumPv(since7),
        pv30: sumPv(since30),
        pvPrev30: Number(prev30Pv[0]?.n ?? 0),
        daily: dailyNum,
        hourly: hourly.map((r) => ({ hour: r.hour, pv: Number(r.pv) })),
        // 記録のある枠だけが並ぶ（168 枠すべては返さない）。0 の枠を
        // 埋めるのは描く側の仕事。応答を 168 行に膨らませない。
        weekdayHourly: weekdayHourly.map((r) => ({
          dow: r.dow,
          hour: r.hour,
          pv: Number(r.pv),
        })),
        topPaths: topPaths.map((r) => ({
          path: r.path,
          pv: Number(r.pv),
          uv: Number(r.uv),
        })),
        topReferrers: topReferrers.map((r) => ({
          host: r.referrer_host,
          pv: Number(r.pv),
        })),
        devices: devices.map((r) => ({
          device: r.device ?? "unknown",
          pv: Number(r.pv),
          uv: Number(r.uv),
        })),
        blog: {
          index: blog.index,
          totals: blog.posts,
          posts: blog.rows,
          daily: blogDaily.map((r) => ({
            day: r.day,
            pv: Number(r.pv),
            uv: Number(r.uv),
          })),
          recentBreakdown: blogBreakdown,
          referrers: blogReferrers.map((r) => ({
            host: r.referrer_host,
            pv: Number(r.pv),
          })),
          funnel: blogFunnel,
        },
      },
    });
  } catch (e) {
    console.error("metrics summary の集計に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "集計に失敗しました。" },
      { status: 500 },
    );
  }
}

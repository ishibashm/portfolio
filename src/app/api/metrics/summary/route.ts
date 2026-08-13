import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { toLogMessage } from "@/lib/errorMessage";
import { todayInJapan } from "@/utils/japanDate";
import { estimateYen, totalEstimateYen, type UsageRow } from "@/lib/apiUsage";
import { loadGcpBillingCost } from "@/lib/gcpBilling";

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
 * 依存しないよう、SQL 中で 'Asia/Tokyo' を必ず明示する。
 */

export const dynamic = "force-dynamic";

const DAYS = 30;
const TOP_LIMIT = 10;

type DailyRow = { day: string; pv: bigint; uv: bigint };
type PathRow = { path: string; pv: bigint; uv: bigint };
type ReferrerRow = { referrer_host: string; pv: bigint };
type DeviceRow = { device: string | null; pv: bigint; uv: bigint };
type HourRow = { hour: number; pv: bigint };
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
    ]);

    const dailyNum = daily.map((r) => ({
      day: r.day,
      pv: Number(r.pv),
      uv: Number(r.uv),
    }));
    const byDay = new Map(dailyNum.map((r) => [r.day, r]));
    const sumPv = (from: string) =>
      dailyNum.reduce((s, r) => (r.day >= from ? s + r.pv : s), 0);
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
          totalCalls: apiUsageRows.reduce((sum, row) => sum + row.calls, 0),
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

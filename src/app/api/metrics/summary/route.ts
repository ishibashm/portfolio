import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * 管理ページ（/admin/metrics）が読む集計。
 *
 * page_views は匿名ハッシュしか持たないが、日別の並びから
 * 「いつ誰かが触っていたか」は読めるので、口は管理者に限る。
 * 判定は adminApi の denyUnlessAdmin（middleware と同じ規則）。
 *
 * UV の distinct count は Prisma の groupBy では書けないため raw で引く。
 * COUNT は bigint で返るので Number に落としてから応答に載せる。
 */

export const dynamic = "force-dynamic";

const DAYS = 30;
const TOP_LIMIT = 10;

type DailyRow = { day: string; pv: bigint; uv: bigint };
type PathRow = { path: string; pv: bigint; uv: bigint };
type ReferrerRow = { referrer_host: string; pv: bigint };

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    // 「直近 30 日」は day 文字列（JST の YYYY-MM-DD）の辞書順で切る。
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [daily, topPaths, topReferrers, registeredUsers] = await Promise.all([
      prisma.$queryRaw<DailyRow[]>`
        SELECT day, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since}
        GROUP BY day ORDER BY day DESC`,
      prisma.$queryRaw<PathRow[]>`
        SELECT path, COUNT(*) AS pv, COUNT(DISTINCT visitor_hash) AS uv
        FROM page_views WHERE day >= ${since}
        GROUP BY path ORDER BY COUNT(*) DESC LIMIT ${TOP_LIMIT}`,
      prisma.$queryRaw<ReferrerRow[]>`
        SELECT referrer_host, COUNT(*) AS pv
        FROM page_views WHERE day >= ${since} AND referrer_host IS NOT NULL
        GROUP BY referrer_host ORDER BY COUNT(*) DESC LIMIT ${TOP_LIMIT}`,
      // 訪問とは別の軸。「設定を保存したことのある人」の数で、
      // Supabase Auth 全体のアカウント数ではない（auth スキーマは
      // Prisma から見えない）。
      prisma.user_configs.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        sinceDay: since,
        registeredUsers,
        daily: daily.map((r) => ({
          day: r.day,
          pv: Number(r.pv),
          uv: Number(r.uv),
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

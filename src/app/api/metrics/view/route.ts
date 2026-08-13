import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { todayInJapan } from "@/utils/japanDate";
import {
  isBotUserAgent,
  normalizePath,
  referrerHostFrom,
  visitorHash,
} from "@/lib/pageMetrics";

/**
 * ページ閲覧の受け口。PageViewBeacon が navigator.sendBeacon で 1 発送る。
 *
 * 応答は本文なしの 204 で固定する。ビーコンは応答を読まないし、
 * ここが失敗しても画面には何も出せない。記録の失敗は握りつぶして
 * ログにだけ残す（計測のためにページを壊さない）。
 *
 * 認証はしない。閲覧の記録は誰でも送れてよい。書き込み先は
 * 匿名ハッシュとパスだけのテーブルで、読む口（管理ページ）は
 * denyUnlessAdmin で守る。
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // sendBeacon は Content-Type が text/plain になるため、
    // request.json() ではなく text() から読む。
    const body: unknown = JSON.parse(await request.text());
    const { path: rawPath, referrer } = body as {
      path?: unknown;
      referrer?: unknown;
    };

    const path = normalizePath(rawPath);
    if (!path) return new NextResponse(null, { status: 204 });

    const ua = request.headers.get("user-agent") ?? "";
    if (isBotUserAgent(ua)) return new NextResponse(null, { status: 204 });

    // 逆プロキシ経由なので接続元は x-forwarded-for の先頭。
    // 無ければ空のまま混ぜる（同一 UA が全部同じ人に束なるだけで、
    // 記録自体は残る）。
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const day = todayInJapan();

    await prisma.pageView.create({
      data: {
        day,
        path,
        visitor_hash: visitorHash(ip, ua, day),
        referrer_host: referrerHostFrom(
          referrer,
          new URL(request.url).hostname,
        ),
      },
    });
  } catch (e) {
    console.warn("page view の記録に失敗:", toLogMessage(e));
  }
  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage } from "@/lib/errorMessage";
import { todayInJapan } from "@/utils/japanDate";
import { getAuthUser } from "@/lib/userConfig";
import { isAdminEmail } from "@/utils/supabase/routeAccess";
import {
  deviceTypeFrom,
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
 *
 * ## 運営者自身の閲覧に印を付ける
 *
 * 「私だけしか見ていないのにビューが増える」という指摘のとおりで、
 * これまでは**運営者を外す仕組みが無かった。**PageViewBeacon は
 * usePathname の変化で発火するので、サイト内を 10 ページ見れば 10 PV。
 * 開発中のリロードもそのまま数に乗る。
 *
 * **記録は止めず、印だけ付ける。**捨てると後から考え直せないし、
 * 「内部を除いた数」と「全部の数」を両方出せるほうが強い。
 *
 * 判定は 2 つあり、**どちらかが立てば internal**。
 *
 *   ログインしているのが ADMIN_EMAIL     ログアウトして見ると効かない
 *   端末側で「計測から除外」を選んでいる  別の端末を使うと効かない
 *
 * 片方だけでは漏れるので両方持つ。端末側の申告（body の internal）は
 * 誰でも送れるが、**送れて困るのは「自分の閲覧を数えさせない」ことだけ**で、
 * 他人の数を操作する手立てにはならない。逆向き（外部を internal に
 * 見せかける）も同じで、実害が無い。
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // sendBeacon は Content-Type が text/plain になるため、
    // request.json() ではなく text() から読む。
    const body: unknown = JSON.parse(await request.text());
    const {
      path: rawPath,
      referrer,
      internal: clientInternal,
    } = body as {
      path?: unknown;
      referrer?: unknown;
      internal?: unknown;
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

    // 管理者としてログインしているか。ここで落ちても記録は続ける
    // （計測のために閲覧そのものを壊さない）。判定できなければ
    // 端末側の申告だけで決める。
    let adminInternal = false;
    try {
      const user = await getAuthUser();
      adminInternal = Boolean(user && isAdminEmail(user.email));
    } catch (e) {
      console.warn("閲覧者の判定に失敗:", toLogMessage(e));
    }

    await prisma.pageView.create({
      data: {
        day,
        path,
        visitor_hash: visitorHash(ip, ua, day),
        referrer_host: referrerHostFrom(
          referrer,
          new URL(request.url).hostname,
        ),
        // UA そのものは保存しない。pc / mobile / tablet の 3 値だけ。
        device: deviceTypeFrom(ua),
        // 新しい行は必ず true / false を明示する。null は
        // 「この列ができる前の行」の意味に取ってあるので、ここで
        // 曖昧なまま入れると過去の行と見分けがつかなくなる。
        is_internal: adminInternal || clientInternal === true,
      },
    });
  } catch (e) {
    console.warn("page view の記録に失敗:", toLogMessage(e));
  }
  return new NextResponse(null, { status: 204 });
}

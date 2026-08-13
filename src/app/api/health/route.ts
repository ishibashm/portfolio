import { NextResponse } from "next/server";

/**
 * ウォームアップ用の生存確認。keep-warm.yml が定期的に叩く。
 *
 * 目的はインスタンスを冷やさないことなので、**何も importしない・
 * DB に触らない**のが要件。ここに prisma を import すると、ping の
 * たびに DB 接続が走って本末転倒になる（Prisma は初回クエリまで
 * 接続しないが、それでもクライアント初期化のコストは払う）。
 *
 * force-dynamic にするのは、静的化されると CDN 側で返ってしまい
 * コンテナまでリクエストが届かない（＝温まらない）ため。
 */

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

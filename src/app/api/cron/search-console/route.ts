import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toLogMessage, toResponseMessage } from "@/lib/errorMessage";
import {
  SITE_URL_PROPERTY,
  fetchAccessToken,
  fetchDailyBreakdown,
} from "@/lib/searchConsole";

/**
 * Search Console の実績を 1 日 1 回取り込む。
 *
 * ## なぜ貯めるか
 *
 * Search Console は画面も API も **16 か月ぶんしか返さない**。しかも
 * その場で叩いた値は「今どうか」しか答えない。「この記事を出してから
 * 表示回数が伸びたのか」「順位が上がったのか下がったのか」を後から
 * 追うには、日次で貯めておくしかない。
 *
 * ## 認証
 *
 * lib/searchConsole の説明どおり、メタデータサーバーから Cloud Run の
 * サービスアカウントのトークンを取る。**鍵ファイルも新しい Secret も
 * 要らない。**手元やローカルでは動かない（notOnCloudRun）。
 *
 * ## いつからいつまでを取るか
 *
 * Search Console の実績は **2〜3 日遅れて確定する。**直近まで詰めると
 * 未確定の日を取り込んでしまい、次の日に数字が変わる。だから
 *
 *   終わり  3 日前   確定しているとみなせる最も新しい日
 *   始まり  10 日前  7 日ぶん重ねて取り直す
 *
 * **重ねて取り直すのは、後から確定値が動くことがあるため。**鍵が
 * (date, query, page) なので、同じ日を取り直せば upsert で上書きされる。
 * 1 日ぶんだけ取ると、走らなかった日が永久に空くのも防げる。
 *
 * ## 上限に当たったら黙らない
 *
 * fetchDailyBreakdown は行数が rowLimit と同じなら truncated を返す。
 * その場合は**応答に出す**。黙って一部だけ保存すると「その日はこれしか
 * 無かった」と読めてしまう。
 */

export const dynamic = "force-dynamic";

/** Search Console の実績が確定するまでの遅れ（日）。 */
const SETTLE_DAYS = 3;

/** 取り直す幅（日）。確定後に値が動くことがあるので重ねる。 */
const OVERLAP_DAYS = 7;

/** 1 回に取る行数の上限。25,000 まで指定できるが、この規模なら十分。 */
const ROW_LIMIT = 5000;

/** YYYY-MM-DD。Search Console は太平洋時間だが、日付の文字列だけ扱う。 */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // 未設定のときに素通りさせない（api/cron/telemetry と同じ扱い。
  // 以前そちらで "Bearer undefined" が一致して誰でも書き込めた）。
  if (!secret) {
    console.error("CRON_SECRET is not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await fetchAccessToken();
    if (!token) {
      // クラウド上でなければメタデータサーバーが無い。失敗ではなく
      // 「ここでは動かない」なので、そう分かる形で返す。
      return NextResponse.json(
        {
          success: false,
          reason: "notOnCloudRun",
          error:
            "メタデータサーバーからトークンを取得できませんでした。Cloud Run 上でのみ動きます。",
        },
        { status: 503 },
      );
    }

    const startDate = ymd(daysAgo(SETTLE_DAYS + OVERLAP_DAYS));
    const endDate = ymd(daysAgo(SETTLE_DAYS));

    const { rows, truncated } = await fetchDailyBreakdown(token, {
      startDate,
      endDate,
      rowLimit: ROW_LIMIT,
    });

    // 1 行ずつ upsert する。件数が数百の規模なので、まとめるより
    // **どの行で落ちたかが分かる**ほうが価値がある。
    let written = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await prisma.search_console_daily.upsert({
          where: {
            date_query_page: {
              date: new Date(`${r.date}T00:00:00Z`),
              query: r.query,
              page: r.page,
            },
          },
          create: {
            date: new Date(`${r.date}T00:00:00Z`),
            query: r.query,
            page: r.page,
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
          },
          update: {
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: r.ctr,
            position: r.position,
            updated_at: new Date(),
          },
        });
        written += 1;
      } catch (e) {
        // 1 行の失敗で全部を止めない。ただし**数を返す**ので、
        // 静かに減ることはない。
        failed += 1;
        console.warn("search_console_daily の upsert に失敗:", toLogMessage(e));
      }
    }

    return NextResponse.json({
      success: true,
      property: SITE_URL_PROPERTY,
      startDate,
      endDate,
      fetched: rows.length,
      written,
      failed,
      // 上限に当たった可能性。黙らせない。
      truncated,
    });
  } catch (e) {
    console.error("Search Console の取り込みに失敗:", toLogMessage(e));
    return NextResponse.json(
      {
        success: false,
        error: toResponseMessage(e, "Search Console fetch failed"),
      },
      { status: 500 },
    );
  }
}

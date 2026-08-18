import { NextResponse } from "next/server";
import { denyUnlessAdmin } from "@/lib/adminApi";
import {
  fetchAccessToken,
  fetchQueryStats,
  inspectUrls,
  probeSearchConsole,
  topicCandidates,
} from "@/lib/searchConsole";
import { inspectionTargets } from "@/lib/searchConsoleTargets";
import { getBlogPosts } from "@/lib/blog";
import { toResponseMessage } from "@/lib/errorMessage";

/**
 * Search Console に繋がっているかの確認。**管理者だけ。**
 *
 * サービスアカウントを Search Console のユーザーに足す作業は画面からしか
 * できず（API が無い）、足せたかどうかも画面では分かりにくい。ここを開けば
 * 「動いている本人から実際に見えるか」が一発で分かる。
 *
 * 見えているプロパティの一覧をそのまま返す。cloud-palette.com が
 * permissionLevel つきで出れば通っている。
 *
 * 手元では必ず notOnCloudRun になる（メタデータサーバーが無いため）。
 * **本番で開くこと。**
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  /*
    ?inspect=1 で URL 検査まで走る。既定は疎通だけ。

    分けているのは、検査が**枠を消費する**ため（1 日 2,000 URL）。
    「繋がっているか見たいだけ」で毎回数十件を焼かない。
  */
  const params = new URL(req.url).searchParams;

  if (params.get("inspect") === "1") {
    return inspectAll();
  }

  /*
    ?topics=1 で記事の題材の候補を返す。定期タスクがここを読む。
    枠を消費しないので分けなくてもよいが、応答が別物なので口を分ける。
  */
  if (params.get("topics") === "1") {
    return topicList(Number(params.get("days") ?? 90));
  }

  const probe = await probeSearchConsole();

  if (!probe.ok) {
    /*
      繋がらない理由で案内を変える。「権限を足す」と「クラウドで動かす」は
      直し方がまったく違うので、同じ文言にまとめない。
    */
    const hint =
      probe.reason === "notOnCloudRun"
        ? "Cloud Run 上で開いてください。手元やこの環境からは確認できません。"
        : "Search Console API が有効か、サービスアカウントがユーザーに追加されているかを確認してください。";

    return NextResponse.json(
      { success: false, reason: probe.reason, detail: probe.detail, hint },
      { status: 200 },
    );
  }

  const target = probe.sites.find((s) =>
    s.siteUrl.includes("cloud-palette.com"),
  );

  return NextResponse.json({
    success: true,
    // 見えたプロパティ全部。ドメイン所有 (sc-domain:) と URL プレフィックスの
    // どちらで登録しているかもここで分かる。
    sites: probe.sites,
    target: target ?? null,
    hint: target
      ? `通っています（${target.siteUrl} / ${target.permissionLevel}）。`
      : "接続はできましたが cloud-palette.com が見えません。ユーザー追加の反映待ちか、別のアカウントに足している可能性があります。",
  });
}

/** 代表 URL の索引状況をまとめて返す。 */
async function inspectAll() {
  const token = await fetchAccessToken();
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        reason: "notOnCloudRun",
        hint: "Cloud Run 上で開いてください。",
      },
      { status: 200 },
    );
  }

  const targets = inspectionTargets();
  const results = await inspectUrls(
    token,
    targets.map((t) => t.url),
  );

  const byUrl = new Map(results.map((r) => [r.url, r]));
  const rows = targets.map((t) => ({ ...t, ...byUrl.get(t.url) }));

  /*
    **狙いどおりでない行だけを拾う。**全部並べても読めない。

      載るべきなのに載っていない  … 記事・道具のページ
      外したのに載っている        … #379 で noindex にした雛形ページ

    verdict は PASS / PARTIAL / FAIL / NEUTRAL。PASS が「索引に載っている」。
  */
  const unexpected = rows.filter((r) => {
    if (r.error) return true;
    const indexed = r.verdict === "PASS";
    return indexed !== r.shouldBeIndexed;
  });

  return NextResponse.json({
    success: true,
    checked: rows.length,
    unexpectedCount: unexpected.length,
    unexpected,
    rows,
  });
}

/** YYYY-MM-DD。Search Console はこの形しか受けない。 */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 記事の題材の候補。
 *
 * 「表示はされているがクリックの無い語」から、**既存の記事が既に扱って
 * いる語を落として**返す。同じ話題を書き足しても意味が無い。
 */
async function topicList(days: number) {
  const token = await fetchAccessToken();
  if (!token) {
    return NextResponse.json(
      {
        success: false,
        reason: "notOnCloudRun",
        hint: "Cloud Run 上で開いてください。",
      },
      { status: 200 },
    );
  }

  /*
    Search Console のデータは 2〜3 日遅れる。終わりを 3 日前に置かないと、
    直近が空のまま「候補が無い」に見える。
  */
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - Math.max(1, days) * 86400000);

  try {
    const stats = await fetchQueryStats(token, {
      startDate: ymd(start),
      endDate: ymd(end),
    });

    const candidates = topicCandidates(stats);

    // 既存記事の題と説明に出てくる語は落とす。すでに答えている。
    const covered = getBlogPosts()
      .map((p) => `${p.title} ${p.description} ${p.tags?.join(" ") ?? ""}`)
      .join(" ");
    const fresh = candidates.filter((c) => !covered.includes(c.query));

    return NextResponse.json({
      success: true,
      period: { startDate: ymd(start), endDate: ymd(end) },
      totalQueries: stats.length,
      // 既存記事と重ならない候補。定期タスクはこの先頭から題材を採る。
      candidates: fresh,
      droppedAsCovered: candidates.length - fresh.length,
      hint:
        fresh.length === 0
          ? "候補がありません。表示回数がまだ足りないか、既存記事が拾えています。"
          : `${fresh.length} 件。表示があるのにクリックの無い語です。`,
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        reason: "apiError",
        detail: toResponseMessage(e, "searchAnalytics failed"),
      },
      { status: 200 },
    );
  }
}

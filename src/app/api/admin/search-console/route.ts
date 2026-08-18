import { NextResponse } from "next/server";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { probeSearchConsole } from "@/lib/searchConsole";

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

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

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

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/userConfig";
import { isAdminEmail } from "@/utils/supabase/routeAccess";

/**
 * 管理者専用 API の入口。
 *
 * middleware（src/utils/supabase/middleware.ts）はページのパスしか見ない。
 * 保護対象は PROTECTED_ROUTE_PREFIXES（= NON_CORE_ROUTES）で、
 * "/relocation/history" は入っているが "/api/relocation/history" は入らない。
 * 前方一致なので "/api/" で始まるパスはどれにも当たらない。
 *
 * その結果 /api/relocation/history と /api/relocation/export は、ページが
 * ADMIN_EMAIL で守られているにもかかわらず、匿名の GET に 200 を返して
 * いた（本番で実測。住所・引越しの理由・生年月日・拠点座標が読めた）。
 * DELETE も同様に素通りで、id さえ渡せば誰でも記録を消せた。
 *
 * routeAccess.ts のコメントは「設定の保存やプリセット同期は API 側で別途
 * 認証しているので、ここを開けても他人のデータが読める状態にはならない」と
 * 書いている。その前提を守るための関数がこれ。
 *
 * 判定は middleware と同じ規則にする。2 か所で別の規則を持つと必ずずれる。
 * 実体は utils/supabase/routeAccess の isAdminEmail 1 つで、middleware も
 * そこを見る（以前はこの 2 か所に同じ条件式が写してあった）。
 *   - 未ログインなら 401
 *   - ADMIN_EMAIL と一致しなければ 403
 *   - ADMIN_EMAIL が**未設定なら本番では誰も通さない**。開発だけ通す
 *
 * 使い方:
 *   const denied = await denyUnlessAdmin();
 *   if (denied) return denied;
 */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  return null;
}

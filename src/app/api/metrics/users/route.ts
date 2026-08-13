import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * 管理ページ（/admin/metrics）が読む、登録ユーザーの一覧。
 *
 * 目的は「登録ユーザーは自分のアカウントだけなのか、他人が居るのか」を
 * 確かめること。識別にはメールアドレスが要るので出すが、**設定の中身の
 * 生値（生年月日・出生地や現住所の座標・API キー）は応答に載せない。**
 * 「入っているかどうか」のフラグに落とす。管理者だけが読む口でも、
 * 他人の生年月日を画面に出す理由は無い。
 *
 * 口は denyUnlessAdmin（middleware と同じ規則）。読むだけで何も書かない。
 *
 * 行動データ（お気に入り・履歴・保存プラン）の件数を添える。キー体系が
 * 2 系統あることに注意:
 *   - favorite_properties.user_id は Supabase の user.id（user_configs と同じ）
 *   - RelocationHistory / RelocationSimulation の userId は NextAuth の
 *     User.id。User.email 経由で user_configs.user_email と突き合わせる
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    const [configs, favGroups, nextAuthUsers, histGroups, simGroups] =
      await Promise.all([
        prisma.user_configs.findMany({
          select: {
            user_id: true,
            user_email: true,
            created_at: true,
            updated_at: true,
            // 以下はフラグに落とすためだけに読む。応答には載せない。
            birth_date: true,
            birth_lat: true,
            base_lat: true,
            presets: true,
            encrypted_gemini_key: true,
          },
          orderBy: { updated_at: "desc" },
        }),
        prisma.favoriteProperty.groupBy({
          by: ["user_id"],
          _count: { _all: true },
        }),
        prisma.user.findMany({ select: { id: true, email: true } }),
        prisma.relocationHistory.groupBy({
          by: ["userId"],
          _count: { _all: true },
        }),
        prisma.relocationSimulation.groupBy({
          by: ["userId"],
          _count: { _all: true },
        }),
      ]);

    const favByUserId = new Map(
      favGroups.map((g) => [g.user_id, g._count._all]),
    );
    const emailByNextAuthId = new Map(
      nextAuthUsers.map((u) => [u.id, u.email.toLowerCase()]),
    );
    const histByEmail = new Map<string, number>();
    for (const g of histGroups) {
      const email = g.userId ? emailByNextAuthId.get(g.userId) : undefined;
      if (email) {
        histByEmail.set(email, (histByEmail.get(email) ?? 0) + g._count._all);
      }
    }
    const simByEmail = new Map<string, number>();
    for (const g of simGroups) {
      const email = g.userId ? emailByNextAuthId.get(g.userId) : undefined;
      if (email) {
        simByEmail.set(email, (simByEmail.get(email) ?? 0) + g._count._all);
      }
    }

    const users = configs.map((c) => {
      const email = c.user_email.toLowerCase();
      return {
        email: c.user_email,
        // null は「登録日の記録を始める前からいる人」
        createdAt: c.created_at?.toISOString() ?? null,
        updatedAt: c.updated_at.toISOString(),
        has: {
          birthDate: c.birth_date !== null && c.birth_date !== "",
          birthPlace: c.birth_lat !== null,
          baseLocation: c.base_lat !== null,
          geminiKey: c.encrypted_gemini_key !== null,
        },
        presetCount: Array.isArray(c.presets) ? c.presets.length : 0,
        favorites: c.user_id ? (favByUserId.get(c.user_id) ?? 0) : 0,
        histories: histByEmail.get(email) ?? 0,
        simulations: simByEmail.get(email) ?? 0,
      };
    });

    return NextResponse.json({ success: true, data: { users } });
  } catch (e) {
    console.error("metrics users の集計に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "ユーザー一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/userConfig";
import { denyUnlessAdmin } from "@/lib/adminApi";
import {
  validatePractitioner,
  type PublicPractitioner,
} from "@/lib/practitioners";

/**
 * 鑑定士の掲載。
 *
 * GET    公開中のものを誰でも読める。承認済みだけ。
 * POST   自分の掲載を登録・更新する。ログイン必須。出すと承認待ちに戻る。
 * PATCH  承認・非公開の切り替え。管理者のみ。
 *
 * 自己申告をそのまま公開しない。名乗るだけで連絡先付きの掲載が作れると、
 * 宣伝と詐称の置き場になる。email と user_id は公開しない。
 */

export const dynamic = "force-dynamic";

/** practitioners がまだ作られていない状態か。 */
function isMissingTable(error: unknown): boolean {
  const message = String(
    (error as { message?: unknown })?.message ?? error ?? "",
  );
  const code = (error as { code?: unknown })?.code;
  return (
    code === "P2021" ||
    /practitioners/i.test(message) ||
    /does not exist/i.test(message)
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const area = searchParams.get("area");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      100,
    );

    const rows = await prisma.practitioner.findMany({
      where: { status: "approved", ...(area ? { area } : {}) },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        display_name: true,
        headline: true,
        area: true,
        specialties: true,
        profile: true,
        website_url: true,
      },
    });

    const data: PublicPractitioner[] = rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      headline: r.headline,
      area: r.area,
      specialties: r.specialties,
      profile: r.profile,
      websiteUrl: r.website_url,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    // 表がまだ無いデプロイでもページを壊さない（comments と同じ扱い）。
    if (isMissingTable(error)) {
      return NextResponse.json({ success: true, data: [] });
    }
    console.error("Failed to list practitioners:", error);
    return NextResponse.json(
      { success: false, error: "掲載を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "登録にはログインが必要です。" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "入力が読み取れませんでした。" },
        { status: 400 },
      );
    }

    const result = validatePractitioner(body as never);
    if ("field" in result) {
      return NextResponse.json(
        { success: false, error: result.message, field: result.field },
        { status: 400 },
      );
    }

    // 内容を書き換えたら、公開中でも承認待ちに戻す。承認後に本文だけ
    // 差し替えられると、承認の意味が無くなる。
    const data = {
      email: user.email,
      display_name: result.displayName,
      headline: result.headline,
      area: result.area,
      specialties: result.specialties,
      profile: result.profile,
      website_url: result.websiteUrl,
      status: "pending",
    };

    await prisma.practitioner.upsert({
      where: { user_id: user.id },
      create: { user_id: user.id, ...data },
      update: data,
    });

    return NextResponse.json({
      success: true,
      status: "pending",
      message: "受け付けました。内容を確認のうえ公開します。",
    });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        {
          success: false,
          error: "登録機能の準備中です。しばらくしてから試してください。",
        },
        { status: 503 },
      );
    }
    console.error("Failed to save practitioner:", error);
    return NextResponse.json(
      { success: false, error: "登録を保存できませんでした。" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await denyUnlessAdmin();
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const id = (body as { id?: unknown })?.id;
    const status = (body as { status?: unknown })?.status;

    if (typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "id が要ります。" },
        { status: 400 },
      );
    }
    if (status !== "approved" && status !== "hidden" && status !== "pending") {
      return NextResponse.json(
        { success: false, error: "status が不正です。" },
        { status: 400 },
      );
    }

    await prisma.practitioner.update({ where: { id }, data: { status } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update practitioner:", error);
    return NextResponse.json(
      { success: false, error: "更新できませんでした。" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import { toLogMessage } from "@/lib/errorMessage";

/**
 * お気に入りに入れた物件の出し入れ。
 *
 * 保存するのは物件の id だけ。家賃や方位はここに写さない。写すと掲載が
 * 更新されたときに古い値が残り、一覧と詳細で違う数字が出る。表示に要る
 * ものは、その都度 rental_properties から引く。
 *
 * 応答の error は画面の帯に出る（お気に入りボタンの近く）。そのため
 * 既定の文言は日本語にしてある。CLAUDE.md 4 節の表のとおり。
 */

const propertyIdSchema = z.string().min(1).max(200);

/** ログイン中の本人の uuid。開発バイパスの偽 id では書かせない。 */
async function currentUserId(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  // user_id は uuid 列。UUID でない id（開発バイパス）を渡すと
  // 問い合わせ自体が落ちるので、ここで弾く。
  return toUserId(user);
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "ログインするとお気に入りを保存できます。" },
        { status: 401 },
      );
    }

    const rows = await prisma.favoriteProperty.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      select: { property_id: true },
    });

    return NextResponse.json({ propertyIds: rows.map((r) => r.property_id) });
  } catch (error) {
    console.error("Failed to load favorites:", toLogMessage(error));
    return NextResponse.json(
      { error: "お気に入りを読み込めませんでした。" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "ログインするとお気に入りを保存できます。" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = propertyIdSchema.safeParse(
      (body as { propertyId?: unknown })?.propertyId,
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "物件が指定されていません。" },
        { status: 400 },
      );
    }

    // 二度押しても増えない。(user_id, property_id) の一意に任せる。
    await prisma.favoriteProperty.upsert({
      where: {
        user_id_property_id: { user_id: userId, property_id: parsed.data },
      },
      create: { user_id: userId, property_id: parsed.data },
      update: {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to add favorite:", toLogMessage(error));
    return NextResponse.json(
      { error: "お気に入りに追加できませんでした。" },
      { status: 503 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "ログインするとお気に入りを保存できます。" },
        { status: 401 },
      );
    }

    const parsed = propertyIdSchema.safeParse(
      new URL(req.url).searchParams.get("propertyId"),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "物件が指定されていません。" },
        { status: 400 },
      );
    }

    // 入っていないものを外そうとしても失敗にしない。画面側の状態と
    // ずれていたときに、押しても消えないほうが分かりにくい。
    await prisma.favoriteProperty.deleteMany({
      where: { user_id: userId, property_id: parsed.data },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove favorite:", toLogMessage(error));
    return NextResponse.json(
      { error: "お気に入りから外せませんでした。" },
      { status: 503 },
    );
  }
}

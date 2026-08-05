import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, type AuthUser } from "@/lib/userConfig";

const unauthorized = () =>
  NextResponse.json(
    { success: false, error: "ログインが必要です。" },
    { status: 401 },
  );

const unavailable = () =>
  NextResponse.json(
    {
      success: false,
      error:
        "保存済みプランを現在利用できません。時間をおいて再度お試しください。",
    },
    { status: 503 },
  );

async function resolveOwnerId(user: AuthUser) {
  const userWithAuthId = await prisma.user.findUnique({
    where: { id: user.id },
  });
  if (userWithAuthId) return userWithAuthId.id;

  // NextAuth 時代の User が同じメールで残っている環境では、Supabase の id で
  // 新規作成すると email の一意制約に当たる。既存行を所有者として再利用する。
  const legacyUser = await prisma.user.findUnique({
    where: { email: user.email },
  });
  if (legacyUser) return legacyUser.id;

  const createdUser = await prisma.user.create({
    data: { id: user.id, email: user.email },
  });
  return createdUser.id;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const ownerId = await resolveOwnerId(user);
    const simulations = await prisma.relocationSimulation.findMany({
      where: { userId: ownerId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, data: simulations });
  } catch (error) {
    console.error("Failed to resolve relocation simulations:", error);
    return unavailable();
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { id, name, steps } = body;

    if (!name || !steps || typeof steps !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "プラン名と移動内容を入力してください。",
        },
        { status: 400 },
      );
    }

    const ownerId = await resolveOwnerId(user);

    if (id) {
      const result = await prisma.relocationSimulation.updateMany({
        where: { id, userId: ownerId },
        data: { name, steps },
      });

      if (result.count === 0) {
        return NextResponse.json(
          { success: false, error: "プランが見つかりません。" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        success: true,
        data: { id, name, steps },
      });
    }

    const record = await prisma.relocationSimulation.create({
      data: { name, steps, userId: ownerId },
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("Failed to save relocation simulation:", error);
    return unavailable();
  }
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "削除するプランを指定してください。" },
        { status: 400 },
      );
    }

    const ownerId = await resolveOwnerId(user);

    const result = await prisma.relocationSimulation.deleteMany({
      where: { id, userId: ownerId },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "プランが見つかりません。" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete relocation simulation:", error);
    return unavailable();
  }
}

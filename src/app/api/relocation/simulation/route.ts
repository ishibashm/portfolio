import { z } from "zod";
import { readBoundedJson } from "@/lib/requestSecurity";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, type AuthUser } from "@/lib/userConfig";

const records = z.array(z.record(z.string(), z.json())).max(100);
const simulationSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(200),
  steps: z.union([
    records,
    z.object({ steps: records, members: records.optional() }),
  ]),
});

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
  if (user.emailVerified !== true) throw new Error("VERIFIED_EMAIL_REQUIRED");
  const legacyUser = await prisma.user.findUnique({
    where: { email: user.email },
  });
  if (legacyUser) {
    // A UUID belongs to another Supabase identity, not a legacy NextAuth row.
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(legacyUser.id)) {
      throw new Error("OWNER_MIGRATION_REQUIRED");
    }
    return legacyUser.id;
  }

  const createdUser = await prisma.user.create({
    data: { id: user.id, email: user.email },
  });
  return createdUser.id;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const ownerId = await resolveOwnerId(user);
    const simulations = await prisma.relocationSimulation.findMany({
      where: { userId: ownerId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, data: simulations });
  } catch {
    console.error("Failed to resolve relocation simulations:");
    return unavailable();
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const input = await readBoundedJson(req, 256 * 1024);
    if (!input.ok) return input.response;
    const parsed = simulationSchema.safeParse(input.value);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid simulation" },
        { status: 400 },
      );
    }
    const { id, name, steps } = parsed.data;

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
  } catch {
    console.error("Failed to save relocation simulation:");
    return unavailable();
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

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
  } catch {
    console.error("Failed to delete relocation simulation:");
    return unavailable();
  }
}

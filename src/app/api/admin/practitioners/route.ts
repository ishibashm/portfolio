import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const denied = await denyUnlessAdmin();
    if (denied) return denied;
    const data = await prisma.practitioner.findMany({
      where: { status: { in: ["pending", "approved", "hidden"] } },
      orderBy: { updated_at: "desc" },
    });
    return NextResponse.json(
      { success: true, data },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("Failed to list practitioner applications:", error);
    return NextResponse.json(
      { success: false, error: "申請一覧を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

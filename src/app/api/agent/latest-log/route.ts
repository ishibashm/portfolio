import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toResponseMessage } from "@/lib/errorMessage";

export const runtime = "nodejs";
export const revalidate = 0; // Disable cache to get real-time latest log

export async function GET() {
  try {
    const latestLog = await prisma.agentActivityLog.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { timestamp: "desc" },
      select: {
        timestamp: true,
        triggerType: true,
        textResponse: true,
        actions: true,
      },
    });

    if (!latestLog) {
      return NextResponse.json(
        { message: "No active logs found" },
        { status: 404 },
      );
    }

    return NextResponse.json(latestLog, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=29",
      },
    });
  } catch (error) {
    console.error("Latest Log API Error:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Failed to fetch latest log") },
      { status: 500 },
    );
  }
}

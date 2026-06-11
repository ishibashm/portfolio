import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // Fetch the last 30 days of telemetry logs
    const logs = await prisma.telemetryLog.findMany({
      orderBy: { timestamp: "asc" },
      take: 30,
    });

    // Format for Recharts
    const formattedData = logs.map((log) => ({
      date: log.timestamp.toISOString().split("T")[0],
      geomancyScore: log.geomancyScore || 0,
      astrophysicsScore: log.astrophysicsScore || 0,
      magneticF: log.magneticF || 0,
      hazardRisk: log.hazardRisk || 0,
      kpIndex: log.kpIndex || 0,
      isPersonalVoid: log.isPersonalVoid ? 1 : 0,
    }));

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error("Failed to fetch telemetry history:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 },
    );
  }
}

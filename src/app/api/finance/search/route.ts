import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    if (!q.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const isNumeric = /^\d+$/.test(q);

    const results = await prisma.company.findMany({
      where: {
        OR: [
          { company_name: { contains: q, mode: "insensitive" } },
          { security_code: { startsWith: q } },
        ],
      },
      take: 10,
      orderBy: {
        security_code: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      data: results.map((r) => ({
        code: r.security_code,
        name: r.company_name,
      })),
    });
  } catch (error: any) {
    console.error("Search API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search companies" },
      { status: 500 }
    );
  }
}

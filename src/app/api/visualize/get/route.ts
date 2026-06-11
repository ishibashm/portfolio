import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing component ID" },
        { status: 400 },
      );
    }

    const component = await prisma.visualizedComponent.findUnique({
      where: { id },
    });

    if (!component) {
      return NextResponse.json(
        { error: "Component not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, component });
  } catch (error: any) {
    console.error("Error fetching visualized component:", error);
    return NextResponse.json(
      { error: "Failed to fetch component" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

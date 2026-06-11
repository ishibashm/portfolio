import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing component ID" },
        { status: 400 },
      );
    }

    await prisma.visualizedComponent.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Component deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting visualized component:", error);
    return NextResponse.json(
      { error: "Failed to delete component" },
      { status: 500 },
    );
  }
}

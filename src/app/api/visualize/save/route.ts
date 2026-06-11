import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { id, title, style, inputData, cleanHtml } = await req.json();

    if (!title || !style || !inputData || !cleanHtml) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    let savedComponent;

    if (id) {
      // Update existing component
      savedComponent = await prisma.visualizedComponent.update({
        where: { id },
        data: {
          title,
          style,
          inputData:
            typeof inputData === "string" ? JSON.parse(inputData) : inputData,
          cleanHtml,
        },
      });
    } else {
      // Create new component
      savedComponent = await prisma.visualizedComponent.create({
        data: {
          title,
          style,
          inputData:
            typeof inputData === "string" ? JSON.parse(inputData) : inputData,
          cleanHtml,
        },
      });
    }

    return NextResponse.json({ success: true, component: savedComponent });
  } catch (error: any) {
    console.error("Error saving visualized component:", error);
    return NextResponse.json(
      { error: "Failed to save component" },
      { status: 500 },
    );
  }
}

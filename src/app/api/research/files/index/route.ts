import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "Filename is required" },
        { status: 400 },
      );
    }

    // Safety checks: must be a .md file and prevent directory traversal
    if (
      !filename.endsWith(".md") ||
      filename.includes("..") ||
      path.isAbsolute(filename)
    ) {
      return NextResponse.json(
        { error: "Invalid filename format" },
        { status: 400 },
      );
    }

    const filePath = path.join(process.cwd(), "x_downloads", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, "utf-8");

    // Extract the author handle from the filename (e.g., x_karpathy_data.md -> karpathy)
    const match = filename.match(/^x_(.*)_data\.md$/);
    const author = match ? match[1] : filename.replace(/\.md$/, "");

    // Save to the KnowledgeDocument table
    const document = await prisma.knowledgeDocument.create({
      data: {
        title: `X Intelligence: @${author}`,
        content: content,
        domain: "x.com",
        category: "Social Intelligence",
        type: "Note",
        status: "Draft",
        priority: "Medium",
      },
    });

    const formattedKbId = `KB${document.kb_id.toString().padStart(6, "0")}`;

    return NextResponse.json({
      success: true,
      kb_id: formattedKbId,
      title: document.title,
    });
  } catch (error) {
    console.error("Error indexing file to KB:", error);
    const message =
      error instanceof Error ? error.message : "Failed to index file to KB";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

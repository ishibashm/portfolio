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

    const filePath = path.join(process.cwd(), "audit_reports", filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, "utf-8");

    // Extract the city name from the filename (e.g., alignment_report_tokyo.md -> Tokyo)
    const match = filename.match(/^alignment_report_(.*)\.md$/);
    let city = "Unknown";
    if (match) {
      const rawCity = match[1];
      city = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
    }

    // Save to the KnowledgeDocument table
    const document = await prisma.knowledgeDocument.create({
      data: {
        title: `Alignment Audit: ${city}`,
        content: content,
        domain: "astro-geomagnetic",
        category: "Spatial Telemetry",
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

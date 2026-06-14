import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { getAuditDir } from "@/utils/auditHelper";

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("file");

  if (!filename || !filename.endsWith(".md")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const filePath = path.join(getAuditDir(), filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json(
      { error: "Failed to read file content" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAuditDir } from "@/utils/auditHelper";

export async function GET() {
  try {
    const auditDir = getAuditDir();

    if (!fs.existsSync(auditDir)) {
      return NextResponse.json({ files: [] });
    }

    const files = fs.readdirSync(auditDir);

    // Filter to only show markdown files and format them nicely
    const extractedData = files
      .filter(
        (file) => file.startsWith("alignment_report_") && file.endsWith(".md"),
      )
      .map((file) => {
        const filePath = path.join(auditDir, file);
        const stats = fs.statSync(filePath);

        // Extract the city name from the filename (e.g., alignment_report_tokyo.md -> Tokyo)
        const match = file.match(/^alignment_report_(.*)\.md$/);
        let city = "Unknown";
        if (match) {
          const rawCity = match[1];
          city = rawCity.charAt(0).toUpperCase() + rawCity.slice(1);
        }

        // Read the file to extract simulation span (days)
        const content = fs.readFileSync(filePath, "utf-8");
        const spanMatch = content.match(/Simulation Span: \*\*(\d+) Days\*\*/);
        const days = spanMatch ? parseInt(spanMatch[1], 10) : 10;

        return {
          filename: file,
          city: city,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
          days: days,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ); // Newest first

    return NextResponse.json({ files: extractedData });
  } catch (error) {
    console.error("Error reading audit_reports directory:", error);
    return NextResponse.json(
      { error: "Failed to read audit reports directory" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const downloadsDir = path.join(process.cwd(), "x_downloads");

    if (!fs.existsSync(downloadsDir)) {
      return NextResponse.json({ files: [] });
    }

    const files = fs.readdirSync(downloadsDir);

    // Filter to only show markdown files and format them nicely
    const extractedData = files
      .filter((file) => file.endsWith(".md"))
      .map((file) => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);

        // Extract the author handle from the filename (e.g., x_karpathy_data.md -> karpathy)
        const match = file.match(/^x_(.*)_data\.md$/);
        const author = match ? match[1] : file;

        // Read the first few lines to count tweets (rough estimate based on our format)
        const content = fs.readFileSync(filePath, "utf-8");
        const tweetCount = (content.match(/### Tweet ID:/g) || []).length;

        return {
          filename: file,
          author: author,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
          tweetCount: tweetCount,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ); // Newest first

    return NextResponse.json({ files: extractedData });
  } catch (error) {
    console.error("Error reading x_downloads directory:", error);
    return NextResponse.json(
      { error: "Failed to read downloads directory" },
      { status: 500 },
    );
  }
}

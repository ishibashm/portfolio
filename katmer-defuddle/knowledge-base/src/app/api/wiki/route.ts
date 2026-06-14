import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryPath = url.searchParams.get("path") || "index.md";

    const currentDir = process.cwd();
    const rootDir = currentDir.includes("knowledge-base")
      ? path.join(currentDir, "..")
      : currentDir;

    // Prevent directory traversal attacks
    const normalizedPath = path
      .normalize(queryPath)
      .replace(/^(\.\.[\/\\])+/, "");
    const finalPath = path.join(rootDir, "llm-wiki", normalizedPath);

    // Verify it is still inside llm-wiki
    if (!finalPath.startsWith(path.join(rootDir, "llm-wiki"))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    try {
      const stat = await fs.stat(finalPath);
      if (stat.isDirectory()) {
        // Read directory contents
        const files = await fs.readdir(finalPath);
        return NextResponse.json({ type: "directory", files });
      }

      // Read file content
      const content = await fs.readFile(finalPath, "utf-8");
      return NextResponse.json({ type: "file", content });
    } catch (err: any) {
      return NextResponse.json(
        {
          error: "File or directory not found",
          details: err.message,
          path: finalPath,
        },
        { status: 404 },
      );
    }
  } catch (error: any) {
    console.error("Wiki API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

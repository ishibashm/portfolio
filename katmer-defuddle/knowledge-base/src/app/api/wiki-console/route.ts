import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  try {
    const wikiDir = path.join(process.cwd(), "..", "llm-wiki");
    const indexFile = path.join(wikiDir, "index.md");
    const logFile = path.join(wikiDir, "log.md");

    let indexContent =
      "No index.md found. Auto-Librarian has not generated the wiki index yet.";
    let logContent =
      "No log.md found. Auto-Librarian activity logs will appear here.";

    if (fs.existsSync(indexFile)) {
      indexContent = fs.readFileSync(indexFile, "utf-8");
    }

    if (fs.existsSync(logFile)) {
      // ログが長すぎる場合は最新（末尾）の数千文字を取得するか、あるいはパースする
      const rawLog = fs.readFileSync(logFile, "utf-8");
      logContent = rawLog;
    }

    return NextResponse.json({
      indexMarkdown: indexContent,
      logMarkdown: logContent,
    });
  } catch (error) {
    console.error("Failed to read LLM Wiki files:", error);
    return NextResponse.json(
      { error: "Failed to read wiki files" },
      { status: 500 },
    );
  }
}

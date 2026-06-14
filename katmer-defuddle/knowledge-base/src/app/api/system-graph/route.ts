import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const currentDir = process.cwd();
    const rootDir = currentDir.includes("knowledge-base")
      ? path.join(currentDir, "..")
      : currentDir;
    // Graphify generates graph.json in graphify-out folder by default
    const graphJsonPath = path.join(rootDir, "graphify-out", "graph.json");

    try {
      await fs.access(graphJsonPath);
    } catch {
      return NextResponse.json(
        {
          nodes: [],
          links: [],
          message: "Graph not found. Please run run_graphify.bat first.",
        },
        { status: 404 },
      );
    }

    const fileContent = await fs.readFile(graphJsonPath, "utf-8");
    const graphData = JSON.parse(fileContent);

    return NextResponse.json(graphData);
  } catch (error: any) {
    console.error("System Graph API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

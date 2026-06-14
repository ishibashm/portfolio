import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), "public", "analytics_data.json");
    if (!fs.existsSync(dataPath)) {
      return NextResponse.json({
        generatedAt: null,
        topKeywords: [],
        categoryDistribution: [],
      });
    }

    const fileContent = fs.readFileSync(dataPath, "utf-8");
    const data = JSON.parse(fileContent);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load analytics data", error);
    return NextResponse.json(
      { error: "Failed to load analytics data" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const CONFIG_FILE_PATH = path.join(process.cwd(), "local_tactical_config.json");

export async function GET() {
  try {
    const fileContents = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
    const config = JSON.parse(fileContents);
    return NextResponse.json(config);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return NextResponse.json({}, { status: 404 });
    }
    console.error("Config Load Error:", error);
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    let currentConfig = {};
    try {
      const fileContents = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
      currentConfig = JSON.parse(fileContents);
    } catch (e) {
      // Ignore if file doesn't exist
    }

    const body = await req.json();
    const updatedConfig = { ...currentConfig, ...body };

    await fs.writeFile(
      CONFIG_FILE_PATH,
      JSON.stringify(updatedConfig, null, 2),
      "utf-8",
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Config Save Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save config" },
      { status: 500 },
    );
  }
}

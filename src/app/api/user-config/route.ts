import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";

const CONFIG_FILE_PATH = path.join(process.cwd(), "local_tactical_config.json");
const DEFAULT_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

export async function GET() {
  let config: Record<string, any> = {};

  // 1. Try reading from local JSON file
  try {
    const fileContents = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
    config = JSON.parse(fileContents);
  } catch (e) {
    // File not found or read error
  }

  // 2. Try fetching from Cloud Database (Supabase PostgreSQL via Prisma)
  try {
    const dbConfig = await prisma.user_configs.findFirst({
      where: { user_email: DEFAULT_EMAIL },
    });

    if (dbConfig) {
      config = {
        ...config,
        birth_date: dbConfig.birth_date ?? config.birth_date,
        birth_lat: dbConfig.birth_lat ?? config.birth_lat,
        birth_lon: dbConfig.birth_lon ?? config.birth_lon,
        base_lat: dbConfig.base_lat ?? config.base_lat,
        base_lon: dbConfig.base_lon ?? config.base_lon,
        baseline_hrv_mean: dbConfig.baseline_hrv_mean ?? config.baseline_hrv_mean,
        baseline_hrv_std: dbConfig.baseline_hrv_std ?? config.baseline_hrv_std,
        baseline_gsr_mean: dbConfig.baseline_gsr_mean ?? config.baseline_gsr_mean,
        baseline_gsr_std: dbConfig.baseline_gsr_std ?? config.baseline_gsr_std,
        base_sync_timestamp: dbConfig.base_sync_timestamp
          ? dbConfig.base_sync_timestamp.toISOString()
          : config.base_sync_timestamp,
      };
    }
  } catch (dbError) {
    console.warn("Database config fetch notice (falling back to local file):", dbError);
  }

  return NextResponse.json(config);
}

export async function POST(req: Request) {
  try {
    let currentConfig: Record<string, any> = {};

    try {
      const fileContents = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
      currentConfig = JSON.parse(fileContents);
    } catch (e) {
      // Ignore if file doesn't exist
    }

    const body = await req.json();
    const updatedConfig = { ...currentConfig, ...body };

    // 1. Write to local JSON file
    try {
      await fs.writeFile(
        CONFIG_FILE_PATH,
        JSON.stringify(updatedConfig, null, 2),
        "utf-8",
      );
    } catch (fileErr) {
      console.warn("Local file save skipped (likely read-only/serverless environment)");
    }

    // 2. Sync to Cloud Database (Supabase PostgreSQL via Prisma)
    try {
      await prisma.user_configs.upsert({
        where: { user_email: DEFAULT_EMAIL },
        update: {
          birth_date: updatedConfig.birth_date ?? null,
          birth_lat: updatedConfig.birth_lat != null ? Number(updatedConfig.birth_lat) : null,
          birth_lon: updatedConfig.birth_lon != null ? Number(updatedConfig.birth_lon) : null,
          base_lat: updatedConfig.base_lat != null ? Number(updatedConfig.base_lat) : null,
          base_lon: updatedConfig.base_lon != null ? Number(updatedConfig.base_lon) : null,
          baseline_hrv_mean: updatedConfig.baseline_hrv_mean != null ? Number(updatedConfig.baseline_hrv_mean) : null,
          baseline_hrv_std: updatedConfig.baseline_hrv_std != null ? Number(updatedConfig.baseline_hrv_std) : null,
          baseline_gsr_mean: updatedConfig.baseline_gsr_mean != null ? Number(updatedConfig.baseline_gsr_mean) : null,
          baseline_gsr_std: updatedConfig.baseline_gsr_std != null ? Number(updatedConfig.baseline_gsr_std) : null,
          base_sync_timestamp: updatedConfig.base_sync_timestamp
            ? new Date(updatedConfig.base_sync_timestamp)
            : null,
          updated_at: new Date(),
        },
        create: {
          user_email: DEFAULT_EMAIL,
          birth_date: updatedConfig.birth_date ?? null,
          birth_lat: updatedConfig.birth_lat != null ? Number(updatedConfig.birth_lat) : null,
          birth_lon: updatedConfig.birth_lon != null ? Number(updatedConfig.birth_lon) : null,
          base_lat: updatedConfig.base_lat != null ? Number(updatedConfig.base_lat) : null,
          base_lon: updatedConfig.base_lon != null ? Number(updatedConfig.base_lon) : null,
          baseline_hrv_mean: updatedConfig.baseline_hrv_mean != null ? Number(updatedConfig.baseline_hrv_mean) : null,
          baseline_hrv_std: updatedConfig.baseline_hrv_std != null ? Number(updatedConfig.baseline_hrv_std) : null,
          baseline_gsr_mean: updatedConfig.baseline_gsr_mean != null ? Number(updatedConfig.baseline_gsr_mean) : null,
          baseline_gsr_std: updatedConfig.baseline_gsr_std != null ? Number(updatedConfig.baseline_gsr_std) : null,
          base_sync_timestamp: updatedConfig.base_sync_timestamp
            ? new Date(updatedConfig.base_sync_timestamp)
            : null,
        },
      });
    } catch (dbErr) {
      console.warn("Database config sync notice:", dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Config Save Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save config" },
      { status: 500 },
    );
  }
}

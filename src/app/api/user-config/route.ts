import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";
import { findUserConfig, getAuthUser, type AuthUser, toUserId } from "@/lib/userConfig";

const CONFIG_FILE_PATH = path.join(process.cwd(), "local_tactical_config.json");
const DEFAULT_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

// Every read and write here targets the single DEFAULT_EMAIL row, which holds
// the owner's birth date, birth and base coordinates and biometric baselines.
// 認可はこれまでどおりメールアドレスで判定するが、行の特定には user.id を使う。
// メールアドレスは変更できるため、行のキーとしては当てにできない。
type OwnerCheck =
  | { user: AuthUser; denied?: undefined }
  | { user?: undefined; denied: NextResponse };

async function requireOwner(): Promise<OwnerCheck> {
  const user = await getAuthUser();
  if (!user || user.email !== DEFAULT_EMAIL.toLowerCase()) {
    return {
      denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}

export async function GET() {
  const { user, denied } = await requireOwner();
  if (denied) return denied;

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
    const dbConfig = await findUserConfig(user);

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
  const { user, denied } = await requireOwner();
  if (denied) return denied;

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
      const num = (v: unknown) => (v != null ? Number(v) : null);
      const fields = {
        birth_date: updatedConfig.birth_date ?? null,
        birth_lat: num(updatedConfig.birth_lat),
        birth_lon: num(updatedConfig.birth_lon),
        base_lat: num(updatedConfig.base_lat),
        base_lon: num(updatedConfig.base_lon),
        baseline_hrv_mean: num(updatedConfig.baseline_hrv_mean),
        baseline_hrv_std: num(updatedConfig.baseline_hrv_std),
        baseline_gsr_mean: num(updatedConfig.baseline_gsr_mean),
        baseline_gsr_std: num(updatedConfig.baseline_gsr_std),
        base_sync_timestamp: updatedConfig.base_sync_timestamp
          ? new Date(updatedConfig.base_sync_timestamp)
          : null,
      };

      // 移行前の行は user_id が NULL のため、user_id 指定の upsert では
      // 既存行と結び付かず別の行ができてしまう。先に既存行を解決する。
      const existing = await findUserConfig(user);
      if (existing) {
        await prisma.user_configs.update({
          where: { id: existing.id },
          data: { ...fields, updated_at: new Date() },
        });
      } else {
        await prisma.user_configs.create({
          data: { user_id: toUserId(user), user_email: user.email, ...fields },
        });
      }
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

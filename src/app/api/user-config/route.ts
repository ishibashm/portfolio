import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const CONFIG_FILE_PATH = path.join(process.cwd(), "local_tactical_config.json");

const profilePresetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    birthDate: z.string(),
    birthLat: z.number().finite(),
    birthLon: z.number().finite(),
    baseLat: z.number().finite(),
    baseLon: z.number().finite(),
    voidZodiacOverride: z.string().optional(),
    baselineHrvMean: z.number().finite().optional(),
    baselineHrvStd: z.number().finite().optional(),
    baselineGsrMean: z.number().finite().optional(),
    baselineGsrStd: z.number().finite().optional(),
    usePsychologyScorer: z.boolean().optional(),
    useKigakuScorer: z.boolean().optional(),
    useAstrologyScorer: z.boolean().optional(),
    createdAt: z.string(),
  })
  .strip();

const presetsSchema = z.array(profilePresetSchema).max(100);
type ConfigRecord = Record<string, unknown>;

async function getAuthenticatedEmail() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;
  return user.email.toLowerCase();
}

async function readLocalDefaults(): Promise<ConfigRecord> {
  try {
    const fileContents = await fs.readFile(CONFIG_FILE_PATH, "utf-8");
    const parsed: unknown = JSON.parse(fileContents);
    return parsed && typeof parsed === "object"
      ? (parsed as ConfigRecord)
      : {};
  } catch {
    return {};
  }
}

function numberOrNull(value: unknown) {
  return value == null || value === "" ? null : Number(value);
}

function dateOrNull(value: unknown) {
  return typeof value === "string" && value ? new Date(value) : null;
}

function serializeDbConfig(
  dbConfig: Awaited<ReturnType<typeof prisma.user_configs.findUnique>>,
) {
  if (!dbConfig) return {};

  return {
    birth_date: dbConfig.birth_date,
    birth_lat: dbConfig.birth_lat,
    birth_lon: dbConfig.birth_lon,
    base_lat: dbConfig.base_lat,
    base_lon: dbConfig.base_lon,
    baseline_hrv_mean: dbConfig.baseline_hrv_mean,
    baseline_hrv_std: dbConfig.baseline_hrv_std,
    baseline_gsr_mean: dbConfig.baseline_gsr_mean,
    baseline_gsr_std: dbConfig.baseline_gsr_std,
    base_sync_timestamp: dbConfig.base_sync_timestamp?.toISOString() ?? null,
    presets: Array.isArray(dbConfig.presets) ? dbConfig.presets : [],
    presets_initialized: dbConfig.presets !== null,
  };
}

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const [localDefaults, dbConfig] = await Promise.all([
      adminEmail === email ? readLocalDefaults() : Promise.resolve({}),
      prisma.user_configs.findUnique({
        where: { user_email: email },
      }),
    ]);

    return NextResponse.json({
      ...localDefaults,
      ...serializeDbConfig(dbConfig),
    });
  } catch (error) {
    console.error("Cloud config fetch failed:", error);
    return NextResponse.json(
      { error: "Cloud config is temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid config payload" },
        { status: 400 },
      );
    }

    const incomingConfig = body as ConfigRecord;
    const currentConfig = await prisma.user_configs.findUnique({
      where: { user_email: email },
    });

    let presets: Prisma.InputJsonValue | typeof Prisma.DbNull =
      currentConfig?.presets ?? Prisma.DbNull;
    if ("presets" in incomingConfig) {
      const parsedPresets = presetsSchema.safeParse(incomingConfig.presets);
      if (!parsedPresets.success) {
        return NextResponse.json(
          { error: "Invalid profile presets" },
          { status: 400 },
        );
      }
      presets = parsedPresets.data as Prisma.InputJsonValue;
    }

    const updatedConfig = {
      birth_date:
        typeof incomingConfig.birth_date === "string"
          ? incomingConfig.birth_date
          : (currentConfig?.birth_date ?? null),
      birth_lat:
        "birth_lat" in incomingConfig
          ? numberOrNull(incomingConfig.birth_lat)
          : (currentConfig?.birth_lat ?? null),
      birth_lon:
        "birth_lon" in incomingConfig
          ? numberOrNull(incomingConfig.birth_lon)
          : (currentConfig?.birth_lon ?? null),
      base_lat:
        "base_lat" in incomingConfig
          ? numberOrNull(incomingConfig.base_lat)
          : (currentConfig?.base_lat ?? null),
      base_lon:
        "base_lon" in incomingConfig
          ? numberOrNull(incomingConfig.base_lon)
          : (currentConfig?.base_lon ?? null),
      baseline_hrv_mean:
        "baseline_hrv_mean" in incomingConfig
          ? numberOrNull(incomingConfig.baseline_hrv_mean)
          : (currentConfig?.baseline_hrv_mean ?? null),
      baseline_hrv_std:
        "baseline_hrv_std" in incomingConfig
          ? numberOrNull(incomingConfig.baseline_hrv_std)
          : (currentConfig?.baseline_hrv_std ?? null),
      baseline_gsr_mean:
        "baseline_gsr_mean" in incomingConfig
          ? numberOrNull(incomingConfig.baseline_gsr_mean)
          : (currentConfig?.baseline_gsr_mean ?? null),
      baseline_gsr_std:
        "baseline_gsr_std" in incomingConfig
          ? numberOrNull(incomingConfig.baseline_gsr_std)
          : (currentConfig?.baseline_gsr_std ?? null),
      base_sync_timestamp:
        "base_sync_timestamp" in incomingConfig
          ? dateOrNull(incomingConfig.base_sync_timestamp)
          : (currentConfig?.base_sync_timestamp ?? null),
      presets,
      updated_at: new Date(),
    };

    await prisma.user_configs.upsert({
      where: { user_email: email },
      update: updatedConfig,
      create: {
        user_email: email,
        ...updatedConfig,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cloud config save failed:", error);
    return NextResponse.json(
      { error: "Cloud config could not be saved" },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "@/utils/encryption";
import { createClient } from "@/utils/supabase/server";

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
    geminiKey: z.string().optional(),
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

const storedProfilePresetSchema = profilePresetSchema
  .omit({ geminiKey: true })
  .extend({ encryptedGeminiKey: z.string().optional() })
  .strip();

const requestSchema = z.object({
  presets: z.array(profilePresetSchema).max(100),
});

async function getAuthenticatedEmail() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;
  return user.email.toLowerCase();
}

function encodePreset(
  preset: z.infer<typeof profilePresetSchema>,
): Prisma.InputJsonObject {
  const { geminiKey, ...safeFields } = preset;
  return {
    ...safeFields,
    ...(geminiKey ? { encryptedGeminiKey: encrypt(geminiKey) } : {}),
  };
}

function decodePresets(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    const parsed = storedProfilePresetSchema.safeParse(candidate);
    if (!parsed.success) return [];

    const { encryptedGeminiKey, ...safeFields } = parsed.data;
    const geminiKey = encryptedGeminiKey
      ? decrypt(encryptedGeminiKey)
      : null;

    return [
      {
        ...safeFields,
        ...(geminiKey ? { geminiKey } : {}),
      },
    ];
  });
}

export async function GET() {
  try {
    const email = await getAuthenticatedEmail();
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await prisma.user_configs.findUnique({
      where: { user_email: email },
      select: { presets: true },
    });

    return NextResponse.json({
      presets: decodePresets(config?.presets ?? null),
      presets_initialized: config?.presets !== null && config !== null,
    });
  } catch (error) {
    console.error("Cloud presets fetch failed:", error);
    return NextResponse.json(
      { error: "Cloud presets are temporarily unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const email = await getAuthenticatedEmail();
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid profile presets" },
        { status: 400 },
      );
    }

    const presets = parsed.data.presets.map(encodePreset);
    await prisma.user_configs.upsert({
      where: { user_email: email },
      update: {
        presets,
        updated_at: new Date(),
      },
      create: {
        user_email: email,
        presets,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cloud presets save failed:", error);
    return NextResponse.json(
      { error: "Cloud presets could not be saved" },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "@/utils/encryption";
import { findUserConfig, getAuthUser, toUserId } from "@/lib/userConfig";

/*
  項目の定義は検査（refine）を付けずに置く。zod は refine 付きの
  オブジェクトに .omit() を使えない（保存用の派生で落ちる）。
*/
const profilePresetFields = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    birthDate: z.string(),
    // 出生地は任意（現住地は必須）。入れていない控えを既定値で埋めると、
    // サイト全体が「出生地を登録済み」として読み、天体ラインの加点が
    // 東京または現住地で生まれた人として付く（CLAUDE.md 3 節）。
    birthLat: z.number().finite().optional(),
    birthLon: z.number().finite().optional(),
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
    // Relocation Matrix 固有。.strip() があるため、ここに書かないと往復で落ちる。
    targetDate: z.string().optional(),
    engineType: z.string().optional(),
    layerMode: z.string().optional(),
    createdAt: z.string(),
  })
  .strip();

/*
  **緯度と経度は必ず揃える。**片方だけ来たら弾く。読む側が「有る」と見て
  NaN を計算に入れるため。受け取る側と保存する側の両方に掛ける。
*/
const birthPlacePaired = (v: { birthLat?: number; birthLon?: number }) =>
  (v.birthLat === undefined) === (v.birthLon === undefined);
const BIRTH_PLACE_PAIR_MESSAGE =
  "birthLat と birthLon は両方指定するか、両方省くこと";

const profilePresetSchema = profilePresetFields.refine(birthPlacePaired, {
  message: BIRTH_PLACE_PAIR_MESSAGE,
});

const storedProfilePresetSchema = profilePresetFields
  .omit({ geminiKey: true })
  .extend({ encryptedGeminiKey: z.string().optional() })
  .strip()
  .refine(birthPlacePaired, { message: BIRTH_PLACE_PAIR_MESSAGE });

const requestSchema = z.object({
  presets: z.array(profilePresetSchema).max(100),
});

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
    const geminiKey = encryptedGeminiKey ? decrypt(encryptedGeminiKey) : null;

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
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await findUserConfig(user);

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
    const user = await getAuthUser();
    if (!user) {
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
    // upsert は一意キー1本しか見られないが、移行前の行は user_id が NULL で
    // user_id 指定の upsert が新しい行を作ってしまう。既存行を先に解決する。
    const existing = await findUserConfig(user);
    if (existing) {
      await prisma.user_configs.update({
        where: { id: existing.id },
        data: { presets, updated_at: new Date() },
      });
    } else {
      await prisma.user_configs.create({
        data: {
          user_id: toUserId(user),
          user_email: user.email,
          presets,
          // 行の作成＝はじめての保存。登録日として管理ページが数える。
          created_at: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cloud presets save failed:", error);
    return NextResponse.json(
      { error: "Cloud presets could not be saved" },
      { status: 503 },
    );
  }
}

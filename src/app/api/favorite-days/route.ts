import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import { toLogMessage } from "@/lib/errorMessage";
import { TokenBucket, isSameOrigin } from "@/lib/apiGuard";
import { isWorkingDate } from "@/lib/workingDate";
import {
  FAVORITE_DAYS_LIMIT,
  favoriteVerdictSchema,
  type FavoriteDay,
} from "@/lib/favoriteDays";

/**
 * 日取りのお気に入りをアカウントに残す口。
 *
 * 利用者の判断（2026-09-29）「日取りのお気に入りもアカウントに保存して
 * いいよ」。表は favorite_days（prisma/sql/20260929_add_favorite_days.sql）。
 *
 * ## 入るのは個人情報
 *
 * 1 行は「日付 × 方位」と保存時の判定の表示。生年月日と座標は入らないが、
 * 判定は生年月日から出た結果なので、/api/saved-analyses と同じ守りにする。
 *
 * 1. **ログイン必須**。開発バイパスの偽 id では書かせない（toUserId）
 * 2. **本人の行しか触らない**。where に必ず user_id
 * 3. **キャッシュに載せない**（force-dynamic・no-store）
 * 4. **ログに中身を出さない**（toLogMessage の 1 行だけ）
 * 5. **書き込みは同一オリジンから**（isSameOrigin）
 * 6. **件数と長さの上限をサーバーでも見る**。DB でも CHECK で縛ってある
 *
 * 応答の error は画面に出しうるので日本語。
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;

/** 書き込みの回数。1 人あたり。☆ を続けて押す程度は通し、自動化は抑える */
const writeBucket = new TokenBucket(40, 1 / 1_500);

const directionSchema = z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
const daySchema = z.string().refine(isWorkingDate);

const bodySchema = z.object({
  date: daySchema,
  direction: directionSchema,
  verdict: favoriteVerdictSchema,
});

async function currentUserId(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return toUserId(user);
}

const unauthorized = () =>
  NextResponse.json(
    { error: "ログインすると、お気に入りの日取りをアカウントに残せます。" },
    { status: 401, headers: NO_STORE },
  );

const forbiddenOrigin = () =>
  NextResponse.json(
    { error: "この要求は受け付けられません。" },
    { status: 403, headers: NO_STORE },
  );

function tooManyWrites(userId: string, now: number) {
  return NextResponse.json(
    { error: "操作が続きすぎています。少し待ってからお試しください。" },
    {
      status: 429,
      headers: {
        ...NO_STORE,
        "retry-after": String(
          Math.max(1, writeBucket.retryAfterSec(userId, now)),
        ),
      },
    },
  );
}

const SELECT = {
  day: true,
  direction: true,
  verdict: true,
  created_at: true,
} as const;

/** 行を画面の形に戻す。表示が壊れている行（手で書き換えた等）は捨てる */
function toFavorite(r: {
  day: string;
  direction: string;
  verdict: unknown;
  created_at: Date;
}): FavoriteDay | null {
  const v = favoriteVerdictSchema.safeParse(r.verdict);
  if (!v.success || !isWorkingDate(r.day)) return null;
  return {
    date: r.day,
    direction: r.direction,
    ...v.data,
    savedAt: r.created_at.toISOString(),
  };
}

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();
    const rows = await prisma.favoriteDay.findMany({
      where: { user_id: userId },
      orderBy: { day: "asc" },
      take: FAVORITE_DAYS_LIMIT,
      select: SELECT,
    });
    return NextResponse.json(
      {
        favorites: rows
          .map(toFavorite)
          .filter((f): f is FavoriteDay => f !== null),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to load favorite days:", toLogMessage(error));
    return NextResponse.json(
      { error: "お気に入りの日取りを読み込めませんでした。" },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return forbiddenOrigin();
    const userId = await currentUserId();
    if (!userId) return unauthorized();

    const now = Date.now();
    if (!writeBucket.take(userId, now)) return tooManyWrites(userId, now);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "お気に入りの日付と方位を確かめてください。" },
        { status: 400, headers: NO_STORE },
      );
    }
    const { date, direction, verdict } = parsed.data;
    const key = { user_id: userId, day: date, direction };

    const exists = await prisma.favoriteDay.findUnique({
      where: { user_id_day_direction: key },
      select: { id: true },
    });
    if (!exists) {
      const count = await prisma.favoriteDay.count({
        where: { user_id: userId },
      });
      if (count >= FAVORITE_DAYS_LIMIT) {
        return NextResponse.json(
          {
            error: `アカウントに残せるお気に入りの日取りは ${FAVORITE_DAYS_LIMIT} 件までです。使わないものを外してから追加してください。`,
          },
          { status: 409, headers: NO_STORE },
        );
      }
    }
    await prisma.favoriteDay.upsert({
      where: { user_id_day_direction: key },
      create: { ...key, verdict },
      update: { verdict },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to save favorite day:", toLogMessage(error));
    return NextResponse.json(
      { error: "お気に入りの日取りを保存できませんでした。" },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return forbiddenOrigin();
    const userId = await currentUserId();
    if (!userId) return unauthorized();

    const now = Date.now();
    if (!writeBucket.take(userId, now)) return tooManyWrites(userId, now);

    const params = new URL(req.url).searchParams;
    const date = daySchema.safeParse(params.get("date"));
    const direction = directionSchema.safeParse(params.get("direction"));
    if (!date.success || !direction.success) {
      return NextResponse.json(
        { error: "外すお気に入りが指定されていません。" },
        { status: 400, headers: NO_STORE },
      );
    }
    /* user_id を必ず併せて指す（他人の行は消えない） */
    await prisma.favoriteDay.deleteMany({
      where: { user_id: userId, day: date.data, direction: direction.data },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to delete favorite day:", toLogMessage(error));
    return NextResponse.json(
      { error: "お気に入りの日取りを外せませんでした。" },
      { status: 503, headers: NO_STORE },
    );
  }
}

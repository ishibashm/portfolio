import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import { toLogMessage } from "@/lib/errorMessage";
import { TokenBucket, isSameOrigin } from "@/lib/apiGuard";

/**
 * 時期の分析（全期間の分析・/calendar の吉日）をアカウントに残す口。
 *
 * 利用者の判断（2026-09-26）「DB で保存してもいいかな。保存する方向で
 * 進めていいよ」。表は saved_analyses（prisma/sql/20260926_add_saved_analyses.sql）。
 *
 * ## 入るのは個人情報
 *
 * 本文は lib/timingReport の Markdown（生年月日と座標は入らない）。
 * 本命星・空亡・方位ごとの吉日は生年月日から出た結果なので、
 * /api/spots と同じ守りにする。
 *
 * 1. **ログイン必須**。開発バイパスの偽 id では書かせない（toUserId）
 * 2. **本人の行しか触らない**。where に必ず user_id。削除も
 *    deleteMany({ id, user_id }) で、他人の id を指しても消えない
 * 3. **キャッシュに載せない**（force-dynamic・no-store）
 * 4. **ログに本文も名前も出さない**（toLogMessage の 1 行だけ）
 * 5. **書き込みは同一オリジンから**（isSameOrigin）
 * 6. **件数と長さの上限をサーバーでも見る**。DB でも CHECK で縛ってある
 *
 * 応答の error は画面の帯に出るので日本語。
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;

/** 1 人あたりに残せる件数。 */
const MAX_SAVED_ANALYSES = 50;
const MAX_MARKDOWN = 32768;

/** 書き込みの回数。1 人あたり。連打と自動化の両方を抑える。 */
const writeBucket = new TokenBucket(20, 1 / 3_000);

/* 制御文字（改行・タブ以外）を落とす。本文は Markdown なので改行は残す */
const stripControl = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const kindSchema = z.enum(["timing", "calendar"]);

const bodySchema = z.object({
  kind: kindSchema,
  name: z
    .string()
    .transform((s) => stripControl(s).replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(60)),
  markdown: z
    .string()
    .transform(stripControl)
    .pipe(z.string().min(1).max(MAX_MARKDOWN)),
});

const idSchema = z.string().min(1).max(64);

async function currentUserId(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return toUserId(user);
}

const unauthorized = () =>
  NextResponse.json(
    { error: "ログインすると、分析をアカウントに残せます。" },
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
  id: true,
  kind: true,
  name: true,
  markdown: true,
  created_at: true,
} as const;

function toJson(r: {
  id: string;
  kind: string;
  name: string;
  markdown: string;
  created_at: Date;
}) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    markdown: r.markdown,
    savedAt: r.created_at.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();

    const kind = kindSchema.safeParse(
      new URL(req.url).searchParams.get("kind"),
    );
    const rows = await prisma.savedAnalysis.findMany({
      where: {
        user_id: userId,
        ...(kind.success ? { kind: kind.data } : {}),
      },
      orderBy: { created_at: "desc" },
      take: MAX_SAVED_ANALYSES,
      /* user_id は本人にも返さない（使い道が無く、漏れる面だけが増える） */
      select: SELECT,
    });
    return NextResponse.json(
      { analyses: rows.map(toJson) },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to load saved analyses:", toLogMessage(error));
    return NextResponse.json(
      { error: "保存した分析を読み込めませんでした。" },
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
      /* 何が悪かったかは返さない（本文をそのまま返すと画面やログに回りやすい） */
      return NextResponse.json(
        { error: "分析の名前と中身を確かめてください。" },
        { status: 400, headers: NO_STORE },
      );
    }

    const count = await prisma.savedAnalysis.count({
      where: { user_id: userId },
    });
    if (count >= MAX_SAVED_ANALYSES) {
      return NextResponse.json(
        {
          error: `アカウントに残せる分析は ${MAX_SAVED_ANALYSES} 件までです。使わないものを消してから保存してください。`,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const saved = await prisma.savedAnalysis.create({
      data: { user_id: userId, ...parsed.data },
      select: SELECT,
    });
    return NextResponse.json(
      { analysis: toJson(saved) },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to save analysis:", toLogMessage(error));
    return NextResponse.json(
      { error: "分析を保存できませんでした。" },
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

    const parsed = idSchema.safeParse(new URL(req.url).searchParams.get("id"));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "消す分析が指定されていません。" },
        { status: 400, headers: NO_STORE },
      );
    }
    /* user_id を必ず併せて指す（他人の id を当てられても消えない） */
    await prisma.savedAnalysis.deleteMany({
      where: { id: parsed.data, user_id: userId },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to delete saved analysis:", toLogMessage(error));
    return NextResponse.json(
      { error: "分析を消せませんでした。" },
      { status: 503, headers: NO_STORE },
    );
  }
}

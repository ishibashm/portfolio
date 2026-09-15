import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getAuthUser, toUserId } from "@/lib/userConfig";
import { toLogMessage } from "@/lib/errorMessage";
import { TokenBucket, isSameOrigin } from "@/lib/apiGuard";
import {
  MAX_USER_SPOTS,
  normalizeSpotMemo,
  normalizeSpotName,
  normalizeSpotUrl,
  pointKey,
} from "@/lib/userSpotKey";

/**
 * 利用者が登録した地点（お気に入りの場所）の出し入れ。
 *
 * 利用者の依頼（2026-09-13）で localStorage から DB へ移した。
 *
 * ## 入るのは個人情報
 *
 * 「実家」「候補の物件」のような**名前と座標**。以下は全部そのための決め。
 *
 * 1. **ログイン必須。**匿名では読み書きさせない
 * 2. **本人の行しか触らない。**`where` に必ず `user_id` を入れる。削除も
 *    `deleteMany({ id, user_id })` で、**他人の id を指しても消えない**
 *    （id が推測しにくいことに頼らない）
 * 3. **開発バイパスの偽 id では書かせない**（`toUserId` が null を返す）
 * 4. **キャッシュに載せない。**`force-dynamic` と `no-store`。個人の座標が
 *    CDN やブラウザの戻る操作で他人に見えることを避ける
 * 5. **ログに座標も名前も出さない。**`toLogMessage` の 1 行だけ。CLAUDE.md
 *    6 節（生年月日・座標・URL・IP・UA は残さない）
 * 6. **書き込みは同一オリジンから**（`isSameOrigin`）。Supabase の cookie は
 *    SameSite だが、二枚目として置く
 * 7. **件数の上限をサーバー側でも見る**（`MAX_USER_SPOTS`）。画面の上限を
 *    信じない
 * 8. **`point_key` はサーバーで組む。**利用者が送ってきた鍵を信じると、
 *    他人の行と衝突する鍵を作られる
 *
 * 応答の error は画面の帯に出るので**日本語**（CLAUDE.md 4 節の表）。
 */

export const dynamic = "force-dynamic";

/** 個人の座標。キャッシュに載せない。 */
const NO_STORE = { "cache-control": "no-store, max-age=0" } as const;

/** 書き込みの回数。1 人あたり。連打と自動化の両方を抑える。 */
const writeBucket = new TokenBucket(20, 1 / 3_000);

const spotSchema = z.object({
  /* 制御文字を落としてから長さで見る。整え方は画面側と同じ関数を通す
     （片方だけ緩い、という穴を作らない） */
  name: z.string().transform(normalizeSpotName).pipe(z.string().min(1).max(60)),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  /*
    物件ページへの印（2026-09-15。利用者の依頼）。**https だけ。**

    画面でリンクとして描くので、javascript: や data: を入口で落とす
    （`normalizeSpotUrl`）。**中身は取りに行かない。**取りに行けば
    スクレイピングで、nifty の特約が名指しで禁じている（backlog 29 節）。

    省略・空・不正はどれも null にする。**400 で断らない。**URL は
    おまけの欄で、綴りが違うだけで地点の保存ごと失敗させると、名前と
    座標まで入れ直しになる。
  */
  url: z.unknown().optional().transform(normalizeSpotUrl),
  memo: z.unknown().optional().transform(normalizeSpotMemo),
});

const idSchema = z.string().min(1).max(64);

/** ログイン中の本人の uuid。開発バイパスの偽 id では書かせない。 */
async function currentUserId(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return toUserId(user);
}

function unauthorized() {
  return NextResponse.json(
    { error: "ログインすると、登録した地点を端末をまたいで残せます。" },
    { status: 401, headers: NO_STORE },
  );
}

function forbiddenOrigin() {
  return NextResponse.json(
    { error: "この要求は受け付けられません。" },
    { status: 403, headers: NO_STORE },
  );
}

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

export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return unauthorized();

    const rows = await prisma.userSpot.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "asc" },
      take: MAX_USER_SPOTS,
      /* 返すのは画面が要る欄だけ。user_id は本人にも返さない（使い道が
         無く、漏れる面だけが増える） */
      select: {
        id: true,
        name: true,
        lat: true,
        lon: true,
        url: true,
        memo: true,
        created_at: true,
      },
    });

    return NextResponse.json(
      {
        spots: rows.map((r) => ({
          id: r.id,
          name: r.name,
          lat: r.lat,
          lon: r.lon,
          url: r.url,
          memo: r.memo,
          createdAt: r.created_at.toISOString(),
        })),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to load user spots:", toLogMessage(error));
    return NextResponse.json(
      { error: "登録した地点を読み込めませんでした。" },
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

    const body = await req.json().catch(() => null);
    const parsed = spotSchema.safeParse(body);
    if (!parsed.success) {
      /* 何が悪かったかは返さない（送られた値をそのまま返すと、座標が画面や
         ログに回りやすくなる）。入力は画面側が組むので、ここへ来るのは
         想定外の呼び出し */
      return NextResponse.json(
        { error: "地点の名前と座標を確かめてください。" },
        { status: 400, headers: NO_STORE },
      );
    }

    const { name, lat, lon, url, memo } = parsed.data;
    const key = pointKey(lat, lon);

    /* 上限はサーバー側でも見る。**既にある地点の名前を変えるだけなら上限に
       関係なく通す**（そうしないと 50 件の人が名前を直せない） */
    const existing = await prisma.userSpot.findUnique({
      where: { user_id_point_key: { user_id: userId, point_key: key } },
      select: { id: true },
    });
    if (!existing) {
      const count = await prisma.userSpot.count({ where: { user_id: userId } });
      if (count >= MAX_USER_SPOTS) {
        return NextResponse.json(
          {
            error: `登録できる地点は ${MAX_USER_SPOTS} 件までです。使わない地点を消してから登録してください。`,
          },
          { status: 409, headers: NO_STORE },
        );
      }
    }

    const saved = await prisma.userSpot.upsert({
      where: { user_id_point_key: { user_id: userId, point_key: key } },
      create: { user_id: userId, name, lat, lon, url, memo, point_key: key },
      /* 同じ地点は重ねず、名前と印だけ差し替える（画面側の `withUserSpot` と
         同じ規則）。座標は鍵と同じものなので触らない。
         **url / memo は送られたとおりに置く。**空で送れば消せる、という
         一貫した意味にする（消すために別の口を作らない） */
      update: { name, url, memo },
      select: {
        id: true,
        name: true,
        lat: true,
        lon: true,
        url: true,
        memo: true,
        created_at: true,
      },
    });

    return NextResponse.json(
      {
        spot: {
          id: saved.id,
          name: saved.name,
          lat: saved.lat,
          lon: saved.lon,
          url: saved.url,
          memo: saved.memo,
          createdAt: saved.created_at.toISOString(),
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Failed to save user spot:", toLogMessage(error));
    return NextResponse.json(
      { error: "地点を保存できませんでした。" },
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
        { error: "消す地点が指定されていません。" },
        { status: 400, headers: NO_STORE },
      );
    }

    /* **`user_id` を必ず併せて指す。**id だけで消せる作りにすると、他人の
       id を当てられたときに他人の地点が消える。入っていないものを消そうと
       しても失敗にしない（画面側の状態とずれていたときに、押しても消えない
       ほうが分かりにくい）。 */
    await prisma.userSpot.deleteMany({
      where: { id: parsed.data, user_id: userId },
    });

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to delete user spot:", toLogMessage(error));
    return NextResponse.json(
      { error: "地点を消せませんでした。" },
      { status: 503, headers: NO_STORE },
    );
  }
}

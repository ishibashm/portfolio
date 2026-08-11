import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser } from "@/lib/userConfig";
import { createClient } from "@/utils/supabase/server";
import {
  COMMENTS_PAGE_SIZE,
  COMMENTS_PER_USER_PER_DAY,
  displayNameFor,
  isValidTopicKey,
  validateCommentInput,
} from "@/lib/comments";

/**
 * 方位・日取りについての投稿。
 *
 * 一覧は誰でも読める（読ませないと記事の中身にならない）。
 * 投稿はログイン必須。匿名を許すとレート制限・NG ワード・承認が要るが、
 * この DB は一度容量超過で移設しているので、行数が読めない書き込み口を
 * 増やさない方針にした。
 *
 * user_id は返さない。返すと「同じ人が別のページに何を書いたか」を
 * 突き合わせられてしまう。画面に要るのは表示名と本文と日付だけ。
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const topicKey = searchParams.get("topicKey");

    if (!isValidTopicKey(topicKey)) {
      return NextResponse.json(
        { success: false, error: "投稿先のページが不正です。" },
        { status: 400 },
      );
    }

    const rows = await prisma.directionComment.findMany({
      where: { topic_key: topicKey, status: "published" },
      orderBy: { created_at: "desc" },
      take: COMMENTS_PAGE_SIZE,
      select: {
        id: true,
        display_name: true,
        body: true,
        created_at: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        body: r.body,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    // 表がまだ無いデプロイでも記事ページを壊さない。
    //
    // 表の作成は db-apply-sql ワークフローの手動実行で、コードのデプロイとは
    // 別に走る。順序はどちらが先でもよいが、コードが先に出た場合、記事
    // ページを開くたびに 500 が出る。読み手にとっては「投稿がまだ無い」のと
    // 区別がつかないので、空の一覧として返す。
    // （relocation/history が judgment 列で同じことをしている）
    if (isMissingTable(error)) {
      return NextResponse.json({ success: true, data: [] });
    }
    console.error("Failed to list comments:", error);
    return NextResponse.json(
      { success: false, error: "投稿を読み込めませんでした。" },
      { status: 500 },
    );
  }
}

/** direction_comments がまだ作られていない状態か。 */
function isMissingTable(error: unknown): boolean {
  const message = String(
    (error as { message?: unknown })?.message ?? error ?? "",
  );
  // Prisma は未知のテーブルを P2021、列の不足を P2022 で返す。
  const code = (error as { code?: unknown })?.code;
  return (
    code === "P2021" ||
    /direction_comments/i.test(message) ||
    /does not exist/i.test(message)
  );
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "投稿にはログインが必要です。" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "本文を入力してください。" },
        { status: 400 },
      );
    }

    const invalid = validateCommentInput({
      topicKey: (body as Record<string, unknown>).topicKey,
      body: (body as Record<string, unknown>).body,
    });
    if (invalid) {
      return NextResponse.json(
        { success: false, error: invalid.message },
        { status: 400 },
      );
    }

    // 連投の抑制。DB の容量を守るための上限で、荒らし対策そのものではない。
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayCount = await prisma.directionComment.count({
      where: { user_id: user.id, created_at: { gte: since } },
    });
    if (todayCount >= COMMENTS_PER_USER_PER_DAY) {
      return NextResponse.json(
        {
          success: false,
          error: `投稿は1日${COMMENTS_PER_USER_PER_DAY}件までです。時間をおいて試してください。`,
        },
        { status: 429 },
      );
    }

    // 表示名は投稿者に打たせない。打たせると他人の名前を騙れる。
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const profileName =
      (data.user?.user_metadata?.full_name as string | undefined) ??
      (data.user?.user_metadata?.name as string | undefined) ??
      null;

    const created = await prisma.directionComment.create({
      data: {
        topic_key: String((body as Record<string, unknown>).topicKey),
        user_id: user.id,
        display_name: displayNameFor(profileName, user.email),
        body: String((body as Record<string, unknown>).body).trim(),
      },
      select: {
        id: true,
        display_name: true,
        body: true,
        created_at: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        displayName: created.display_name,
        body: created.body,
        createdAt: created.created_at,
      },
    });
  } catch (error) {
    if (isMissingTable(error)) {
      // 投稿は黙って捨てない。書いた内容が消えたと分かるようにする。
      return NextResponse.json(
        {
          success: false,
          error: "投稿機能の準備中です。しばらくしてから試してください。",
        },
        { status: 503 },
      );
    }
    console.error("Failed to create comment:", error);
    return NextResponse.json(
      { success: false, error: "投稿を保存できませんでした。" },
      { status: 500 },
    );
  }
}

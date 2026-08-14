import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { toLogMessage } from "@/lib/errorMessage";
import {
  normalizePostInput,
  validatePostInput,
  type PostInput,
} from "@/lib/blogAdmin";

/**
 * 管理画面のブログ記事 CRUD（1 件の取得・更新・削除）。
 *
 * 認可は一覧（../route.ts）と同じ denyUnlessAdmin。id は cuid で、
 * 存在しなければ 404。更新は全項目の置き換え（画面がフォーム全体を
 * 送ってくる）で、部分更新は持たない。口が 2 種類あると、どちらで
 * 保存されたかで結果が変わる。
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const { id } = await params;
  try {
    const post = await prisma.blogPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "記事が見つかりません。" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { post } });
  } catch (e) {
    console.error("記事の取得に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "記事を取得できませんでした。" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const { id } = await params;
  let body: PostInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON として読めませんでした。" },
      { status: 400 },
    );
  }

  const invalid = validatePostInput(body);
  if (invalid) {
    return NextResponse.json(
      { success: false, error: invalid },
      { status: 400 },
    );
  }

  const data = normalizePostInput(body);
  try {
    const updated = await prisma.blogPost.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: { post: updated } });
  } catch (e) {
    const message = toLogMessage(e);
    // P2025 = 更新対象が無い。id を打ち間違えたか、別の画面で消された。
    if (message.includes("P2025") || message.includes("No record was found")) {
      return NextResponse.json(
        { success: false, error: "記事が見つかりません。" },
        { status: 404 },
      );
    }
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, error: `slug「${data.slug}」は既に使われています。` },
        { status: 409 },
      );
    }
    console.error("記事の更新に失敗:", message);
    return NextResponse.json(
      { success: false, error: "記事を更新できませんでした。" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const { id } = await params;
  try {
    await prisma.blogPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = toLogMessage(e);
    if (message.includes("P2025") || message.includes("No record was found")) {
      return NextResponse.json(
        { success: false, error: "記事が見つかりません。" },
        { status: 404 },
      );
    }
    console.error("記事の削除に失敗:", message);
    return NextResponse.json(
      { success: false, error: "記事を削除できませんでした。" },
      { status: 500 },
    );
  }
}

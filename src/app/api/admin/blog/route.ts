import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { denyUnlessAdmin } from "@/lib/adminApi";
import { toLogMessage } from "@/lib/errorMessage";
import {
  normalizePostInput,
  validatePostInput,
  type PostInput,
} from "@/lib/blogAdmin";
import { getBlogPosts as getMarkdownBlogPosts } from "@/lib/blog";

/**
 * 管理画面のブログ記事 CRUD（一覧と新規作成）。
 *
 * 公開側（/blog）は blogStore が DB を読む。ここは書く側の口で、
 * middleware はページのパスしか見ないため、必ず denyUnlessAdmin を
 * 通す（/api/relocation/history が素通りだった前例がある）。
 *
 * 下書き（published=false）は公開側のクエリ（published: true）に
 * 掛からないので、保存した瞬間に何かが公開されることはない。
 *
 * ## 取り込まれていない記事も返す
 *
 * 記事の置き場は content/blog/*.md から DB へ移している途中で、**2 つの
 * 状態が同時に存在する**（blogStore の冒頭に経緯がある）。公開側は
 * DB が空なら Markdown に落ちるので読者には見えているが、**管理画面は
 * DB しか見ていなかった。**
 *
 * その結果、取り込みを流していない記事は一覧に出ず、編集もできない。
 * 実測で 14 本が Markdown だけの状態だった（最後の取り込みは 2026-08-14）。
 * 画面には何の断りも出ないので、「編集が機能していない」ようにしか
 * 見えない。実際に利用者からそう報告があった。
 *
 * **無い理由が分かるほうがよい**ので、Markdown にしか無い記事も
 * pendingImport として返し、画面で「未取り込み」と出す。編集はできない
 * （DB に行が無いので id が無い）ことも、そこで伝わる。
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  try {
    // 下書きも含めて全部。公開側と違い、管理画面は「出ていないもの」を
    // 見るための場所でもある。
    const posts = await prisma.blogPost.findMany({
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        category: true,
        tags: true,
        published: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
    // Markdown にしか無い記事。slug で突き合わせる。
    //
    // 読めなかったときは**空にして先へ進む**。一覧そのものは DB から
    // 取れているので、ここで 500 にすると編集できるはずの記事まで
    // 出なくなる。
    let pendingImport: { slug: string; title: string; publishedAt: string }[] =
      [];
    try {
      const inDb = new Set(posts.map((p) => p.slug));
      pendingImport = getMarkdownBlogPosts()
        .filter((p) => !inDb.has(p.slug))
        .map((p) => ({
          slug: p.slug,
          title: p.title,
          publishedAt: p.publishedAt,
        }));
    } catch (e) {
      console.warn("Markdown 側の一覧を読めなかった:", toLogMessage(e));
    }

    return NextResponse.json({
      success: true,
      data: { posts, pendingImport },
    });
  } catch (e) {
    console.error("記事一覧の取得に失敗:", toLogMessage(e));
    return NextResponse.json(
      { success: false, error: "記事一覧を取得できませんでした。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

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
    const created = await prisma.blogPost.create({ data });
    return NextResponse.json({ success: true, data: { post: created } });
  } catch (e) {
    // slug の一意制約に当たったときは、その旨を人が読める形で返す。
    const message = toLogMessage(e);
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, error: `slug「${data.slug}」は既に使われています。` },
        { status: 409 },
      );
    }
    console.error("記事の作成に失敗:", message);
    return NextResponse.json(
      { success: false, error: "記事を作成できませんでした。" },
      { status: 500 },
    );
  }
}

'use server'

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// 記事の削除
export async function deletePost(id: string) {
  await prisma.blogPost.delete({
    where: { id },
  });
  revalidatePath("/admin");
}

// 記事の作成
export async function createPost(formData: FormData) {
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const content = formData.get("content") as string;
  const published = formData.get("published") === "on";
  
  // 仮のユーザーID (本来はセッションから取得すべきですが、SchemaのUserとNextAuthのUserが紐付いていないため)
  // ここでは既存のユーザー、またはダミーユーザーを使用する必要があります。
  // Admin機能を作成する前に、PrismaのUserを作成しておく必要がありますが、
  // NextAuth (GithubProvider) は自動的に User を作成しません（Adapterを使っていないため）。
  // よって、今回は簡易的に「ユーザー紐付けなし」で進めるか、または「最初のユーザー」を取得して紐付けます。
  
  // Adapterなしの場合、NextAuthはJWTセッションのみで、DBにUserを作りません。
  // しかし BlogPost は authorId が必須です。
  // これを解決するには：
  // 1. PrismaAdapterを使う (推奨)
  // 2. 毎回固定のダミーユーザーIDを使う (非推奨だが楽)
  
  // ここでは「最初のユーザー」を検索して、いなければ作る、という処理を入れます。
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "admin@example.com", // ダミー
        name: "Admin",
      }
    });
  }

  await prisma.blogPost.create({
    data: {
      title,
      slug,
      content,
      published,
      tags: "[]", // 今は空
      authorId: user.id,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/blog");
  redirect("/admin");
}

// 記事の更新
export async function updatePost(id: string, formData: FormData) {
  const title = formData.get("title") as string;
  const slug = formData.get("slug") as string;
  const content = formData.get("content") as string;
  const published = formData.get("published") === "on";

  await prisma.blogPost.update({
    where: { id },
    data: {
      title,
      slug,
      content,
      published,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/blog");
  redirect("/admin");
}

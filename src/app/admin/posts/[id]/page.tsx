import { prisma } from "@/lib/prisma";
import PostForm from "../_components/PostForm";
import { updatePost } from "../../actions";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id } });

  if (!post) return notFound();

  // Bind ID to update action
  const updateAction = updatePost.bind(null, id);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Edit Post</h1>
      <PostForm post={post} action={updateAction} />
    </div>
  );
}

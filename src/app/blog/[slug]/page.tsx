import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/formatDate';
import { notFound } from 'next/navigation';
import { remark } from 'remark';
import html from 'remark-html';

export const dynamic = 'force-dynamic';

async function getPost(slug: string) {
  const post = await prisma.blogPost.findUnique({
    where: { slug },
  });
  return post;
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <h1>Debug: Post not found</h1>
        <p>Slug: {slug}</p>
      </div>
    );
  }
  
  if (!post.published) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <h1>Debug: Post is not published</h1>
      </div>
    );
  }

  // MarkdownをHTMLに変換
  const processedContent = await remark()
    .use(html)
    .process(post.content);
  const contentHtml = processedContent.toString();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <article className="max-w-3xl mx-auto bg-gray-800 rounded-lg p-8 shadow-xl border border-gray-700">
        <header className="mb-8 border-b border-gray-700 pb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-indigo-400">
            {post.title}
          </h1>
          <div className="flex items-center text-gray-400">
            <time dateTime={post.publishedAt.toISOString()}>
              {formatDate(post.publishedAt.toISOString())}
            </time>
          </div>
        </header>

        <div 
          className="prose prose-invert max-w-none prose-headings:text-indigo-300 prose-a:text-indigo-400"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </article>
    </div>
  );
}

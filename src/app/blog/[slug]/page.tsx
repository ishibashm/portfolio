import { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/formatDate';
import { remark } from 'remark';
import html from 'remark-html';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.excerpt || post.content.substring(0, 100),
    openGraph: {
      title: post.title,
      description: post.excerpt || post.content.substring(0, 100),
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
    },
  };
}

async function getPost(slug: string) {
  if (!prisma) return null;
  try {
    const post = await prisma.blogPost.findUnique({
      where: { slug },
    });
    return post;
  } catch (error) {
    console.error('Error fetching post:', error);
    return null;
  }
}

async function processMarkdown(content: string): Promise<string> {
  try {
    const processedContent = await remark()
      .use(html)
      .process(content);
    return processedContent.toString();
  } catch (error) {
    console.error('Error processing markdown:', error);
    return content;
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-red-400">Post Not Found</h1>
          <Link href="/blog" className="text-gray-400 hover:text-white underline">Back to Blog</Link>
        </div>
      </div>
    );
  }

  if (!post.published) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-yellow-400">Post Not Published</h1>
          <Link href="/blog" className="text-gray-400 hover:text-white underline">Back to Blog</Link>
        </div>
      </div>
    );
  }

  // Markdown変換を実行
  const contentHtml = await processMarkdown(post.content);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <article className="max-w-3xl mx-auto">
        <header className="mb-12 border-b border-white/10 pb-8">
          <Link href="/blog" className="text-purple-400 hover:text-purple-300 text-sm font-medium mb-6 inline-block transition-colors">
            ← Back to Blog
          </Link>

          <h1 className="text-3xl md:text-5xl font-bold mb-6 leading-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            {post.title}
          </h1>

          <div className="flex items-center text-gray-400 text-sm font-mono">
            <time dateTime={post.publishedAt.toISOString()}>
              {formatDate(post.publishedAt.toISOString())}
            </time>
            <span className="mx-2">•</span>
            <span>Article</span>
          </div>
        </header>

        <div
          className="blog-content prose prose-invert prose-lg max-w-none text-gray-300 prose-headings:text-white prose-a:text-purple-400 prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-purple-400 prose-blockquote:bg-white/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg prose-pre:bg-gray-900 prose-pre:border prose-pre:border-white/10"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        <div className="mt-16 pt-8 border-t border-white/10 flex justify-between items-center">
          <Link href="/blog" className="text-gray-400 hover:text-white transition-colors">
            View all posts
          </Link>
          {/* Share buttons could go here */}
        </div>
      </article>
    </div>
  );
}

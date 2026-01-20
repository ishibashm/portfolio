import { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/formatDate';
import { remark } from 'remark';
import html from 'remark-html';

// export const dynamic = 'force-dynamic'; // ISR/SSGを使用するため削除

export async function generateStaticParams() {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true },
    });

    return posts.map((post) => ({
      slug: post.slug,
    }));
  } catch (error) {
    console.error('Error in generateStaticParams:', error);
    return [];
  }
}

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
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-3xl mx-auto bg-gray-800 rounded-lg p-8 shadow-xl border border-gray-700">
          <h1 className="text-3xl font-bold mb-4 text-red-400">記事が見つかりません</h1>
          <p className="text-gray-400 mb-4">Slug: {slug}</p>
          <p className="text-gray-500 text-sm">この記事は存在しないか、削除された可能性があります。</p>
        </div>
      </div>
    );
  }

  if (!post.published) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-3xl mx-auto bg-gray-800 rounded-lg p-8 shadow-xl border border-gray-700">
          <h1 className="text-3xl font-bold mb-4 text-yellow-400">記事は公開されていません</h1>
          <p className="text-gray-400">この記事はまだ公開されていません。</p>
        </div>
      </div>
    );
  }

  // Markdown変換を実行
  const contentHtml = await processMarkdown(post.content);

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
          className="blog-content prose prose-invert prose-lg max-w-none text-gray-300"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </article>
    </div>
  );
}

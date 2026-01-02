import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/formatDate';

export const dynamic = 'force-dynamic';

// データベースから記事一覧を取得
async function getPosts() {
  const posts = await prisma.blogPost.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
  });
  return posts;
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 text-indigo-400">Blog</h1>
          <p className="text-gray-400">Thoughts, tutorials, and updates.</p>
        </header>

        <div className="grid gap-8 md:grid-cols-2">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="block group">
              <article className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-xl transition-all border border-gray-700 hover:border-indigo-500">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4 text-sm text-gray-400">
                    <time dateTime={post.publishedAt.toISOString()}>
                      {formatDate(post.publishedAt.toISOString())}
                    </time>
                    {post.tags && (
                      <span className="bg-gray-700 px-2 py-1 rounded text-xs">
                        {/* 簡易的なタグ表示 */}
                        Tags
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-semibold mb-2 group-hover:text-indigo-400 transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-gray-400 line-clamp-3">
                    {post.excerpt || post.content.substring(0, 100)}...
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </div>
        
        {posts.length === 0 && (
            <div className="text-center py-20 text-gray-500">
                No posts found.
            </div>
        )}
      </div>
    </div>
  );
}

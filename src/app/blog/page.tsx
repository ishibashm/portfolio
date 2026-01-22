import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/formatDate';
import { BlogPost } from '@prisma/client';

export const dynamic = 'force-dynamic';

// データベースから記事一覧を取得
async function getPosts() {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
    });
    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Blog
          </h1>
          <p className="text-xl text-gray-400">Thoughts, tutorials, and updates.</p>
        </header>

        <div className="grid gap-8 md:grid-cols-2">
          {posts.map((post: BlogPost) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="block group">
              <article className="h-full bg-gray-900 border border-white/10 rounded-2xl overflow-hidden hover:border-purple-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/10 hover:-translate-y-1">
                <div className="p-8">
                  <div className="flex justify-between items-center mb-6 text-sm text-gray-400">
                    <time dateTime={post.publishedAt.toISOString()} className="font-mono text-purple-400">
                      {formatDate(post.publishedAt.toISOString())}
                    </time>
                    {/* Tags could go here */}
                  </div>
                  <h2 className="text-2xl font-bold mb-4 group-hover:text-purple-400 transition-colors leading-tight">
                    {post.title}
                  </h2>
                  <p className="text-gray-400 leading-relaxed line-clamp-3 mb-6">
                    {post.excerpt || post.content.substring(0, 100)}...
                  </p>
                  <div className="flex items-center text-purple-400 text-sm font-medium">
                    Read More <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-white/5">
            <p className="text-gray-500 text-lg">No posts found yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/utils/formatDate';
import { BlogPost } from '@prisma/client';

export const dynamic = 'force-dynamic';

// データベースから記事一覧を取得
async function getPosts() {
  if (!prisma) return { error: 'Prisma Client not initialized' };
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
    });
    return { posts };
  } catch (error: any) {
    console.error('Error fetching posts:', error);
    return { error: error.message || 'Unknown error' };
  }
}

export default async function BlogPage() {
  const result = await getPosts();

  if (result.error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 flex items-center justify-center">
        <div className="text-center p-8 border border-red-500/30 rounded-2xl bg-red-950/30 backdrop-blur-md max-w-2xl shadow-2xl">
          <h2 className="text-2xl font-bold text-red-400 mb-4 tracking-tight">System Status: Offline</h2>
          <p className="text-slate-400 mb-6">
            Database connection failed.
          </p>
          <div className="bg-black/40 p-4 rounded-lg text-left overflow-auto text-xs font-mono text-red-300 border border-red-500/10">
            {result.error}
          </div>
        </div>
      </div>
    );
  }

  const posts = result.posts || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12 font-sans selection:bg-indigo-500/30">
      {/* Background Gradient Orbs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <div className="max-w-6xl mx-auto">
        <header className="mb-20 pt-10 text-center relative">
          <div className="inline-block mb-4 px-3 py-1 bg-white/5 backdrop-blur-xl rounded-full border border-white/10 text-xs font-medium text-indigo-300 tracking-wider uppercase">
            Engineering & Design
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-br from-white via-slate-200 to-slate-500 bg-clip-text text-transparent tracking-tight">
            Journal
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-light">
            Insights on development, design systems, and the journey of building software.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post: BlogPost) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="block group h-full">
              <article className="h-full bg-white/5 backdrop-blur-sm border border-white/5 rounded-3xl overflow-hidden hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-2 flex flex-col">
                <div className="p-8 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-6 text-xs font-medium uppercase tracking-widest text-slate-500 group-hover:text-indigo-400 transition-colors">
                    <time dateTime={post.publishedAt.toISOString()}>
                      {formatDate(post.publishedAt.toISOString())}
                    </time>
                    <div className="flex gap-2">
                      {/* Tags simple visual */}
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    </div>
                  </div>

                  <h2 className="text-2xl font-bold mb-4 text-slate-100 group-hover:text-white transition-colors leading-snug">
                    {post.title}
                  </h2>

                  <p className="text-slate-400 leading-relaxed line-clamp-3 mb-8 flex-grow">
                    {post.excerpt || post.content.substring(0, 120)}...
                  </p>

                  <div className="flex items-center text-indigo-400 text-sm font-semibold mt-auto pt-6 border-t border-white/5 group-hover:border-white/10 transition-colors">
                    Read Article
                    <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-32 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-sm">
            <p className="text-slate-400 text-lg">Void. No signals detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}

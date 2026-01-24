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
  if (!prisma) throw new Error("Prisma client is not initialized");
  try {
    const post = await prisma.blogPost.findUnique({
      where: { slug },
    });
    return post;
  } catch (error) {
    console.error('Error fetching post:', error);
    throw error;
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
  let post;

  try {
    post = await getPost(slug);
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 flex items-center justify-center">
        <div className="text-center p-12 border border-red-500/30 rounded-3xl bg-red-950/20 backdrop-blur-lg max-w-2xl shadow-2xl">
          <div className="inline-block p-3 rounded-full bg-red-500/20 mb-6 text-red-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-3xl font-bold text-slate-100 mb-4">System Error</h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            We encountered a critical failure while retrieving this artifact.
          </p>
          <div className="bg-black/40 p-6 rounded-xl text-left overflow-auto text-xs font-mono text-red-300 border border-red-500/10 mb-8 max-h-64 shadow-inner">
            {error.message || String(error)}
          </div>
          <div>
            <Link href="/blog" className="px-8 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all shadow-lg hover:shadow-slate-500/20">
              Return to Safety
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-black mb-6 text-slate-800 tracking-tighter">404</h1>
          <h2 className="text-2xl font-bold mb-8 text-slate-200">Artifact Not Found</h2>
          <Link href="/blog" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 decoration-1">
            Browse all entries
          </Link>
        </div>
      </div>
    );
  }

  if (!post.published) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block px-4 py-2 bg-yellow-900/30 text-yellow-400 rounded-full text-sm font-medium border border-yellow-700/50 mb-6">
            Draft Mode
          </div>
          <h1 className="text-3xl font-bold mb-4 text-slate-200">Content Unpublished</h1>
          <Link href="/blog" className="text-slate-500 hover:text-white transition-colors">Back to Blog</Link>
        </div>
      </div>
    );
  }

  // Markdown変換を実行
  const contentHtml = await processMarkdown(post.content);
  // Parse tags safely
  let tags: string[] = [];
  try {
    tags = post.tags ? JSON.parse(post.tags) : [];
  } catch (e) {
    tags = [];
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12 font-sans selection:bg-indigo-500/30">
      {/* Background Gradient Orbs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[10%] right-[0%] w-[50%] h-[50%] bg-indigo-900/10 rounded-full blur-[150px] animate-pulse" />
      </div>

      <article className="max-w-3xl mx-auto">
        <header className="mb-16 pt-10 text-center">
          <Link href="/blog" className="inline-flex items-center text-slate-500 hover:text-indigo-400 text-sm font-medium mb-10 transition-colors group">
            <svg className="w-4 h-4 mr-2 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Journal
          </Link>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {tags.map((tag: string) => (
              <span key={tag} className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-medium text-indigo-300">
                {tag}
              </span>
            ))}
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-8 leading-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            {post.title}
          </h1>

          <div className="flex items-center justify-center text-slate-400 text-sm font-mono tracking-wide border-y border-white/5 py-6">
            <time dateTime={post.publishedAt.toISOString()}>
              {formatDate(post.publishedAt.toISOString())}
            </time>
          </div>
        </header>

        <div className="bg-white/5 backdrop-blur-sm border border-white/5 rounded-[2rem] p-8 md:p-12 shadow-2xl">
          <div
            className="blog-content prose prose-invert prose-lg max-w-none 
                prose-headings:text-slate-100 prose-headings:font-bold prose-headings:tracking-tight
                prose-p:text-slate-300 prose-p:leading-8
                prose-a:text-indigo-400 prose-a:font-semibold prose-a:no-underline hover:prose-a:underline
                prose-strong:text-white prose-strong:font-bold
                prose-code:text-indigo-200 prose-code:bg-indigo-950/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-900 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl
                prose-blockquote:border-l-indigo-500 prose-blockquote:bg-indigo-950/20 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:rounded-r-xl prose-blockquote:text-indigo-100
                prose-li:text-slate-300
                "
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>

        <div className="mt-20 pt-12 border-t border-white/5 text-center">
          <p className="text-slate-500 italic mb-8">Thank you for reading.</p>
          <Link href="/blog" className="btn-secondary px-8 py-4 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium border border-white/10 transition-all">
            Read Next Article
          </Link>
        </div>
      </article>
    </div>
  );
}

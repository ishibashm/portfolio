import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { portfolios } from '@/lib/portfolios';
import Link from 'next/link';
import Image from 'next/image';

export async function generateStaticParams() {
    return portfolios.map((portfolio) => ({
        slug: portfolio.slug,
    }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const portfolio = portfolios.find((p) => p.slug === slug);

    if (!portfolio) {
        return {
            title: 'Project Not Found',
        };
    }

    return {
        title: portfolio.title,
        description: portfolio.description,
        openGraph: {
            title: portfolio.title,
            description: portfolio.description,
            type: 'article',
        }
    };
}

export default async function PortfolioDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const portfolio = portfolios.find((p) => p.slug === slug);

    if (!portfolio) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <article className="max-w-5xl mx-auto">
                <header className="mb-16">
                    <Link href="/portfolio" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mb-8 inline-block transition-colors">
                        ← Back to Portfolio
                    </Link>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            {portfolio.title}
                        </h1>
                        <div className="flex gap-4">
                            {/* Demo/Repo links could go here */}
                            {/* <a href="#" className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors">Live Demo</a> */}
                        </div>
                    </div>

                    <p className="text-xl text-gray-300 mb-8 max-w-3xl leading-relaxed">{portfolio.description}</p>

                    <div className="flex flex-wrap gap-2 text-sm">
                        {portfolio.tags.map(tag => (
                            <span key={tag} className="px-4 py-1.5 bg-white/5 rounded-full border border-white/10 text-gray-300">
                                {tag}
                            </span>
                        ))}
                    </div>
                </header>

                {/* Hero Image */}
                <div className="aspect-video bg-gray-900 rounded-2xl mb-16 overflow-hidden border border-white/10 shadow-2xl relative group">
                    <Image
                        src={portfolio.image}
                        alt={portfolio.title}
                        fill
                        className="object-cover"
                        priority
                        unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent z-10 pointer-events-none"></div>
                </div>

                {/* Content */}
                <div
                    className="prose prose-invert prose-lg max-w-none prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white"
                    dangerouslySetInnerHTML={{ __html: portfolio.content }}
                />

                <div className="mt-20 pt-10 border-t border-white/10 flex justify-between">
                    <Link href="/portfolio" className="text-gray-500 hover:text-white transition-colors">
                        View other projects
                    </Link>
                </div>
            </article>
        </div>
    );
}

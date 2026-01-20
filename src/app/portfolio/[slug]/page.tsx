import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { portfolios } from '@/lib/portfolios';
import Link from 'next/link';

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
            <article className="max-w-4xl mx-auto">
                <header className="mb-12">
                    <Link href="/portfolio" className="text-gray-400 hover:text-white mb-8 inline-block">
                        ← Back to Portfolio
                    </Link>
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 text-purple-400">
                        {portfolio.title}
                    </h1>
                    <p className="text-xl text-gray-300 mb-6">{portfolio.description}</p>
                    <div className="flex flex-wrap gap-2 text-sm">
                        {portfolio.tags.map(tag => (
                            <span key={tag} className="px-3 py-1 bg-gray-800 rounded-full border border-gray-700">
                                {tag}
                            </span>
                        ))}
                    </div>
                </header>

                {/* Image Placeholder */}
                <div className="aspect-video bg-gray-800 rounded-xl mb-12 flex items-center justify-center text-gray-500">
                    Image: {portfolio.image}
                </div>

                {/* Content */}
                <div
                    className="prose prose-invert prose-lg max-w-none"
                    dangerouslySetInnerHTML={{ __html: portfolio.content }}
                />
            </article>
        </div>
    );
}

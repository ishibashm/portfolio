// src/app/portfolio/page.tsx
import Link from 'next/link';
import { portfolios } from '@/lib/portfolios';

export const metadata = {
  title: 'Portfolio',
  description: 'Selected works and experiments.',
};

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4 text-purple-400">Portfolio</h1>
          <p className="text-gray-400">Selected works and experiments.</p>
        </header>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((project) => (
            <Link key={project.id} href={`/portfolio/${project.slug}`} className="block group">
              <article className="bg-gray-900 rounded-xl overflow-hidden hover:transform hover:-translate-y-1 transition-all duration-300 shadow-lg hover:shadow-purple-500/20">
                <div className="aspect-video bg-gray-800 relative">
                  {/* 画像があればここにImageコンポーネント */}
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                    Image Placeholder
                  </div>
                </div>
                <div className="p-6">
                  <h2 className="text-xl font-bold mb-2 group-hover:text-purple-400 transition-colors">
                    {project.title}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {project.description}
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
